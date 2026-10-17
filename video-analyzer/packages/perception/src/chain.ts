import { ProviderOverloadedError, type VisionProvider, type VisionRequest } from './providers/types.js'

const pausedUntil = new Map<string, number>()

/** Errors that mean "try the next provider": overload, quota, timeout or network. */
export function shouldFallback(err: unknown): boolean {
  if (err instanceof ProviderOverloadedError) return true
  return /overload|high demand|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(String(err))
}

export type FallbackOptions<T> = {
  /** Default pause for a provider that overloaded without saying how long. */
  cooldownMs?: number
  /** Full passes over the provider list before giving up. */
  maxRounds?: number
  /** Longest single wait between rounds, so a huge Retry-After cannot stall a job for hours. */
  maxWaitMs?: number
  /**
   * Turns the reply into a value; if it throws (bad JSON, wrong shape) the
   * next provider gets the same request. The provider is not paused for it.
   */
  parse?: (text: string) => T
  log?: (msg: string) => void
  sleep?: (ms: number) => Promise<void>
  /**
   * Called for every request actually sent to a provider, answered or not.
   * Quotas count requests, so the caller records each one under its model.
   */
  onAttempt?: (attempt: { provider: string; ok: boolean; error?: string; latencyMs: number }) => void
}

/**
 * Runs the request on the first provider that answers. An overloaded
 * provider is paused (for its Retry-After, or `cooldownMs`) so the next
 * windows go straight to a healthy one. When every provider is paused, the
 * chain waits for the earliest one to come back instead of failing the job:
 * with a single key, a 503 must cost a wait, not the whole analysis.
 */
export async function describeWithFallback<T = string>(
  providers: VisionProvider[],
  req: VisionRequest,
  opts: FallbackOptions<T> = {},
): Promise<{ provider: string; text: string; value: T }> {
  const cooldownMs = opts.cooldownMs ?? 60_000
  const maxRounds = opts.maxRounds ?? 4
  const maxWaitMs = opts.maxWaitMs ?? 120_000
  const parse = opts.parse ?? ((text: string) => text as unknown as T)
  const log = opts.log ?? (() => {})
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  const usable = providers.filter((p) => p.available())
  if (usable.length === 0) {
    throw new Error('Ningún proveedor de visión tiene clave configurada (ANTHROPIC_API_KEY, GEMINI_API_KEY).')
  }

  const failures: string[] = []
  for (let round = 1; round <= maxRounds; round++) {
    let parseFailures = 0
    for (const p of usable) {
      if ((pausedUntil.get(p.name) ?? 0) > Date.now()) continue
      let text: string
      const started = Date.now()
      try {
        text = await p.describe(req)
        opts.onAttempt?.({ provider: p.name, ok: true, latencyMs: Date.now() - started })
      } catch (err) {
        opts.onAttempt?.({ provider: p.name, ok: false, error: String(err), latencyMs: Date.now() - started })
        if (!shouldFallback(err)) throw err
        const pause = (err instanceof ProviderOverloadedError ? err.retryAfterMs : undefined) ?? cooldownMs
        pausedUntil.set(p.name, Date.now() + pause)
        log(`${p.name} no disponible, pasando al siguiente: ${String(err)}`)
        failures.push(String(err))
        continue
      }
      try {
        pausedUntil.delete(p.name)
        return { provider: p.name, text, value: parse(text) }
      } catch (err) {
        parseFailures++
        log(`${p.name} respondió algo no válido, probando el siguiente: ${String(err)}`)
        failures.push(`${p.name}: respuesta no válida (${String(err).slice(0, 120)})`)
      }
    }

    // Every provider answered with garbage: waiting will not fix that.
    if (parseFailures === usable.length) break
    if (round === maxRounds) break

    const next = Math.min(...usable.map((p) => pausedUntil.get(p.name) ?? 0))
    const wait = Math.min(Math.max(next - Date.now(), 0), maxWaitMs)
    log(`todos los proveedores en pausa; reintento ${round + 1}/${maxRounds} en ${Math.round(wait / 1000)}s`)
    await sleep(wait)
    // The wait may be capped below the real pause; let them try again anyway.
    for (const p of usable) pausedUntil.delete(p.name)
  }
  throw new Error(`Ningún proveedor de visión pudo responder: ${failures.slice(-6).join(' | ')}`)
}
