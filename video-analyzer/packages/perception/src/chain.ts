import { ProviderOverloadedError, type VisionProvider, type VisionRequest } from './providers/types.js'

const cooldownUntil = new Map<string, number>()

/** Errors that mean "try the next provider": overload, quota, or a model that is down. */
export function shouldFallback(err: unknown): boolean {
  if (err instanceof ProviderOverloadedError) return true
  return /overload|high demand|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(String(err))
}

/**
 * Runs the request on the first provider that answers. A provider that
 * returned an overload is paused for `cooldownMs` so the next windows go
 * straight to the healthy one instead of paying the failed call again.
 */
export async function describeWithFallback(
  providers: VisionProvider[],
  req: VisionRequest,
  opts: { cooldownMs?: number; log?: (msg: string) => void } = {},
): Promise<{ provider: string; text: string }> {
  const cooldownMs = opts.cooldownMs ?? 60_000
  const log = opts.log ?? (() => {})
  const usable = providers.filter((p) => p.available())
  if (usable.length === 0) {
    throw new Error('Ningún proveedor de visión tiene clave configurada (ANTHROPIC_API_KEY, GEMINI_API_KEY).')
  }

  const failures: string[] = []
  for (const p of usable) {
    if ((cooldownUntil.get(p.name) ?? 0) > Date.now()) {
      failures.push(`${p.name}: en pausa por saturación`)
      continue
    }
    try {
      return { provider: p.name, text: await p.describe(req) }
    } catch (err) {
      if (!shouldFallback(err)) throw err
      cooldownUntil.set(p.name, Date.now() + cooldownMs)
      log(`[perception] ${p.name} no disponible, pasando al siguiente: ${String(err)}`)
      failures.push(String(err))
    }
  }
  throw new Error(`Todos los proveedores de visión están saturados: ${failures.join(' | ')}`)
}
