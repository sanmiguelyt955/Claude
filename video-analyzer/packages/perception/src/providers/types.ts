import type { Frame } from '../frames.js'

export type VisionRequest = {
  /** Frames to look at, in time order. May be empty for text-only calls. */
  frames: Frame[]
  /**
   * Speech in the same time range, already transcribed ('' when the range has
   * no voice). Omitted for text-only calls whose instruction carries all the
   * context (the video chat), so no "this window has no voice" note is added.
   */
  transcript?: string
  /** Full instruction. */
  instruction: string
  /** Ask for a JSON reply (default). False for free-text answers. */
  json?: boolean
  /**
   * 'low' when the task is describing, not reasoning (frame windows): less
   * thinking means a faster answer. Providers without the setting ignore it.
   */
  thinking?: 'low'
}

/** The speech preamble shared by every provider; empty for text-only calls. */
export function speechPreamble(transcript: string | undefined): string[] {
  if (transcript === undefined) return []
  return [transcript ? `Transcripción del audio en este tramo (lo que se escucha):\n${transcript}` : 'Este tramo no tiene voz.']
}

export interface VisionProvider {
  readonly name: string
  /** False when the provider has no key/config; the chain skips it silently. */
  available(): boolean
  describe(req: VisionRequest): Promise<string>
}

/**
 * Saturation, quota, timeout or a dropped connection: the request itself was
 * fine, the provider just could not answer now. The chain moves on to the
 * next provider and pauses this one (for `retryAfterMs` when the provider
 * said how long, via Retry-After).
 */
export class ProviderOverloadedError extends Error {
  constructor(
    provider: string,
    status: number | string,
    detail: string,
    public readonly retryAfterMs?: number,
  ) {
    super(`${provider} no disponible (${status}): ${detail.slice(0, 200)}`)
    this.name = 'ProviderOverloadedError'
  }
}

// 529 is Anthropic's "overloaded"; 500/502/504 are transient on both APIs.
export const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504, 529])

/** Retry-After as milliseconds: either delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}

/**
 * POST JSON with a timeout, mapping every "try again later" outcome to
 * ProviderOverloadedError so the chain can fall over. A real request error
 * (bad image, bad key) is thrown as a plain Error and stops the job.
 */
export async function postJson(provider: string, url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const timeoutMs = Number(process.env.VISION_TIMEOUT_MS ?? 240_000)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    const name = (err as Error).name
    const reason = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'red'
    throw new ProviderOverloadedError(provider, reason, String((err as Error).message))
  }
  if (!res.ok) {
    const text = await res.text()
    if (TRANSIENT_STATUS.has(res.status)) {
      throw new ProviderOverloadedError(provider, res.status, text, parseRetryAfter(res.headers.get('retry-after')))
    }
    throw new Error(`${provider} HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json()
}

/**
 * POST JSON and read a Server-Sent Events reply, returning the `data:` payload
 * of every event. A streamed request is only cut when nothing arrives for
 * VISION_IDLE_TIMEOUT_MS (default 3 min), so a slow but working answer is not
 * lost; VISION_STREAM_TIMEOUT_MS (default 10 min) still caps the whole request.
 * Errors map to ProviderOverloadedError exactly as in postJson.
 */
export async function postSse(provider: string, url: string, headers: Record<string, string>, body: unknown): Promise<string[]> {
  const totalMs = Number(process.env.VISION_STREAM_TIMEOUT_MS ?? 600_000)
  const idleMs = Number(process.env.VISION_IDLE_TIMEOUT_MS ?? 180_000)
  const controller = new AbortController()
  let timedOut = ''
  const abort = (why: string) => {
    timedOut = why
    controller.abort()
  }
  const total = setTimeout(() => abort(`sin terminar tras ${Math.round(totalMs / 1000)}s`), totalMs)
  let idle = setTimeout(() => abort(`sin datos durante ${Math.round(idleMs / 1000)}s`), idleMs)
  const touch = () => {
    clearTimeout(idle)
    idle = setTimeout(() => abort(`sin datos durante ${Math.round(idleMs / 1000)}s`), idleMs)
  }

  try {
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (err) {
      throw new ProviderOverloadedError(provider, timedOut ? 'timeout' : 'red', timedOut || String((err as Error).message))
    }
    if (!res.ok) {
      const text = await res.text()
      if (TRANSIENT_STATUS.has(res.status)) {
        throw new ProviderOverloadedError(provider, res.status, text, parseRetryAfter(res.headers.get('retry-after')))
      }
      throw new Error(`${provider} HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
    if (!res.body) throw new ProviderOverloadedError(provider, 'red', 'respuesta sin cuerpo')

    const events: string[] = []
    const decoder = new TextDecoder()
    let buffer = ''
    const flush = (block: string) => {
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).replace(/^ /, ''))
        .join('\n')
      if (data && data !== '[DONE]') events.push(data)
    }
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        touch()
        buffer += decoder.decode(chunk, { stream: true })
        let cut: RegExpExecArray | null
        while ((cut = /\r?\n\r?\n/.exec(buffer))) {
          flush(buffer.slice(0, cut.index))
          buffer = buffer.slice(cut.index + cut[0].length)
        }
      }
    } catch (err) {
      // The connection dropped or went quiet mid-answer: worth retrying.
      throw new ProviderOverloadedError(provider, timedOut ? 'timeout' : 'red', timedOut || String((err as Error).message))
    }
    flush(buffer + decoder.decode())
    return events
  } finally {
    clearTimeout(total)
    clearTimeout(idle)
  }
}

export function frameLabel(time: number): string {
  const m = Math.floor(time / 60)
  const s = (time % 60).toFixed(2).padStart(5, '0')
  return `${m}:${s}`
}
