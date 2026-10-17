import { readFile } from 'node:fs/promises'
import {
  frameLabel,
  postSse,
  ProviderOverloadedError,
  speechPreamble,
  TRANSIENT_STATUS,
  type VisionProvider,
  type VisionRequest,
} from './types.js'

/**
 * Models tried in order when GEMINI_VISION_MODELS is not set. Only models on
 * Google's current model list (ai.google.dev/gemini-api/docs/models, read on
 * 2026-10-17): 3.8 Flash and 3.5 Flash-Lite are the ones Google recommends for
 * new projects, 3.6 Flash sits between them as a different generation so one
 * saturated capacity pool does not cost two attempts in a row.
 */
export const DEFAULT_GEMINI_VISION_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite']

export function geminiVisionModels(): string[] {
  const list = process.env.GEMINI_VISION_MODELS?.trim()
  if (list) return list.split(',').map((m) => m.trim()).filter(Boolean)
  const single = process.env.GEMINI_VISION_MODEL?.trim()
  return single ? [single] : DEFAULT_GEMINI_VISION_MODELS
}

type StreamChunk = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
  error?: { code?: number; status?: string; message?: string }
}

/**
 * One Gemini model as a vision provider. Each model is its own provider (named
 * "gemini:<model>") so the chain pauses a saturated model on its own and moves
 * to the next one, instead of giving up on Gemini as a whole.
 *
 * Requests go through streamGenerateContent: Google's video guide says a
 * plain request that Gemini retries internally under high demand can outlive
 * the connection and fail as a timeout, and streaming keeps it alive.
 * No temperature/top_p/top_k: Gemini 3.6+ ignores them and Google has said
 * they will be rejected with a 400 in a future release.
 */
export function geminiModel(model: string): VisionProvider {
  const name = `gemini:${model}`
  return {
    name,
    available: () => Boolean(process.env.GEMINI_API_KEY),
    async describe({ frames, transcript, instruction, json = true }: VisionRequest) {
      const parts: unknown[] = []
      for (const f of frames) {
        parts.push({ text: `[t=${frameLabel(f.time)}]` })
        parts.push({ inline_data: { mime_type: 'image/jpeg', data: (await readFile(f.path)).toString('base64') } })
      }
      parts.push({ text: [...speechPreamble(transcript), instruction].join('\n\n') })

      const base = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com'
      const events = await postSse(
        name,
        `${base}/v1beta/models/${model}:streamGenerateContent?alt=sse`,
        { 'x-goog-api-key': process.env.GEMINI_API_KEY || '' },
        {
          contents: [{ role: 'user', parts }],
          ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
        },
      )

      let text = ''
      for (const raw of events) {
        const chunk = JSON.parse(raw) as StreamChunk
        if (chunk.error) {
          // An error can arrive mid-stream with a 200 status, e.g. UNAVAILABLE.
          const detail = `${chunk.error.status ?? ''} ${chunk.error.message ?? ''}`.trim()
          if (chunk.error.code && TRANSIENT_STATUS.has(chunk.error.code)) {
            throw new ProviderOverloadedError(name, chunk.error.code, detail)
          }
          throw new Error(`${name} error ${chunk.error.code ?? ''}: ${detail.slice(0, 300)}`)
        }
        for (const p of chunk.candidates?.[0]?.content?.parts ?? []) {
          if (!p.thought) text += p.text ?? ''
        }
      }
      return text
    },
  }
}

export function geminiProviders(): VisionProvider[] {
  return geminiVisionModels().map(geminiModel)
}

/** The first configured model; kept for callers that want a single provider. */
export const gemini: VisionProvider = {
  get name() {
    return geminiProviders()[0]!.name
  },
  available: () => Boolean(process.env.GEMINI_API_KEY),
  describe: (req) => geminiProviders()[0]!.describe(req),
}
