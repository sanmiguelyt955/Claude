import { getGeminiClient } from './client.js'
import { uploadAndWaitActive } from './upload.js'
import { ANALYSIS_JSON_SCHEMA, buildAnalysisPrompt, buildWindowAnalysisPrompt, type AnalysisResult } from './schema.js'
import { estimateCostUsd } from './cost.js'
import type { ProcessingMode, TokenUsage, VideoSource } from './types.js'

// A gapless, second-by-second-granularity transcript + scene breakdown for
// even a short video produces far more output than a sparse summary would —
// the model's default output cap (often ~8192 tokens) truncates that
// mid-JSON, which fails to parse. 65536 is the standard ceiling for the
// Gemini 3.x Flash family; set explicitly rather than relying on whatever
// the model's own default happens to be.
const MAX_OUTPUT_TOKENS = 65536

/**
 * Agentic processing drives the model through dozens of tool-call steps on a
 * long video, and it can simply never come back — observed live: a single
 * 11-minute video sat in agentic mode for over half an hour with no result
 * and no error, blocking the worker the whole time. Static mode is the
 * proven fallback, so cap the wait rather than hanging forever.
 */
const AGENTIC_TIMEOUT_MS = Number(process.env.GEMINI_AGENTIC_TIMEOUT_MS ?? 8 * 60 * 1000)

/**
 * STATIC mode was assumed to always respond quickly or fail fast — the
 * comment above only warned about agentic. Observed live: a static call to
 * gemini-3.6-flash sat for 5+ minutes with no error and no response, during
 * the same window where sibling models were returning fast 503s. STATIC
 * isn't immune to hanging, it is just less likely to — worth the same cap.
 */
const STATIC_TIMEOUT_MS = Number(process.env.GEMINI_STATIC_TIMEOUT_MS ?? 4 * 60 * 1000)

/**
 * Second-by-second audio description (CLAUDE.md's accessibility bar: every
 * frame narrated as if for a blind viewer) produces far more output per
 * second of video than a sparse summary ever did — a video longer than
 * WINDOW_THRESHOLD_SECONDS would blow past MAX_OUTPUT_TOKENS in one call, so
 * it gets cut into WINDOW_SECONDS-sized slices instead, each analyzed with
 * its own Gemini call via `videoMetadata.startOffset/endOffset` on the SAME
 * upload (see analyzeVideoWindowed). This trades daily quota for coverage on
 * purpose: a video that used to cost 1 request can now cost 5-15 — real,
 * confirmed with the account owner before this was written.
 *
 * Lowered from 90 to 45 when the scene schema moved from "1-4 seconds per
 * entry" to "exactly one entry per second, never merged" — that change
 * removed the model's only way to keep output compact (bundling a held shot
 * into one entry), so the same window now produces noticeably more JSON per
 * second of footage. 45s keeps a comfortable margin under MAX_OUTPUT_TOKENS
 * even for a dense, dialogue-heavy fragment.
 */
const WINDOW_SECONDS = Number(process.env.GEMINI_WINDOW_SECONDS ?? 45)
const WINDOW_THRESHOLD_SECONDS = Number(process.env.GEMINI_WINDOW_THRESHOLD_SECONDS ?? 110)
/** Higher than generateContent's default 1.0 fps so the model actually has enough
 * frames to narrate 1-4 second scenes accurately instead of interpolating. */
const WINDOW_FPS = Number(process.env.GEMINI_WINDOW_FPS ?? 2)
/** Google's free tier caps requests per minute (5, per quota.ts's MAX_RPM) —
 * spacing consecutive window calls keeps a single video's own windows from
 * tripping that limit on their own. */
