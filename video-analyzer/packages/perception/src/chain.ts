import { ProviderOverloadedError, type VisionProvider, type VisionRequest } from './providers/types.js'

const pausedUntil = new Map<string, number>()
/** Pause after a 503 that says nothing about how long: demand spikes are short. */
const SPIKE_PAUSE_MS = 15_000
/** Models whose daily quota is spent: the retry rounds do not wake them before it resets. */
const dailyUntil = new Map<string, number>()

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
  /** Wait up to this long for a better provider before using a fallbackOnly one. */
  preferWaitMs?: number
  /**
   * Turns the reply into a value; if it throws (bad JSON, wrong shape) the
   * next provider gets the same request. The provider is not paused for it.
   */
  parse?: (text: string) => T
  log?: (msg: string) => void
  sleep?: (ms: number) => Promise<void>
  /** Clock for the pauses (tests). */
  now?: () => number
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
 *
 * Providers that know their per-minute limits (readyInMs) are only sent a
 * request that fits, so Google's 429 becomes the exception. A provider marked
 * fallbackOnly (Flash-Lite) is used only when the better ones would keep the
 * request waiting more than `preferWaitMs` (65 s: longer than any per-minute
 * wait), so it stands in for a model that is down or out of daily quota,
 * never for one that is only pacing itself.
 */
export async function describeWithFallback<T = string>(
  providers: VisionProvider[],
  req: VisionRequest,
  opts: FallbackOptions<T> = {},
): Promise<{ provider: string; text: string; value: T }> {
  const cooldownMs = opts.cooldownMs ?? 60_000
  const maxRounds = opts.maxRounds ?? 4
  const maxWaitMs = opts.maxWaitMs ?? 120_000
  const preferWaitMs = opts.preferWaitMs ?? 65_000
  const parse = opts.parse ?? ((text: string) => text as unknown as T)
  const log = opts.log ?? (() => {})
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = opts.now ?? Date.now

  const usable = providers.filter((p) => p.available())
  if (usable.length === 0) {
    throw new Error('Ningún proveedor de visión tiene clave configurada (ANTHROPIC_API_KEY, GEMINI_API_KEY).')
  }

  const waitOf = (p: VisionProvider) =>
    Math.max((pausedUntil.get(p.name) ?? 0) - now(), p.readyInMs?.(req) ?? 0, 0)

  const failures: string[] = []
  let round = 1
  let parseFailures = 0
  const tried = new Set<string>()
  // Google's 503 "high demand" spikes pass in seconds. When every good model
  // is in one, waiting a little and asking them again keeps the request off
  // Flash-Lite (a 2-minute documentary on 19 Oct 2026 had its phase 1, the
  // entity register the whole record builds on, answered by Flash-Lite).
  const overloads = new Map<string, number>()
  const badReply = new Set<string>()
  const hasFallback = usable.some((p) => p.fallbackOnly)
  for (;;) {
    const untried = usable.filter((p) => !tried.has(p.name))
    let pick = untried.find((p) => !p.fallbackOnly && waitOf(p) === 0)
    if (!pick) {
      const better = untried.filter((p) => !p.fallbackOnly).map(waitOf)
      const soonest = better.length ? Math.min(...better) : Infinity
      if (soonest <= preferWaitMs) {
        log(`esperando ${Math.ceil(soonest / 1000)}s al límite por minuto del modelo principal en vez de bajar de calidad`)
        await sleep(soonest)
        continue
      }
      const again = hasFallback ? usable.filter((p) => !p.fallbackOnly && tried.has(p.name) && !badReply.has(p.name) && (overloads.get(p.name) ?? 0) < 2) : []
      const soonestAgain = again.length ? Math.min(...again.map(waitOf)) : Infinity
      if (soonestAgain <= preferWaitMs) {
        log(`los modelos principales están saturados; reintento en ${Math.ceil(soonestAgain / 1000)}s en vez de bajar de calidad`)
        await sleep(soonestAgain)
        for (const p of again) tried.delete(p.name)
        continue
      }
      pick = untried.find((p) => p.fallbackOnly && waitOf(p) === 0)
    }

    if (!pick) {
      // Providers not yet asked that only wait for their own per-minute turn:
      // that is pacing, not failure, and must not use up a retry round (with
      // Flash-Lite alone, 16 windows queued for it failed a job unasked on
      // 19 Oct 2026).
      const pacing = usable.filter((p) => !tried.has(p.name) && (pausedUntil.get(p.name) ?? 0) <= now())
      if (pacing.length) {
        const wait = Math.min(...pacing.map(waitOf))
        await sleep(Math.max(wait, 1))
        continue
      }
      // Every provider answered with garbage: waiting will not fix that.
      if (parseFailures === usable.length || round === maxRounds) break
      // Waiting minutes cannot bring back a quota that resets at midnight.
      if (usable.every((p) => (dailyUntil.get(p.name) ?? 0) > now())) {
        failures.push('todos los modelos agotaron su cuota del día (se renueva a medianoche, hora de California)')
        break
      }
      const wait = Math.min(Math.min(...usable.map(waitOf)), maxWaitMs)
      log(`todos los proveedores en pausa; reintento ${round + 1}/${maxRounds} en ${Math.round(wait / 1000)}s`)
      await sleep(wait)
      // The wait may be capped below the real pause; let them try again anyway.
      for (const p of usable) if ((dailyUntil.get(p.name) ?? 0) <= now()) pausedUntil.delete(p.name)
      tried.clear()
      badReply.clear()
      overloads.clear()
      parseFailures = 0
      round++
      continue
    }

    const p = pick
    tried.add(p.name)
    p.reserve?.(req)
    let text: string
    const started = now()
    try {
      text = await p.describe(req)
      opts.onAttempt?.({ provider: p.name, ok: true, latencyMs: now() - started })
    } catch (err) {
      opts.onAttempt?.({ provider: p.name, ok: false, error: String(err), latencyMs: now() - started })
      if (!shouldFallback(err)) throw err
      overloads.set(p.name, (overloads.get(p.name) ?? 0) + 1)
      const spike = err instanceof ProviderOverloadedError && err.status === 503 ? SPIKE_PAUSE_MS : cooldownMs
      const pause = (err instanceof ProviderOverloadedError ? err.retryAfterMs : undefined) ?? spike
      pausedUntil.set(p.name, now() + pause)
      if (/PerDay/.test(String(err))) dailyUntil.set(p.name, now() + pause)
      log(`${p.name} no disponible, pasando al siguiente: ${String(err)}`)
      failures.push(String(err))
      continue
    }
    try {
      pausedUntil.delete(p.name)
      return { provider: p.name, text, value: parse(text) }
    } catch (err) {
      parseFailures++
      badReply.add(p.name)
      log(`${p.name} respondió algo no válido, probando el siguiente: ${String(err)}`)
      failures.push(`${p.name}: respuesta no válida (${String(err).slice(0, 120)})`)
    }
  }
  throw new Error(`Ningún proveedor de visión pudo responder: ${failures.slice(-6).join(' | ')}`)
}
