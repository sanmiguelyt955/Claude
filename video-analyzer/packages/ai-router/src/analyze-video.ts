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
/** Base delay before retrying an unclassified window failure (network blip,
 * malformed JSON) on the same model. Jittered — see jittered(). */
const WINDOW_CALL_DELAY_MS = Number(process.env.GEMINI_WINDOW_CALL_DELAY_MS ?? 13_000)

/**
 * How many windows of one video are in flight at once. Each window call takes
 * ~60-95s (measured on 2 Oct 2026), so running them one after another — plus
 * the fixed 13s pause this replaced — left the per-minute budget mostly idle:
 * a 5-minute video took 13 minutes. The per-model pacer below still enforces
 * Google's RPM, so this only fills the idle time, it never exceeds the limit.
 */
const WINDOW_CONCURRENCY = Math.max(1, Number(process.env.GEMINI_WINDOW_CONCURRENCY ?? 4))

/**
 * Google's free tier enforces RPM per model and per project
 * (`GenerateRequestsPerMinutePerProjectPerModel`). Request STARTS are spaced
 * 60s/RPM apart per model, so concurrency can never trip the limit by itself.
 */
const MAX_RPM_PER_MODEL = Math.max(1, Number(process.env.GEMINI_MAX_RPM ?? 5))

/**
 * A 503 "high demand" is a transient, model-wide overload — not a reason to
 * abandon the best model for the rest of the video (the old behavior, which
 * pushed a whole video down to Flash Lite over a 30-second spike). The model
 * is only skipped for this long, then retried for later windows.
 */
const OVERLOAD_COOLDOWN_MS = Number(process.env.GEMINI_OVERLOAD_COOLDOWN_MS ?? 60_000)

/** Upper bound for the escalating 503 cooldown. */
const OVERLOAD_COOLDOWN_MAX_MS = 15 * 60_000

/** Next free request-start time per model, shared by every job in this process. */
const nextSlotByModel = new Map<string, number>()

/**
 * Overload state per model, shared across windows AND jobs in this process.
 * Each consecutive 503 doubles the cooldown (60s, 2m, 4m... up to 15m); one
 * success resets it. Measured 2 Oct 2026: with a flat 60s cooldown,
 * gemini-3.8-flash took 14 rejections for 1 success during a sustained
 * outage — every retry costing a pacing slot and, as the app counts it, a
 * daily request.
 */
const overloadByModel = new Map<string, { strikes: number; until: number }>()

function markOverloaded(model: string): number {
  const strikes = (overloadByModel.get(model)?.strikes ?? 0) + 1
  const cooldown = Math.min(OVERLOAD_COOLDOWN_MS * 2 ** (strikes - 1), OVERLOAD_COOLDOWN_MAX_MS)
  overloadByModel.set(model, { strikes, until: Date.now() + cooldown })
  return cooldown
}

function isCoolingDown(model: string): boolean {
  return (overloadByModel.get(model)?.until ?? 0) > Date.now()
}

/**
 * Waits for this model's next request slot. The reservation is taken
 * synchronously before awaiting, so concurrent windows can never race onto the
 * same slot.
 */
async function acquireModelSlot(model: string): Promise<void> {
  const interval = 60_000 / MAX_RPM_PER_MODEL
  const now = Date.now()
  const slot = Math.max(now, nextSlotByModel.get(model) ?? 0)
  nextSlotByModel.set(model, slot + interval)
  if (slot > now) await sleep(slot - now)
}

/** ±25% jitter so retries from parallel windows don't land in lockstep. */
function jittered(ms: number): number {
  return Math.round(ms * (0.75 + Math.random() * 0.5))
}

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

/**
 * One real Gemini generate call, reported the moment it finishes (success or
 * failure). Lets the caller write the quota log per request instead of once at
 * the end of the job — otherwise the quota counter reads 0 for the whole
 * duration of a long video, and every request is lost from it if the process
 * dies mid-video.
 */
