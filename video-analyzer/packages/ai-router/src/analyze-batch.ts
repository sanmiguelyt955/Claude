import { getGeminiClient } from './client.js'
import { uploadAndWaitActive } from './upload.js'
import { ANALYSIS_JSON_SCHEMA, ANALYSIS_PROMPT, type AnalysisResult } from './schema.js'
import { estimateCostUsd } from './cost.js'
import { isQuotaExhaustedError } from './analyze-video.js'
import type { TokenUsage, VideoSource } from './types.js'

const MAX_OUTPUT_TOKENS = 65536

/**
 * The whole point of batching: N videos, ONE request against the daily quota.
 * The output cap is shared by every video in the batch, so the batch has to
 * stay small enough that each video still gets a full, gapless analysis —
 * the caller enforces that with its own duration/count limits.
 */
export type BatchItem = { key: string; source: VideoSource; title?: string; durationSeconds?: number | null }

export type BatchAnalysisOutput = {
  results: Array<{ key: string; result: AnalysisResult }>
  usage: TokenUsage
  modelUsed: string
  rawResponseText: string
  /** Keys the model failed to return anything usable for. */
  missingKeys: string[]
}

const BATCH_SCHEMA = {
  type: 'object',
  properties: {
    videos: {
      type: 'array',
      description: 'Un objeto por cada video recibido, en el mismo orden, identificado por su key.',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'La key EXACTA del video, tal como se indico antes de cada video.' },
          ...ANALYSIS_JSON_SCHEMA.properties,
        },
        required: ['key', ...ANALYSIS_JSON_SCHEMA.required],
      },
    },
  },
  required: ['videos'],
} as const

function buildBatchPrompt(items: BatchItem[]): string {
  const list = items.map((item, i) => `${i + 1}. key="${item.key}"${item.title ? ` — ${item.title}` : ''}`).join('\n')
  return `Vas a analizar ${items.length} videos DISTINTOS en una sola respuesta. Los videos se envian en este mismo orden, cada uno precedido por una linea que indica su key:

${list}

Para CADA video, produce un objeto completo con el mismo rigor descrito abajo, y ponlo en el array "videos" con su "key" correspondiente. No mezcles contenido entre videos: lo que pasa en el video 2 no puede aparecer en el analisis del video 1. Devuelve exactamente ${items.length} objetos, uno por key, en el mismo orden.

${ANALYSIS_PROMPT}`
}

function usageFrom(usage: {
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

async function resolveUri(source: VideoSource): Promise<{ uri: string; mimeType?: string }> {
  if (source.kind === 'youtube') return { uri: source.url }
  return uploadAndWaitActive(source.path, source.mimeType)
}

/**
 * Analyzes several videos in ONE Gemini call (STATIC only — the agentic
 * Interactions API is already unstable with a single long video, and giving
 * it several at once is not a risk worth taking with a scarce daily quota).
 *
 * Each video is preceded by a text part naming its key, so the model can tell
 * them apart and the results can be matched back reliably by key rather than
 * by position alone.
 */
export async function analyzeVideosBatch(input: {
  models: string[]
  items: BatchItem[]
  onProgress?: (label: string) => void
}): Promise<BatchAnalysisOutput> {
  if (!input.items.length) throw new Error('El lote no tiene videos.')
  if (!input.models.length) throw new Error('Se requiere al menos un modelo.')
  const notify = input.onProgress ?? (() => {})

  const parts: Array<Record<string, unknown>> = []
  for (const [index, item] of input.items.entries()) {
    notify(`Subiendo video ${index + 1} de ${input.items.length} a Gemini...`)
    const { uri, mimeType } = await resolveUri(item.source)
    parts.push({ text: `--- VIDEO key="${item.key}" ---` })
    parts.push({ fileData: { fileUri: uri, mimeType } })
  }
  parts.push({ text: buildBatchPrompt(input.items) })

  const ai = getGeminiClient()

  for (const [index, model] of input.models.entries()) {
    try {
      notify(`Gemini (${model}) esta analizando ${input.items.length} videos en una sola llamada...`)
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: BATCH_SCHEMA,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      })

      if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        throw new Error(
          `Gemini corto la respuesta por exceder ${MAX_OUTPUT_TOKENS} tokens — el lote de ${input.items.length} videos es demasiado grande.`,
        )
      }

      const text = response.text
      if (!text) throw new Error('Gemini no devolvio texto.')

      const parsed = JSON.parse(text.trim()) as { videos?: Array<AnalysisResult & { key: string }> }
      const returned = parsed.videos ?? []

      const results: BatchAnalysisOutput['results'] = []
      const missingKeys: string[] = []
      for (const [position, item] of input.items.entries()) {
        // Match by key first; fall back to position if the model dropped the key.
        const match = returned.find((v) => v.key === item.key) ?? returned[position]
        if (match?.summary && Array.isArray(match.scenes)) {
          results.push({ key: item.key, result: match })
        } else {
          missingKeys.push(item.key)
        }
      }
      if (!results.length) throw new Error('Gemini no devolvio ningun analisis utilizable para el lote.')

      return { results, usage: usageFrom(response.usageMetadata ?? {}), modelUsed: model, rawResponseText: text, missingKeys }
    } catch (error) {
      if (index === input.models.length - 1) throw error
      const reason = isQuotaExhaustedError(error) ? 'sin cupo diario' : 'fallo'
      console.warn(`[ai-router] lote: ${model} ${reason}, probando ${input.models[index + 1]}...`)
      notify(`${model} ${reason}, probando ${input.models[index + 1]}...`)
    }
  }

  throw new Error('No se pudo analizar el lote con ninguno de los modelos configurados.')
}