const WINDOW_CALL_DELAY_MS = Number(process.env.GEMINI_WINDOW_CALL_DELAY_MS ?? 13_000)

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} supero el limite de ${Math.round(ms / 1000)}s sin responder.`)), ms),
    ),
  ])
}

/**
 * A single non-windowed call (short video, or any call that is not one
 * window of a long one) has no partial-progress signal, so `current`/`total`
 * are omitted and the UI falls back to an indeterminate indicator for that
 * phase. A windowed video's per-window notifications DO carry them — `total`
 * is the window count, `current` is how many windows are already committed
 * to WindowState — which is what turns the progress bar from indeterminate
 * into a real percentage-plus-ETA display, like a download progress bar.
 */
export type ProgressUpdate = { label: string; current?: number; total?: number }

export type AnalyzeVideoInput = {
  /** Models to try in order. Google's daily cap is per model, so a 429 on the
   * first one means "use the next", not "come back tomorrow". */
  models: string[]
  processing: ProcessingMode
  source: VideoSource
  /** Real length of the video, in seconds. Pinned into the prompt so the model
   * cannot invent a timeline past the end — see buildAnalysisPrompt. */
  durationSeconds?: number | null
  onProgress?: (progress: ProgressUpdate) => void
}

export type AnalyzeVideoOutput = {
  result: AnalysisResult
  usage: TokenUsage
  /** May differ from the requested mode if agentic failed and it fell back. */
  processingModeUsed: ProcessingMode
  /** Which model actually produced this, after any out-of-quota switches. */
  modelUsed: string
  /** Models skipped because they were out of daily quota, for the cost log.
   * requestCount is the real number of calls THAT model made before giving
   * up (1 normally; can be >1 for a windowed video that failed partway). */
  exhaustedModels: Array<{ model: string; error: string; requestCount: number }>
  /** Kept for analysis_runs.raw_response_path — debugging a bad parse. */
  rawResponseText: string
  /** Real Gemini requests this analysis actually made against the model's
   * daily quota — 1 normally, or the window count when the video was long
   * enough to be split (see WINDOW_THRESHOLD_SECONDS). The caller must log
   * this as analysis_runs.request_count, not a hardcoded 1, or the quota
   * counter silently under-counts every windowed video. */
  requestCount: number
}

/** True for Google's "you ran out of daily requests for this model" (429). */
export function isQuotaExhaustedError(error: unknown): boolean {
  const message = (error as Error)?.message ?? ''
  return message.includes('RESOURCE_EXHAUSTED') || message.includes('"code":429')
}

/**
 * True for a model Google has permanently retired — confirmed live: Gemini
 * 2.5 Flash and 2.5 Flash Lite both return `"code":404` with "no longer
 * available to new users". Retrying this on the same model wastes a request
 * that can never succeed; the only correct move is the next model.
 */
export function isModelRetiredError(error: unknown): boolean {
  const message = (error as Error)?.message ?? ''
  return message.includes('"code":404') && message.includes('no longer available')
}

/**
 * True for Google's "this model is overloaded right now" (503 UNAVAILABLE,
 * "high demand"). Confirmed live during a real outage: retrying the SAME
 * model after a delay never once succeeded while the outage lasted — every
 * sibling model was down too, so the 13s wait bought nothing and just made
 * the rotation twice as slow. A model-wide outage calls for switching models
 * immediately, not waiting on the one that just said it is overloaded.
 */
export function isOverloadedError(error: unknown): boolean {
  const message = (error as Error)?.message ?? ''
  return message.includes('"code":503') && message.includes('UNAVAILABLE')
}

/** Strips a ```json ... ``` fence if the model wrapped the JSON in one anyway. */
function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  return fenced?.[1] ?? text
}

function parseAnalysisResult(text: string): AnalysisResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripCodeFence(text.trim()))
  } catch {
    throw new Error('Gemini no devolvio JSON valido.')
  }
  const candidate = parsed as Partial<AnalysisResult>
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    !candidate.summary ||
    !Array.isArray(candidate.scenes) ||
    !Array.isArray(candidate.transcript) ||
    !Array.isArray(candidate.elements)
  ) {
    throw new Error('La respuesta de Gemini no tiene la forma esperada (summary/scenes/transcript/elements).')
  }
  return candidate as AnalysisResult
}

function usageFromInteraction(usage: {
  total_input_tokens?: number
  total_output_tokens?: number
  total_cached_tokens?: number
  total_thought_tokens?: number
}): TokenUsage {
  const inputTokens = usage.total_input_tokens ?? 0
  const outputTokens = usage.total_output_tokens ?? 0
  const cachedTokens = usage.total_cached_tokens ?? 0
  const thoughtTokens = usage.total_thought_tokens ?? 0
  return {
    inputTokens,
    outputTokens,
    cachedTokens,
    thoughtTokens,
    estimatedCostUsd: estimateCostUsd({ inputTokens, outputTokens, cachedTokens, thoughtTokens }),
  }
}

function usageFromGenerateContent(usage: {
  promptTokenCount?: number
  candidatesTokenCount?: number
  cachedContentTokenCount?: number
  thoughtsTokenCount?: number
}): TokenUsage {
  const inputTokens = usage.promptTokenCount ?? 0
  const outputTokens = usage.candidatesTokenCount ?? 0
  const cachedTokens = usage.cachedContentTokenCount ?? 0
  const thoughtTokens = usage.thoughtsTokenCount ?? 0
  return {
    inputTokens,
    outputTokens,
    cachedTokens,
    thoughtTokens,
    estimatedCostUsd: estimateCostUsd({ inputTokens, outputTokens, cachedTokens, thoughtTokens }),
  }
}

/** Resolves a VideoSource into the {uri, mimeType} a Gemini request needs. */
async function resolveVideoUri(source: VideoSource): Promise<{ uri: string; mimeType?: string }> {
  if (source.kind === 'youtube') return { uri: source.url }
  return uploadAndWaitActive(source.path, source.mimeType)
}

async function tryAgentic(
  model: string,
  uri: string,
  mimeType: string | undefined,
  prompt: string,
): Promise<{ result: AnalysisResult; usage: TokenUsage; rawResponseText: string }> {
  const ai = getGeminiClient()
  const interaction = await ai.interactions.create({
    model,
    input: [
      { type: 'video', uri, mime_type: mimeType, processing: 'agentic' },
      { type: 'text', text: prompt },
    ],
    response_format: { type: 'text', mime_type: 'application/json', schema: ANALYSIS_JSON_SCHEMA },
    generation_config: { max_output_tokens: MAX_OUTPUT_TOKENS },
  })

  if (interaction.status !== 'completed' || !interaction.output_text) {
    const detail = interaction.errors?.map((e) => e.message).join('; ') ?? interaction.status
    throw new Error(`El modo agentic no completo el analisis (status: ${detail}).`)
  }

  return {
    result: parseAnalysisResult(interaction.output_text),
    usage: usageFromInteraction(interaction.usage ?? {}),
    rawResponseText: interaction.output_text,
  }
}

async function runStatic(
  model: string,
  uri: string,
  mimeType: string | undefined,
  prompt: string,
): Promise<{ result: AnalysisResult; usage: TokenUsage; rawResponseText: string }> {
  const ai = getGeminiClient()
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [{ fileData: { fileUri: uri, mimeType } }, { text: prompt }],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: ANALYSIS_JSON_SCHEMA,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  })

  if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    throw new Error(
      `Gemini corto la respuesta por exceder el limite de ${MAX_OUTPUT_TOKENS} tokens de salida — el JSON quedo incompleto.`,
    )
  }

  const text = response.text
  if (!text) throw new Error('Gemini (modo static) no devolvio texto.')

  return {
    result: parseAnalysisResult(text),
    usage: usageFromGenerateContent(response.usageMetadata ?? {}),
    rawResponseText: text,
  }
}

/**
 * Same call as runStatic, but clipped to [startSeconds, endSeconds) of the
 * SAME upload via Gemini's `videoMetadata.startOffset/endOffset` — no
 * re-upload needed. `fps` is raised above generateContent's 1.0 default so
 * the model has enough frames to narrate 1-4 second scenes instead of
 * guessing between sparse samples.
 */
async function runStaticWindow(
  model: string,
  uri: string,
  mimeType: string | undefined,
  prompt: string,
  startSeconds: number,
  endSeconds: number,
): Promise<{ result: AnalysisResult; usage: TokenUsage; rawResponseText: string }> {
  const ai = getGeminiClient()
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            fileData: { fileUri: uri, mimeType },
            videoMetadata: { startOffset: `${startSeconds}s`, endOffset: `${endSeconds}s`, fps: WINDOW_FPS },
          },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: ANALYSIS_JSON_SCHEMA,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  })

  if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    throw new Error(
      `Gemini corto la respuesta de la ventana [${startSeconds}-${endSeconds}s] por exceder ${MAX_OUTPUT_TOKENS} tokens de salida.`,
    )
  }

  const text = response.text
  if (!text) throw new Error(`Gemini (ventana ${startSeconds}-${endSeconds}s) no devolvio texto.`)

  return {
    result: parseAnalysisResult(text),
    usage: usageFromGenerateContent(response.usageMetadata ?? {}),
    rawResponseText: text,
  }
}

/** [start, end) boundaries covering [0, durationSeconds) in WINDOW_SECONDS slices. */
function planWindows(durationSeconds: number): Array<{ start: number; end: number }> {
  const windows: Array<{ start: number; end: number }> = []
  for (let start = 0; start < durationSeconds; start += WINDOW_SECONDS) {
    windows.push({ start, end: Math.min(start + WINDOW_SECONDS, durationSeconds) })
  }
  return windows
}

/**
 * Everything accumulated across windows SO FAR, threaded through the model
 * rotation loop so a model change never throws away completed work. Before
 * this existed, a video whose model failed on window 5 of 8 would have its
 * next model restart at window 1 — observed live, twice, during a Google
 * outage: 4 already-paid-for windows discarded each time a model went down.
 */
type WindowState = {
  scenes: AnalysisResult['scenes']
  transcript: AnalysisResult['transcript']
  elements: AnalysisResult['elements']
  summaries: AnalysisResult['summary'][]
  rawTexts: string[]
  usage: TokenUsage
  /** Index of the first window NOT yet completed by any model. */
  nextWindowIndex: number
}

function emptyWindowState(): WindowState {
  return {
    scenes: [],
    transcript: [],
    elements: [],
    summaries: [],
    rawTexts: [],
    usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, thoughtTokens: 0, estimatedCostUsd: 0 },
    nextWindowIndex: 0,
  }
}

/** Thrown when a model exhausts its retry mid-video — carries whatever this
 * model itself completed (state.nextWindowIndex has already moved past
 * windows earlier models finished) so the caller can hand the SAME state to
 * the next model instead of starting over. */
class WindowedAnalysisError extends Error {
  constructor(
    message: string,
    public readonly state: WindowState,
    /** Real requests THIS model made (successes + failed attempts, retries
     * included) before giving up — for an accurate per-model quota log. */
    public readonly requestsSpentByThisModel: number,
  ) {
    super(message)
  }
}

/** Assembles the final AnalysisResult from every window collected across
 * however many models it took — re-indexed and summary-merged once, here,
 * rather than on every partial failure. */
function finalizeWindowState(state: WindowState): AnalysisResult {
  state.scenes.forEach((s, idx) => (s.index = idx))
  state.transcript.forEach((t, idx) => (t.index = idx))

  // No per-window resummarization call (that would spend one of the same
  // model's daily requests just to re-describe what is already in the JSON):
  // the first window's summary usually IS the video's intro/framing, so it
  // stands in for short_summary, while full_summary and topics are merged
  // deterministically across every window.
  const topics = [...new Set(state.summaries.flatMap((s) => s.topics))]
  const language = state.summaries.find((s) => s.language)?.language ?? state.summaries[0]?.language ?? ''
  const fullSummary = state.summaries.map((s, idx) => `[Tramo ${idx + 1}] ${s.full_summary}`).join('\n\n')

  return {
    summary: { short_summary: state.summaries[0]?.short_summary ?? '', full_summary: fullSummary, topics, language },
    scenes: state.scenes,
    transcript: state.transcript,
    elements: state.elements,
  }
}

/**
 * Runs whichever windows `state.nextWindowIndex` says are still pending, all
 * with ONE model (STATIC only — agentic already navigates a whole video on
 * its own and does not accept a clip range). Each slice's JSON comes back
 * with its OWN 0-based timeline (see buildWindowAnalysisPrompt for why), so
 * this shifts every timestamp by the slice's real start before merging —
 * arithmetic done here, never trusted to the model, is what keeps a
 * multi-window video's final timeline from drifting the way un-pinned
 * durations used to (see buildAnalysisPrompt's own history).
 *
 * Mutates `state` in place as each window completes, so a caller catching
 * the thrown WindowedAnalysisError still has every window THIS call finished
 * before the one that failed.
 */
async function runWindowsWithModel(
  model: string,
  uri: string,
  mimeType: string | undefined,
  windows: Array<{ start: number; end: number }>,
  durationSeconds: number,
  state: WindowState,
  notify: (progress: ProgressUpdate) => void,
): Promise<number> {
  // Every real call this model makes counts here, success or failure,
  // including a window's internal retry — so the winning model's own
  // request_count reflects calls it actually spent, not just windows it
  // completed (a window that needed 1 retry to succeed still cost 2 calls).
  let requestsSpent = 0

  for (let i = state.nextWindowIndex; i < windows.length; i++) {
    const window = windows[i]!
    // `current: i` (not i+1) — a percentage bar should reflect windows
    // actually COMMITTED to state so far, not the one currently in flight.
    notify({
      label: `Gemini (${model}) analiza el tramo ${i + 1}/${windows.length} (${Math.round(window.start)}-${Math.round(window.end)}s de ${Math.round(durationSeconds)}s)...`,
      current: i,
      total: windows.length,
    })
    const prompt = buildWindowAnalysisPrompt({
      windowIndex: i,
      windowCount: windows.length,
      windowStartSeconds: window.start,
      windowDurationSeconds: window.end - window.start,
      fullVideoDurationSeconds: durationSeconds,
    })
    // One retry for a transient failure on THIS window alone. Without it, a
    // single 500 on window 6 of 8 would abandon the model entirely over one
    // blip. A real quota exhaustion or retired-model error still propagates
    // immediately — retrying either wastes a call and cannot succeed.
    const windowLabel = `El tramo ${i + 1}/${windows.length} (static, ${model})`
    let attempt: { result: AnalysisResult; usage: TokenUsage; rawResponseText: string }
    try {
      requestsSpent++
      attempt = await withTimeout(runStaticWindow(model, uri, mimeType, prompt, window.start, window.end), STATIC_TIMEOUT_MS, windowLabel)
    } catch (error) {
      // Quota/retired errors can never succeed on this model — hand off now.
      // An overloaded (503) error gets the same immediate hand-off: during a
      // real outage every retry on the SAME model just failed again after
      // burning the 13s delay, because the whole model was down, not this
      // one call. Only a genuinely unclassified error (network blip, bad
      // response shape) gets the one delayed retry, since that is the case
      // where waiting a few seconds can plausibly help.
      if (isQuotaExhaustedError(error) || isModelRetiredError(error) || isOverloadedError(error)) {
        throw new WindowedAnalysisError((error as Error).message, state, requestsSpent)
      }
      console.warn(`[ai-router] ${model}: tramo ${i + 1}/${windows.length} fallo, reintentando una vez: ${(error as Error).message}`)
      await sleep(WINDOW_CALL_DELAY_MS)
      try {
        requestsSpent++
        attempt = await withTimeout(runStaticWindow(model, uri, mimeType, prompt, window.start, window.end), STATIC_TIMEOUT_MS, windowLabel)
      } catch (retryError) {
        throw new WindowedAnalysisError((retryError as Error).message, state, requestsSpent)
      }
    }

    for (const scene of attempt.result.scenes) {
      state.scenes.push({ ...scene, start_seconds: scene.start_seconds + window.start, end_seconds: scene.end_seconds + window.start })
    }
    for (const line of attempt.result.transcript) {
      state.transcript.push({ ...line, start_seconds: line.start_seconds + window.start, end_seconds: line.end_seconds + window.start })
    }
    for (const el of attempt.result.elements) {
      state.elements.push({
        ...el,
        start_seconds: el.start_seconds + window.start,
        end_seconds: el.end_seconds === null ? null : el.end_seconds + window.start,
      })
    }
    state.summaries.push(attempt.result.summary)
    state.rawTexts.push(attempt.rawResponseText)
    state.usage = {
      inputTokens: state.usage.inputTokens + attempt.usage.inputTokens,
      outputTokens: state.usage.outputTokens + attempt.usage.outputTokens,
      cachedTokens: state.usage.cachedTokens + attempt.usage.cachedTokens,
      thoughtTokens: state.usage.thoughtTokens + attempt.usage.thoughtTokens,
      estimatedCostUsd: state.usage.estimatedCostUsd + attempt.usage.estimatedCostUsd,
    }
    // Committed immediately: if the NEXT window fails, this one still counts
    // as done and will not be re-run by whichever model tries next.
    state.nextWindowIndex = i + 1

    if (i < windows.length - 1) await sleep(WINDOW_CALL_DELAY_MS)
  }

  return requestsSpent
}

/**
 * Walks `models` in order for a long (windowed) video, exactly like the
 * plain-call rotation below but carrying ONE shared WindowState across model
 * switches — a model that goes down mid-video hands off its progress to the
 * next one instead of erasing it. Each model's per-model, real request count
 * (successes AND failed attempts) is tracked separately for an honest quota
 * log, since a model that failed after 2 requests must not be logged as if
 * it made 0, and the winning model must not be credited with windows another
 * model actually paid for.
 */
async function analyzeVideoWindowedWithRotation(
  models: string[],
  uri: string,
  mimeType: string | undefined,
  durationSeconds: number,
  notify: (progress: ProgressUpdate) => void,
): Promise<AnalyzeVideoOutput> {
  const windows = planWindows(durationSeconds)
  let state = emptyWindowState()
  const exhaustedModels: Array<{ model: string; error: string; requestCount: number }> = []

  for (const [index, model] of models.entries()) {
    const isLast = index === models.length - 1
    try {
      const requestsSpent = await runWindowsWithModel(model, uri, mimeType, windows, durationSeconds, state, notify)
      return {
        result: finalizeWindowState(state),
        usage: state.usage,
        processingModeUsed: 'STATIC',
        modelUsed: model,
        exhaustedModels,
        rawResponseText: JSON.stringify({ windows: state.rawTexts.map((t) => JSON.parse(t)) }),
        // Real calls THIS model made — includes any internal window retries,
        // not just a count of windows completed (see runWindowsWithModel).
        requestCount: requestsSpent,
      }
    } catch (error) {
      const requestsSpent = error instanceof WindowedAnalysisError ? error.requestsSpentByThisModel : 0
      if (error instanceof WindowedAnalysisError) state = error.state
      const message = (error as Error).message
      if (isLast) throw error
      exhaustedModels.push({ model, error: message, requestCount: requestsSpent })
      const reason = isQuotaExhaustedError(error) ? 'sin cupo diario' : isModelRetiredError(error) ? 'retirado por Google' : 'fallo'
      console.warn(
        `[ai-router] ${model} ${reason} en el tramo ${state.nextWindowIndex + 1}/${windows.length}, probando ${models[index + 1]}...`,
      )
      notify({
        label: `${model} ${reason} en el tramo ${state.nextWindowIndex + 1}/${windows.length}, probando ${models[index + 1]}...`,
        current: state.nextWindowIndex,
        total: windows.length,
      })
    }
  }

  throw new Error('No se pudo completar el video (ventaneo) con ninguno de los modelos configurados.')
}

/**
 * Runs the single comprehensive analysis call described in PROJECT.md §8
 * (summary + timeline + transcript + objects/OCR/actions, all synchronized).
 *
 * Deliberately ONE call rather than separate first_pass/deep_pass calls:
 * agentic processing already lets the model navigate the video efficiently
 * on its own, so a second "deep" pass over hand-picked segments would just
 * spend a second one of the account's 20 daily requests for little benefit.
 *
 * Agentic is the Interactions API (`ai.interactions.create`), launched days
 * before this was written and confirmed unstable on long videos in Google's
 * own developer forum ("Model generated too many tool calls" after dozens of
 * tool-call steps). Any failure there — thrown error or a non-"completed"
 * status — falls back to the well-established `generateContent` with STATIC
 * processing automatically, per PROJECT.md §16's own fallback requirement.
 * The caller finds out which mode actually ran via `processingModeUsed`.
 */
/**
 * Runs one model's agentic-then-static attempt. Agentic failing for a reason
 * OTHER than quota just falls back to static on the SAME model, exactly as
 * before — only a quota rejection is the caller's cue to try the next model.
 */
async function tryOneModel(
  model: string,
  uri: string,
  mimeType: string | undefined,
  processing: ProcessingMode,
  durationSeconds: number | null | undefined,
  notify: (progress: ProgressUpdate) => void,
): Promise<{
  result: AnalysisResult
  usage: TokenUsage
  processingModeUsed: ProcessingMode
  rawResponseText: string
  requestCount: number
}> {
  // Long videos never reach here — analyzeVideo() routes them to
  // analyzeVideoWindowedWithRotation instead, which handles model rotation
  // itself (with cross-model progress carried over). See WINDOW_THRESHOLD_SECONDS.
  const prompt = buildAnalysisPrompt(durationSeconds)

  if (processing === 'AGENTIC') {
    try {
      notify({ label: `Gemini (${model}) esta analizando el video (modo agentic, puede tardar varios minutos)...` })
      const agentic = await withTimeout(tryAgentic(model, uri, mimeType, prompt), AGENTIC_TIMEOUT_MS, 'El modo agentic')
      return { ...agentic, processingModeUsed: 'AGENTIC', requestCount: 1 }
    } catch (error) {
      // A retired model will not work in static mode either — falling back
      // would just spend a second wasted request on the same dead model.
      if (isQuotaExhaustedError(error) || isModelRetiredError(error)) throw error
      console.warn(`[ai-router] ${model}: modo agentic fallo, usando static como respaldo: ${(error as Error).message}`)
    }
  }

  notify({ label: `Gemini (${model}) esta analizando el video (modo static, puede tardar varios minutos)...` })
  const staticResult = await withTimeout(runStatic(model, uri, mimeType, prompt), STATIC_TIMEOUT_MS, `Gemini (${model}, static)`)
  return { ...staticResult, processingModeUsed: 'STATIC', requestCount: 1 }
}

/**
 * Uploads the video ONCE, then walks `input.models` in order until one
 * accepts the call. Google's free-tier daily cap is per model (its own 429
 * payload names the quota `GenerateRequestsPerDayPerProjectPerModel-FreeTier`
 * with a `model` dimension) — so exhausting one model is a reason to try the
 * next, not to give up. Any other error (a bad/unavailable model id, a
 * transient 500) is ALSO treated as "try the next model" unless it is the
 * last one, since the whole point of listing many models is to maximize the
 * odds one of them actually answers — the caller finds out which model (if
 * any) worked via `modelUsed`, and which ones were skipped via
 * `exhaustedModels` for the cost/quota log.
 */
export async function analyzeVideo(input: AnalyzeVideoInput): Promise<AnalyzeVideoOutput> {
  if (!input.models.length) throw new Error('Se requiere al menos un modelo en AnalyzeVideoInput.models.')
  const notify = input.onProgress ?? (() => {})

  notify({ label: input.source.kind === 'file' ? 'Subiendo video a Gemini...' : 'Preparando video de YouTube...' })
  const { uri, mimeType } = await resolveVideoUri(input.source)

  // Long videos get their own rotation path with a shared WindowState, so a
  // model failing on window 5 hands off to the next model at window 5, not
  // window 0 — see analyzeVideoWindowedWithRotation.
  if (input.durationSeconds && Number.isFinite(input.durationSeconds) && input.durationSeconds > WINDOW_THRESHOLD_SECONDS) {
    return analyzeVideoWindowedWithRotation(input.models, uri, mimeType, input.durationSeconds, notify)
  }

  const exhaustedModels: Array<{ model: string; error: string; requestCount: number }> = []

  for (const [index, model] of input.models.entries()) {
    const isLast = index === input.models.length - 1
    try {
      const attempt = await tryOneModel(model, uri, mimeType, input.processing, input.durationSeconds, notify)
      return { ...attempt, modelUsed: model, exhaustedModels }
    } catch (error) {
      const message = (error as Error).message
      if (isLast) throw error
      exhaustedModels.push({ model, error: message, requestCount: 1 })
      const reason = isQuotaExhaustedError(error) ? 'sin cupo diario' : isModelRetiredError(error) ? 'retirado por Google' : 'fallo'
      console.warn(`[ai-router] ${model} ${reason}, probando ${input.models[index + 1]}...`)
      notify({ label: `${model} ${reason}, probando ${input.models[index + 1]}...` })
    }
  }

  // Unreachable: the loop above always returns or throws on the last model.
  throw new Error('No se pudo analizar con ninguno de los modelos configurados.')
}

/**
 * Google's 429 payload states the exact cap it just enforced, e.g.
 * `"quotaValue":"20"` alongside `limit: 20, model: gemini-3.7-flash`.
 * Reading it is the only reliable way to learn a model's real free-tier
 * daily limit — models.list does not expose rate limits, and assuming the
 * same number for every model is simply wrong (pro/preview models differ).
 */
export function parseQuotaLimit(error: unknown): number | undefined {
  const message = (error as Error)?.message ?? ''
  const fromQuotaValue = message.match(/"quotaValue"\s*:\s*"?(\d+)"?/)
  if (fromQuotaValue?.[1]) return Number(fromQuotaValue[1])
  const fromLimit = message.match(/limit:\s*(\d+)/)
  return fromLimit?.[1] ? Number(fromLimit[1]) : undefined
}
