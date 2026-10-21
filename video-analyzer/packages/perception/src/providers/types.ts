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
  /**
   * Sound the model should hear with the frames (the window's audio, for the
   * protocol's AUD channel). Providers that cannot hear ignore it.
   */
  audio?: { path: string; mimeType: string; seconds: number }
  /** JSON schema the reply must follow (Gemini responseSchema); ignored elsewhere. */
  schema?: unknown
  /** Longest reply allowed, in tokens; the provider default otherwise. */
  maxOutputTokens?: number
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
  /**
   * Milliseconds until this request fits the provider's own per-minute
   * limits (0 = now). Lets the chain wait or switch before Google refuses.
   */
  readyInMs?(req: VisionRequest): number
  /** Counts the request against those limits; called right before describe(). */
  reserve?(req: VisionRequest): void
  /**
   * A lower-quality last resort (Flash-Lite): the chain uses it only when the
   * others would keep the request waiting longer than it is worth.
   */
  readonly fallbackOnly?: boolean
}

/**
 * Requests and input tokens sent in the last minute, against the free-tier
 * limits Google enforces per model (RPM and input TPM). Checking before
 * sending avoids the 429 and its wait; Google stays the final word.
 */
export class MinuteBudget {
  private sent: Array<{ at: number; tokens: number }> = []
  private readonly tpm: number

  /**
   * The token limit keeps a 10% margin (our estimate is close, not exact) and
   * the minute lasts 62 s, since Google's clock counts a request a little
   * later than we send it: both seen as 429s against a strict stand-in.
   */
  constructor(
    private readonly rpm: number,
    tpm: number,
    private readonly now: () => number = Date.now,
    private readonly windowMs = 62_000,
  ) {
    this.tpm = Math.floor(tpm * 0.9)
  }

  private recent(): Array<{ at: number; tokens: number }> {
    const cutoff = this.now() - this.windowMs
    this.sent = this.sent.filter((s) => s.at > cutoff)
    return this.sent
  }

  /**
   * Infinity when the request alone is over the token limit: no wait makes it
   * fit, and Google would answer every attempt with a 429.
   */
  readyInMs(tokens: number): number {
    if (this.tpm > 0 && tokens > this.tpm) return Infinity
    const sent = this.recent()
    const now = this.now()
    let wait = 0
    if (this.rpm > 0 && sent.length >= this.rpm) wait = sent[sent.length - this.rpm]!.at + this.windowMs - now
    if (this.tpm > 0) {
      // Oldest requests leave the minute first; wait until enough have left.
      let total = sent.reduce((sum, s) => sum + s.tokens, 0)
      for (const s of sent) {
        if (total + tokens <= this.tpm) break
        total -= s.tokens
        wait = Math.max(wait, s.at + this.windowMs - now)
      }
    }
    return Math.max(0, wait)
  }

  reserve(tokens: number): void {
    this.recent().push({ at: this.now(), tokens })
  }
}

/**
 * Saturation, quota, timeout or a dropped connection: the request itself was
 * fine, the provider just could not answer now. The chain moves on to the
 * next provider and pauses this one (for `retryAfterMs` when the provider
 * said how long, via Retry-After).
 */
/**
 * The provider answered, but the answer cannot be used (cut by the length
 * limit). Like an unparseable reply: the next model gets the request, and a
 * window no model answers whole is split in two.
 */
export class BadReplyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BadReplyError'
  }
}

/**
 * Every usable model is out of its daily quota (or set aside for the day):
 * no wait inside the job brings one back. `retryAt` (epoch ms) is when the
 * earliest of them comes back, so the caller can put the work off until then.
 */
export class DailyQuotaExhaustedError extends Error {
  readonly name = 'DailyQuotaExhaustedError'
  constructor(
    message: string,
    readonly retryAt: number,
  ) {
    super(message)
  }
}

/**
 * Every model stayed saturated or unreachable through all the retry rounds,
 * and none gave an unusable answer: the request is fine, the moment is not.
 * Splitting the request would not help; asking again later does. `retryAt`
 * (epoch ms) is when the earliest model's pause ends.
 */
export class AllProvidersBusyError extends Error {
  readonly name = 'AllProvidersBusyError'
  constructor(
    message: string,
    readonly retryAt: number,
  ) {
    super(message)
  }
}

/** A model that does not exist (retired or misspelled) is set aside for a day, not the whole job. */
const MISSING_MODEL_PAUSE_MS = 24 * 3_600_000

export class ProviderOverloadedError extends Error {
  constructor(
    provider: string,
    public readonly status: number | string,
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
 * How long Google asks to wait, from the RetryInfo in a 429 body
 * ("retryDelay": "23s"); the Retry-After header wins when present. Waiting
 * exactly that, not a fixed minute, is what makes a per-minute limit cheap.
 */
export function retryAfterOf(header: string | null, body: string, now = Date.now()): number | undefined {
  // A daily quota resets at midnight Pacific time; Google's short retryDelay
  // would have every later request of the day spend a call to hear "no".
  if (/"quotaId"\s*:\s*"[^"]*PerDay/.test(body)) return untilPacificMidnight(now)
  const fromHeader = parseRetryAfter(header)
  if (fromHeader !== undefined) return fromHeader
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body)
  return m ? Math.ceil(Number(m[1]) * 1000) : undefined
}

/** Pacific wall-clock time minus UTC at `at`, in ms (-7 h or -8 h). */
function pacificOffsetMs(at: number): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(at / 1000) * 1000
}

/**
 * Until the next midnight in California. Found as an instant, with the offset
 * that holds at that midnight: "24 h minus the time elapsed today" was an hour
 * off on the 23- and 25-hour days when the clocks change.
 */
function untilPacificMidnight(now: number): number {
  const today = new Date(now + pacificOffsetMs(now))
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1)
  let at = midnight - pacificOffsetMs(now)
  at = midnight - pacificOffsetMs(at)
  return at - now
}

/** The quota a 429 names (e.g. "...InputTokensPerModelPerMinute"), put first so it survives the 200-character message. */
export function quotaDetail(body: string): string {
  const id = /"quotaId"\s*:\s*"([^"]+)"/.exec(body)?.[1]
  // The cap goes up front too: the message keeps only its first 200
  // characters, and the worker learns the daily limit from it.
  const value = /"quotaValue"\s*:\s*"?(\d+)/.exec(body)?.[1]
  return id ? `[${id}${value ? `, limit: ${value}` : ''}] ${body}` : body
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
      throw new ProviderOverloadedError(provider, res.status, quotaDetail(text), retryAfterOf(res.headers.get('retry-after'), text))
    }
    if (res.status === 404) throw new ProviderOverloadedError(provider, 404, `el modelo no existe o fue retirado: ${text.slice(0, 200)}`, MISSING_MODEL_PAUSE_MS)
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
        throw new ProviderOverloadedError(provider, res.status, quotaDetail(text), retryAfterOf(res.headers.get('retry-after'), text))
      }
      if (res.status === 404) throw new ProviderOverloadedError(provider, 404, `el modelo no existe o fue retirado: ${text.slice(0, 200)}`, MISSING_MODEL_PAUSE_MS)
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