export type RequestEvent = {
  model: string
  processingMode: ProcessingMode
  succeeded: boolean
  error?: string
  usage?: TokenUsage
  latencyMs: number
}

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
  /**
   * Resume point for a windowed video whose PREVIOUS job attempt exhausted
   * every configured model with some windows already completed (see
   * WindowedAnalysisError). Without this, a retried job attempt starts
   * analyzeVideoWindowed with a fresh, empty state and re-does
   * every window from 0 — the in-memory WindowState normally used to hand
   * off between models within ONE attempt does not otherwise survive the
   * attempt itself failing and the job being requeued. Ignored for a
   * non-windowed (short) video.
   */
  initialWindowState?: WindowState
  /** Called once per real Gemini generate call — see RequestEvent. */
  onRequest?: (event: RequestEvent) => void
  /** Called whenever a window finishes, with the state to persist so a crash
   * mid-video resumes from here instead of window 0. Windowed videos only. */
  onCheckpoint?: (state: WindowState) => void
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
  /** True when every request was already reported through `onRequest` —
   * the caller must then NOT log `requestCount`/`exhaustedModels` again. */
  requestsLoggedLive: boolean
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

/**
 * A 429 for the PER-MINUTE quota (`...PerMinute...` in Google's quotaId), as
 * opposed to the daily one. isQuotaExhaustedError() matches both, and treating
 * a per-minute 429 as "out of quota for today" throws away a model that would
 * have answered fine 10 seconds later.
 */
export function isPerMinuteQuotaError(error: unknown): boolean {
  return isQuotaExhaustedError(error) && ((error as Error)?.message ?? '').includes('PerMinute')
}

