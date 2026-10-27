import { readFile } from 'node:fs/promises'
import {
  BadReplyError,
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
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> }; finishReason?: string }>
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
export function estimateTokens({ frames, transcript, instruction, audio }: VisionRequest): number {
  const perFrame = FRAME_TOKENS[frames.length ? mediaResolution() : ''] ?? FRAME_TOKENS['']!
  // Gemini counts audio at 32 tokens per second.
  const sound = audio ? Math.ceil(audio.seconds * 32) : 0
  return frames.length * perFrame + sound + Math.ceil(((transcript ?? '').length + instruction.length) / 3) + 200
}

const maxTpm = () => Number(process.env.GEMINI_MAX_TPM ?? 250_000) || 0

/** One budget per model, shared by every window and the summary. Free tier: 5 RPM, 250k input TPM. */
const budgets = new Map<string, MinuteBudget>()
function budgetOf(model: string): MinuteBudget {
  let b = budgets.get(model)
  if (!b) {
    b = new MinuteBudget(Number(process.env.GEMINI_MAX_RPM ?? 5) || 0, maxTpm())
    budgets.set(model, b)
  }
  return b
}

/**
 * Most frames one request can carry at the configured resolution and still
 * fit the per-minute token limit (with its 10% margin), leaving `otherTokens`
 * for the instruction, the speech and the sound. 300 frames at Google's
 * default resolution are 333k tokens: Google refuses them every time.
 */
export function maxFramesPerRequest(otherTokens = 30_000): number {
  const tpm = Math.floor(maxTpm() * 0.9)
  if (!tpm) return Infinity
  const perFrame = FRAME_TOKENS[mediaResolution()] ?? FRAME_TOKENS['']!
  return Math.max(1, Math.floor((tpm - otherTokens) / perFrame))
}

export function geminiModel(model: string): VisionProvider {
  const name = `gemini:${model}`
  return {
    name,
    fallbackOnly: /lite/i.test(model),
    readyInMs: (req) => budgetOf(model).readyInMs(estimateTokens(req)),
    reserve: (req) => budgetOf(model).reserve(estimateTokens(req)),
    available: () => Boolean(process.env.GEMINI_API_KEY),
    async describe({ frames, transcript, instruction, json = true, thinking, audio, schema, maxOutputTokens }: VisionRequest) {
      const parts: unknown[] = []
      for (const f of frames) {
        parts.push({ text: `[t=${frameLabel(f.time)}]` })
        parts.push({ inline_data: { mime_type: 'image/jpeg', data: (await readFile(f.path)).toString('base64') } })
      }
      if (audio) {
        parts.push({ text: '[audio del tramo]' })
        parts.push({ inline_data: { mime_type: audio.mimeType, data: (await readFile(audio.path)).toString('base64') } })
      }
      parts.push({ text: [...speechPreamble(transcript), instruction].join('\n\n') })

      const base = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com'
      const resolution = frames.length ? mediaResolution() : ''
      // Settings a model may reject with a 400 that names them; only the named
      // one is dropped on the retry (dropping all of them also dropped the low
      // resolution, making the request four times larger than budgeted).
      type Setting = 'schema' | 'resolution' | 'thinking'
      const generationConfig = (drop: Set<Setting>) => ({
        ...(json ? { responseMimeType: 'application/json' } : {}),
        ...(!drop.has('schema') && json && schema ? { responseSchema: schema } : {}),
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
        ...(!drop.has('resolution') && resolution ? { mediaResolution: resolution } : {}),
        ...(!drop.has('thinking') && thinking ? { thinkingConfig: { thinkingLevel: thinking } } : {}),
      })
      const send = (drop: Set<Setting>) =>
        postSse(
          name,
          `${base}/v1beta/models/${model}:streamGenerateContent?alt=sse`,
          { 'x-goog-api-key': process.env.GEMINI_API_KEY || '' },
          { contents: [{ role: 'user', parts }], generationConfig: generationConfig(drop) },
        )

      let events: string[]
      try {
        events = await send(new Set())
      } catch (err) {
        // A model that does not take one of the cost settings rejects the
        // whole request with a 400 naming it; the request is fine without it.
        const msg = String(err)
        if (!/HTTP 400/.test(msg)) throw err
        const drop = new Set<Setting>()
        if (schema && /schema/i.test(msg)) drop.add('schema')
        if (resolution && /resolution/i.test(msg)) drop.add('resolution')
        if (thinking && /thinking/i.test(msg)) drop.add('thinking')
        if (!drop.size) throw err
        events = await send(drop)
      }

      let text = ''
      let truncated = false
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
        if (chunk.candidates?.[0]?.finishReason === 'MAX_TOKENS') truncated = true
      }
      // A reply cut by the length limit is not a valid record: say so instead
      // of handing on half a JSON that fails to parse somewhere later.
      if (truncated) throw new BadReplyError(`${name}: respuesta cortada por el límite de longitud (MAX_TOKENS)`)
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
