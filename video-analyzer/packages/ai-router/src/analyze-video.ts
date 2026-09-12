import { getGeminiClient } from './client.js'
import { uploadAndWaitActive } from './upload.js'
import { ANALYSIS_JSON_SCHEMA, ANALYSIS_PROMPT, type AnalysisResult } from './schema.js'
import { estimateCostUsd } from './cost.js'
import type { ProcessingMode, TokenUsage, VideoSource } from './types.js'

// A gapless, second-by-second-granularity transcript + scene breakdown for
// even a short video produces far more output than a sparse summary would —
// the model's default output cap (often ~8192 tokens) truncates that
// mid-JSON, which fails to parse. 65536 is the standard ceiling for the
// Gemini 3.x Flash family; set explicitly rather than relying on whatever
// the model's own default happens to be.
const MAX_OUTPUT_TOKENS = 65536

export type AnalyzeVideoInput = {
  /** Models to try in order. Google's daily cap is per model, so a 429 on the
   * first one means "use the next", not "come back tomorrow". */
  models: string[]
  processing: ProcessingMode
  source: VideoSource
  /** Best-effort phase labels for a live progress UI — not a percentage: a
   * single Gemini call has no partial-progress signal to report mid-flight. */
  onProgress?: (label: string) => void
}

export type AnalyzeVideoOutput = {
  result: AnalysisResult
  usage: TokenUsage
  /** May differ from the requested mode if agentic failed and it fell back. */
  processingModeUsed: ProcessingMode
  /** Which model actually produced this, after any out-of-quota switches. */
  modelUsed: string
  /** Models skipped because they were out of daily quota, for the cost log. */
  exhaustedModels: Array<{ model: string; error: string }>
  /** Kept for analysis_runs.raw_response_path — debugging a bad parse. */
  rawResponseText: string
}

/** True for Google's "you ran out of daily requests for this model" (429). */
export function isQuotaExhaustedError(error: unknown): boolean {
  const message = (error as Error)?.message ?? ''
  return message.includes('RESOURCE_EXHAUSTED') || message.includes('"code":429')
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
): Promise<{ result: AnalysisResult; usage: TokenUsage; rawResponseText: string }> {
  const ai = getGeminiClient()
  const interaction = await ai.interactions.create({
    model,
    input: [
      { type: 'video', uri, mime_type: mimeType, processing: 'agentic' },
      { type: 'text', text: ANALYSIS_PROMPT },
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
): Promise<{ result: AnalysisResult; usage: TokenUsage; rawResponseText: string }> {
  const ai = getGeminiClient()
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [{ fileData: { fileUri: uri, mimeType } }, { text: ANALYSIS_PROMPT }],
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
  notify: (label: string) => void,
): Promise<{ result: AnalysisResult; usage: TokenUsage; processingModeUsed: ProcessingMode; rawResponseText: string }> {
  if (processing === 'AGENTIC') {
    try {
      notify(`Gemini (${model}) esta analizando el video (modo agentic, puede tardar varios minutos)...`)
      const agentic = await tryAgentic(model, uri, mimeType)
      return { ...agentic, processingModeUsed: 'AGENTIC' }
    } catch (error) {
      if (isQuotaExhaustedError(error)) throw error
      console.warn(`[ai-router] ${model}: modo agentic fallo, usando static como respaldo: ${(error as Error).message}`)
    }
  }

  notify(`Gemini (${model}) esta analizando el video (modo static, puede tardar varios minutos)...`)
  const staticResult = await runStatic(model, uri, mimeType)
  return { ...staticResult, processingModeUsed: 'STATIC' }
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

  notify(input.source.kind === 'file' ? 'Subiendo video a Gemini...' : 'Preparando video de YouTube...')
  const { uri, mimeType } = await resolveVideoUri(input.source)

  const exhaustedModels: Array<{ model: string; error: string }> = []

  for (const [index, model] of input.models.entries()) {
    const isLast = index === input.models.length - 1
    try {
      const attempt = await tryOneModel(model, uri, mimeType, input.processing, notify)
      return { ...attempt, modelUsed: model, exhaustedModels }
    } catch (error) {
      const message = (error as Error).message
      if (isLast) throw error
      exhaustedModels.push({ model, error: message })
      const reason = isQuotaExhaustedError(error) ? 'sin cupo diario' : 'fallo'
      console.warn(`[ai-router] ${model} ${reason}, probando ${input.models[index + 1]}...`)
      notify(`${model} ${reason}, probando ${input.models[index + 1]}...`)
    }
  }

  // Unreachable: the loop above always returns or throws on the last model.
  throw new Error('No se pudo analizar con ninguno de los modelos configurados.')
}
