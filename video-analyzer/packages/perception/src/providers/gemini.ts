import { readFile } from 'node:fs/promises'
import {
  frameLabel,
  MinuteBudget,
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
/** Input tokens per frame at each media resolution, measured with countTokens (plus its time label). */
const FRAME_TOKENS: Record<string, number> = { MEDIA_RESOLUTION_LOW: 272, MEDIA_RESOLUTION_MEDIUM: 535, '': 1110 }

/** Input tokens a request will cost, close enough to keep under the per-minute limit. */
export function estimateTokens({ frames, transcript, instruction }: VisionRequest): number {
  const perFrame = FRAME_TOKENS[frames.length ? mediaResolution() : ''] ?? FRAME_TOKENS['']!
  return frames.length * perFrame + Math.ceil(((transcript ?? '').length + instruction.length) / 3) + 200
}

/** One budget per model, shared by every window and the summary. Free tier: 5 RPM, 250k input TPM. */
const budgets = new Map<string, MinuteBudget>()
function budgetOf(model: string): MinuteBudget {
  let b = budgets.get(model)
  if (!b) {
    b = new MinuteBudget(Number(process.env.GEMINI_MAX_RPM ?? 5) || 0, Number(process.env.GEMINI_MAX_TPM ?? 250_000) || 0)
    budgets.set(model, b)
  }
  return b
}

export function geminiModel(model: string): VisionProvider {
  const name = `gemini:${model}`
  return {
    name,
    fallbackOnly: /lite/i.test(model),
    readyInMs: (req) => budgetOf(model).readyInMs(estimateTokens(req)),
    reserve: (req) => budgetOf(model).reserve(estimateTokens(req)),
    available: () => Boolean(process.env.GEMINI_API_KEY),
    async describe({ frames, transcript, instruction, json = true, thinking }: VisionRequest) {
      const parts: unknown[] = []
      for (const f of frames) {
        parts.push({ text: `[t=${frameLabel(f.time)}]` })
        parts.push({ inline_data: { mime_type: 'image/jpeg', data: (await readFile(f.path)).toString('base64') } })
      }
      parts.push({ text: [...speechPreamble(transcript), instruction].join('\n\n') })

      const base = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com'
      const resolution = frames.length ? mediaResolution() : ''
      const generationConfig = (tuned: boolean) => ({
        ...(json ? { responseMimeType: 'application/json' } : {}),
        ...(tuned && resolution ? { mediaResolution: resolution } : {}),
        ...(tuned && thinking ? { thinkingConfig: { thinkingLevel: thinking } } : {}),
      })
      const send = (tuned: boolean) =>
        postSse(
          name,
          `${base}/v1beta/models/${model}:streamGenerateContent?alt=sse`,
          { 'x-goog-api-key': process.env.GEMINI_API_KEY || '' },
          { contents: [{ role: 'user', parts }], generationConfig: generationConfig(tuned) },
        )

      let events: string[]
      try {
        events = await send(true)
      } catch (err) {
        // A model that does not take one of the cost settings rejects the
        // whole request with a 400 naming it; the request is fine without it.
        const tuned = Boolean(resolution || thinking)
        if (!tuned || !/HTTP 400/.test(String(err)) || !/resolution|thinking/i.test(String(err))) throw err
        events = await send(false)
      }

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

/**
 * Tokens per image. Gemini 3+ reads each picture at "high" (1,100 tokens,
 * measured) by default; "low" (264) still read small on-screen clock text
 * exactly in a 300-frame test, so windows carry three times the frames for
 * the same tokens as 100 at "medium" (527). Set
 * GEMINI_MEDIA_RESOLUTION=MEDIA_RESOLUTION_MEDIUM for fine print, or empty to
 * leave Google's default.
 */
function mediaResolution(): string {
  return (process.env.GEMINI_MEDIA_RESOLUTION ?? 'MEDIA_RESOLUTION_LOW').trim()
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