/** A 429 that means the model is done for today. */
function isDailyQuotaError(error: unknown): boolean {
  return isQuotaExhaustedError(error) && !isPerMinuteQuotaError(error)
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
  // A real abort, not just a Promise.race: with several windows in flight, a
  // hung call would otherwise keep its socket open after the timeout fires.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), STATIC_TIMEOUT_MS)
  let response: Awaited<ReturnType<typeof ai.models.generateContent>>
  try {
    response = await ai.models.generateContent({
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
      abortSignal: controller.signal,
    },
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `El tramo [${startSeconds}-${endSeconds}s] (${model}) supero el limite de ${Math.round(STATIC_TIMEOUT_MS / 1000)}s sin responder.`,
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }

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
/**
 * Exported so a caller whose job attempt exhausted every model (see
 * WindowedAnalysisError) can serialize this to disk/DB and hand it back in
 * as `AnalyzeVideoInput.initialWindowState` on the next retry — a plain,
 * JSON-safe object (JSON.stringify/parse round-trips it with no custom
 * logic needed) is what makes that possible.
 */
export type WindowState = {
  scenes: AnalysisResult['scenes']
  transcript: AnalysisResult['transcript']
  elements: AnalysisResult['elements']
  summaries: AnalysisResult['summary'][]
  rawTexts: string[]
  usage: TokenUsage
  /** Index of the first window NOT yet completed by any model. */
  nextWindowIndex: number
  /**
   * Windows that finished out of order (windows run in parallel), keyed by
   * window index, waiting for every earlier window before being merged.
   * Optional so checkpoints written before parallel windows still load.
   */
  ahead?: Record<string, WindowOutcome>
}

/** One finished window, timestamps still relative to the window's own start. */
type WindowOutcome = {
  result: AnalysisResult
  usage: TokenUsage
  rawResponseText: string
  windowStart: number
}

/**
 * Merges window `index` into the state if it is the next one in order, then
 * keeps merging any already-finished windows that were waiting behind it.
 * Shifting every timestamp by the window's real start happens here, in code,
 * never trusted to the model — that is what keeps the merged timeline from
 * drifting (see buildWindowAnalysisPrompt).
 */
function commitWindow(state: WindowState, index: number, outcome: WindowOutcome): void {
  state.ahead ??= {}
  state.ahead[String(index)] = outcome
  for (;;) {
    const next = state.ahead[String(state.nextWindowIndex)]
    if (!next) break
    delete state.ahead[String(state.nextWindowIndex)]
    const offset = next.windowStart
    for (const scene of next.result.scenes) {
      state.scenes.push({ ...scene, start_seconds: scene.start_seconds + offset, end_seconds: scene.end_seconds + offset })
    }
    for (const line of next.result.transcript) {
      state.transcript.push({ ...line, start_seconds: line.start_seconds + offset, end_seconds: line.end_seconds + offset })
    }
    for (const el of next.result.elements) {
      state.elements.push({
        ...el,
        start_seconds: el.start_seconds + offset,
        end_seconds: el.end_seconds === null ? null : el.end_seconds + offset,
      })
    }
    state.summaries.push(next.result.summary)
    state.rawTexts.push(next.rawResponseText)
    state.usage = {
      inputTokens: state.usage.inputTokens + next.usage.inputTokens,
      outputTokens: state.usage.outputTokens + next.usage.outputTokens,
      cachedTokens: state.usage.cachedTokens + next.usage.cachedTokens,
      thoughtTokens: state.usage.thoughtTokens + next.usage.thoughtTokens,
      estimatedCostUsd: state.usage.estimatedCostUsd + next.usage.estimatedCostUsd,
    }
    state.nextWindowIndex++
  }
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

/**
 * Thrown when a model exhausts its retry mid-video — carries whatever this
 * model itself completed (state.nextWindowIndex has already moved past
 * windows earlier models finished) so the caller can hand the SAME state to
 * the next model instead of starting over. Exported (not just used
 * internally for the model-to-model handoff) because when EVERY configured
 * model fails within one job attempt, this is also the error that
 * `analyzeVideo()` ultimately throws — a caller can `instanceof` it to pull
 * `.state` back out and persist it across job attempts, not just across
 * models within one attempt (see `AnalyzeVideoInput.initialWindowState`).
 */
export class WindowedAnalysisError extends Error {
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
 * Analyzes every pending window of a long video, WINDOW_CONCURRENCY at a time
 * (STATIC only — agentic navigates a whole video on its own and does not
 * accept a clip range). Each slice's JSON comes back with its OWN 0-based
 * timeline (see buildWindowAnalysisPrompt) and is shifted by commitWindow().
 *
 * Model choice is made PER WINDOW, best model first:
 * - daily-quota 429 / retired 404 → that model is skipped for the rest of the
 *   video (it cannot succeed again today);
 * - 503 overload → skipped for an escalating cooldown (see markOverloaded), then tried again,
 *   so a short spike no longer drags the whole video down to Flash Lite;
 * - per-minute 429 → exponential backoff with jitter on the SAME model;
 * - anything else → one jittered retry on the same model, then the next one.
 *
 * Mutates `state` in place, so on failure the thrown WindowedAnalysisError
 * carries every window finished so far — including ones that finished out of
 * order (state.ahead) — and the next attempt only redoes what is missing.
 */
async function analyzeVideoWindowed(
  models: string[],
  uri: string,
  mimeType: string | undefined,
  durationSeconds: number,
  notify: (progress: ProgressUpdate) => void,
  emit: (event: RequestEvent) => void,
  initialState: WindowState | undefined,
  onCheckpoint: (state: WindowState) => void,
): Promise<AnalyzeVideoOutput> {
  const windows = planWindows(durationSeconds)
  const state = initialState ?? emptyWindowState()
  state.ahead ??= {}

  const pending: number[] = []
  for (let i = state.nextWindowIndex; i < windows.length; i++) {
    if (!state.ahead[String(i)]) pending.push(i)
  }

  const deadModels = new Map<string, string>() // model -> why it cannot be used again today
  const windowsByModel = new Map<string, number>()
  let requestsSpent = 0
  let failure: Error | undefined

  const doneCount = () => state.nextWindowIndex + Object.keys(state.ahead ?? {}).length
  const report = (label: string) => notify({ label, current: doneCount(), total: windows.length })

  async function runOneWindow(i: number): Promise<void> {
    const window = windows[i]!
    const prompt = buildWindowAnalysisPrompt({
      windowIndex: i,
      windowCount: windows.length,
      windowStartSeconds: window.start,
      windowDurationSeconds: window.end - window.start,
      fullVideoDurationSeconds: durationSeconds,
    })
    let lastError: Error | undefined

    for (const model of models) {
      if (failure) return
      if (deadModels.has(model)) continue
      // A cooling-down model is skipped while any other usable model exists;
      // if every remaining model is cooling down, it is tried anyway rather
      // than failing the window outright.
      const usable = models.filter((m) => !deadModels.has(m))
      const allCooling = usable.every((m) => isCoolingDown(m))
      if (!allCooling && isCoolingDown(model)) continue

      for (let attempt = 1; ; attempt++) {
        if (failure) return
        await acquireModelSlot(model)
        const startedAt = Date.now()
        requestsSpent++
        try {
          const out = await runStaticWindow(model, uri, mimeType, prompt, window.start, window.end)
          emit({ model, processingMode: 'STATIC', succeeded: true, usage: out.usage, latencyMs: Date.now() - startedAt })
          windowsByModel.set(model, (windowsByModel.get(model) ?? 0) + 1)
          overloadByModel.delete(model) // answered again: back to full priority
          commitWindow(state, i, { ...out, windowStart: window.start })
          onCheckpoint(state)
          report(`Gemini analiza ${windows.length} tramos en paralelo: ${doneCount()}/${windows.length} listos (tramo ${i + 1} con ${model})...`)
          return
        } catch (error) {
          const message = (error as Error).message
          emit({ model, processingMode: 'STATIC', succeeded: false, error: message, latencyMs: Date.now() - startedAt })
          lastError = error as Error

          if (isDailyQuotaError(error) || isModelRetiredError(error)) {
            deadModels.set(model, message)
            console.warn(`[ai-router] ${model} ${isModelRetiredError(error) ? 'retirado por Google' : 'sin cupo diario'} (tramo ${i + 1}/${windows.length}), sigue con el siguiente modelo.`)
            break
          }
          if (isOverloadedError(error)) {
            const cooldown = markOverloaded(model)
            console.warn(`[ai-router] ${model} saturado (503) en el tramo ${i + 1}/${windows.length}; pausado ${Math.round(cooldown / 1000)}s, este tramo sigue con el siguiente modelo.`)
            break
          }
          if (isPerMinuteQuotaError(error) && attempt <= 3) {
            const wait = jittered(15_000 * 2 ** (attempt - 1))
            console.warn(`[ai-router] ${model}: limite por minuto (tramo ${i + 1}), reintento ${attempt}/3 en ${Math.round(wait / 1000)}s.`)
            await sleep(wait)
            continue
          }
          if (attempt === 1 && !isPerMinuteQuotaError(error)) {
            console.warn(`[ai-router] ${model}: tramo ${i + 1}/${windows.length} fallo, reintentando una vez: ${message}`)
            await sleep(jittered(WINDOW_CALL_DELAY_MS))
            continue
          }
          console.warn(`[ai-router] ${model}: tramo ${i + 1}/${windows.length} fallo de nuevo, sigue con el siguiente modelo: ${message}`)
          break
        }
      }
    }

    throw lastError ?? new Error(`Ningun modelo disponible para el tramo ${i + 1}/${windows.length}.`)
  }

  report(`Gemini analiza ${windows.length} tramos en paralelo (hasta ${WINDOW_CONCURRENCY} a la vez)...`)

  const queue = [...pending]
  async function lane(): Promise<void> {
    for (;;) {
      if (failure) return
      const i = queue.shift()
      if (i === undefined) return
      try {
        await runOneWindow(i)
      } catch (error) {
        // Stop handing out new windows; in-flight ones still finish and stay
        // in the state, so nothing already paid for is lost.
        failure ??= error as Error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(WINDOW_CONCURRENCY, queue.length) }, lane))

  if (failure || state.nextWindowIndex < windows.length) {
    throw new WindowedAnalysisError(
      failure?.message ?? 'Quedaron tramos sin analizar.',
      state,
      requestsSpent,
    )
  }

  // The model that did most of the work is the one reported as "used".
  const modelUsed = [...windowsByModel.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? models[0]!
  return {
    result: finalizeWindowState(state),
    usage: state.usage,
    processingModeUsed: 'STATIC',
    modelUsed,
    exhaustedModels: [...deadModels.entries()].map(([model, error]) => ({ model, error, requestCount: 0 })),
    rawResponseText: JSON.stringify({ windows: state.rawTexts.map((t) => JSON.parse(t)) }),
    requestCount: requestsSpent,
    requestsLoggedLive: true,
  }
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
  emit: (event: RequestEvent) => void,
): Promise<{
  result: AnalysisResult
  usage: TokenUsage
  processingModeUsed: ProcessingMode
  rawResponseText: string
  requestCount: number
}> {
  // Long videos never reach here — analyzeVideo() routes them to
  // analyzeVideoWindowed instead. See WINDOW_THRESHOLD_SECONDS.
  const prompt = buildAnalysisPrompt(durationSeconds)
  let requestCount = 0

  if (processing === 'AGENTIC') {
    const startedAt = Date.now()
    try {
      notify({ label: `Gemini (${model}) esta analizando el video (modo agentic, puede tardar varios minutos)...` })
      requestCount++
      const agentic = await withTimeout(tryAgentic(model, uri, mimeType, prompt), AGENTIC_TIMEOUT_MS, 'El modo agentic')
      emit({ model, processingMode: 'AGENTIC', succeeded: true, usage: agentic.usage, latencyMs: Date.now() - startedAt })
      return { ...agentic, processingModeUsed: 'AGENTIC', requestCount }
    } catch (error) {
      emit({ model, processingMode: 'AGENTIC', succeeded: false, error: (error as Error).message, latencyMs: Date.now() - startedAt })
      // A retired model will not work in static mode either — falling back
      // would just spend a second wasted request on the same dead model.
      if (isQuotaExhaustedError(error) || isModelRetiredError(error)) throw error
      console.warn(`[ai-router] ${model}: modo agentic fallo, usando static como respaldo: ${(error as Error).message}`)
    }
  }

  notify({ label: `Gemini (${model}) esta analizando el video (modo static, puede tardar varios minutos)...` })
  await acquireModelSlot(model)
  const startedAt = Date.now()
  requestCount++
  try {
    const staticResult = await withTimeout(runStatic(model, uri, mimeType, prompt), STATIC_TIMEOUT_MS, `Gemini (${model}, static)`)
    emit({ model, processingMode: 'STATIC', succeeded: true, usage: staticResult.usage, latencyMs: Date.now() - startedAt })
    return { ...staticResult, processingModeUsed: 'STATIC', requestCount }
  } catch (error) {
    emit({ model, processingMode: 'STATIC', succeeded: false, error: (error as Error).message, latencyMs: Date.now() - startedAt })
    throw error
  }
}

/**
 * Uploads the video ONCE, then walks `input.models` in order until one
 * accepts the call. Google's free-tier daily cap is per model (its own 429
 * payload names the quota `GenerateRequestsPerDayPerProjectPerModel-FreeTier`
 * with a `model` dimension) — so exhausting one model is a reason to try the
 * next, not to give up. Any other error (a transient 500/503) is ALSO treated
 * as "try the next model" unless it is the last one. Long videos take the
 * parallel windowed path instead (analyzeVideoWindowed).
 *
 * Every real generate call is reported through `input.onRequest` as it
 * happens; `requestsLoggedLive` tells the caller whether that was the case.
 */
export async function analyzeVideo(input: AnalyzeVideoInput): Promise<AnalyzeVideoOutput> {
  if (!input.models.length) throw new Error('Se requiere al menos un modelo en AnalyzeVideoInput.models.')
  const notify = input.onProgress ?? (() => {})
  const emit = input.onRequest ?? (() => {})
  const live = Boolean(input.onRequest)

  notify({ label: input.source.kind === 'file' ? 'Subiendo video a Gemini...' : 'Preparando video de YouTube...' })
  const uploadStartedAt = Date.now()
  const { uri, mimeType } = await resolveVideoUri(input.source)
  console.log(`[ai-router] video listo en Gemini en ${Math.round((Date.now() - uploadStartedAt) / 1000)}s.`)

  if (input.durationSeconds && Number.isFinite(input.durationSeconds) && input.durationSeconds > WINDOW_THRESHOLD_SECONDS) {
    const out = await analyzeVideoWindowed(
      input.models,
      uri,
      mimeType,
      input.durationSeconds,
      notify,
      emit,
      input.initialWindowState,
      input.onCheckpoint ?? (() => {}),
    )
    return { ...out, requestsLoggedLive: live }
  }

  const exhaustedModels: Array<{ model: string; error: string; requestCount: number }> = []

  for (const [index, model] of input.models.entries()) {
    const isLast = index === input.models.length - 1
    try {
      const attempt = await tryOneModel(model, uri, mimeType, input.processing, input.durationSeconds, notify, emit)
      return { ...attempt, modelUsed: model, exhaustedModels, requestsLoggedLive: live }
    } catch (error) {
      const message = (error as Error).message
      if (isLast) throw error
      exhaustedModels.push({ model, error: message, requestCount: 1 })
      const reason = isQuotaExhaustedError(error)
        ? 'sin cupo diario'
        : isModelRetiredError(error)
          ? 'retirado por Google'
          : isOverloadedError(error)
            ? 'saturado (503)'
            : 'fallo'
      // The real reason goes to the log — "fallo" alone made the 2 Oct 2026
      // 503 outage indistinguishable from a quota or code problem.
      console.warn(`[ai-router] ${model} ${reason}, probando ${input.models[index + 1]}: ${message.slice(0, 300)}`)
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
