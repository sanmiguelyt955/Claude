import { getQuotaWindowCounts } from '@cva/memory-engine'
import type { Db } from '@cva/memory-engine'

/**
 * Local pre-flight guard against the account's REAL free-tier limits —
 * verified directly in Google AI Studio's rate-limit panel (bloque 1), not
 * the numbers PROJECT.md originally assumed. RPD=20 is the one that bites:
 * defaults here match gemini-3.7-flash/3.8-flash on this account exactly,
 * but stay overridable since Google can change them without notice.
 */
const MAX_RPM = Number(process.env.GEMINI_MAX_RPM ?? 5)
const MAX_TPM = Number(process.env.GEMINI_MAX_TPM ?? 250_000)
const MAX_RPD = Number(process.env.GEMINI_MAX_RPD ?? 20)

export type QuotaCheck = { ok: true } | { ok: false; retryAfter: Date; reason: string }

export function checkQuota(db: Db): QuotaCheck {
  const counts = getQuotaWindowCounts(db)

  if (counts.requestsToday >= MAX_RPD) {
    const tomorrow = new Date()
    tomorrow.setUTCHours(24, 0, 5, 0) // a few seconds past UTC midnight
    return {
      ok: false,
      retryAfter: tomorrow,
      reason: `Se alcanzo el limite diario de Gemini (${counts.requestsToday}/${MAX_RPD} peticiones hoy).`,
    }
  }

  if (counts.requestsLastMinute >= MAX_RPM) {
    return {
      ok: false,
      retryAfter: new Date(Date.now() + 60_000),
      reason: `Se alcanzo el limite por minuto de Gemini (${counts.requestsLastMinute}/${MAX_RPM} peticiones en el ultimo minuto).`,
    }
  }

  if (counts.tokensLastMinute >= MAX_TPM) {
    return {
      ok: false,
      retryAfter: new Date(Date.now() + 60_000),
      reason: `Se alcanzo el limite de tokens por minuto de Gemini (${counts.tokensLastMinute}/${MAX_TPM}).`,
    }
  }

  return { ok: true }
}
