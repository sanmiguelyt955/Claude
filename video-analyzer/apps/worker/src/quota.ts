import { getQuotaWindowCounts, nextQuotaResetDate, getModelDailyLimits } from '@cva/memory-engine'
import type { Db } from '@cva/memory-engine'

/**
 * Local pre-flight guard against the account's REAL free-tier limits —
 * verified in Google AI Studio's rate-limit panel and confirmed by Google's
 * own 429 payload, which reports the daily cap as
 * `GenerateRequestsPerDayPerProjectPerModel-FreeTier` with a `model`
 * dimension. That per-model dimension is the important part: each model
 * carries its own 20/day, so listing several models in GEMINI_VIDEO_MODELS
 * multiplies real daily capacity instead of just shuffling the same bucket.
 */
const MAX_RPM = Number(process.env.GEMINI_MAX_RPM ?? 5)
const MAX_TPM = Number(process.env.GEMINI_MAX_TPM ?? 250_000)
const MAX_RPD = Number(process.env.GEMINI_MAX_RPD ?? 20)

export type QuotaCheck = { ok: true } | { ok: false; retryAfter: Date; reason: string }

/**
 * Per-model caps written by hand from the account's own rate-limit panel
 * (aistudio.google.com/rate-limit), as "model=RPD" pairs. Google does NOT
 * publish free-tier limits per model anywhere in the docs — that panel is the
 * only authoritative source — and the limits differ wildly between models
 * (the newest Flash models sit at 20/day while older Lite models are
 * reportedly in the hundreds or thousands). Without this, the app has to fall
 * back to one assumed number for everything, which is always wrong for most
 * of the list.
 */
function configuredLimits(): Record<string, number> {
  const raw = process.env.GEMINI_MODEL_DAILY_LIMITS?.trim()
  if (!raw) return {}
  const out: Record<string, number> = {}
  for (const pair of raw.split(',')) {
    const [model, value] = pair.split('=').map((x) => x.trim())
    const limit = Number(value)
    if (model && Number.isFinite(limit) && limit > 0) out[model] = limit
  }
  return out
}

/**
 * The daily cap to enforce for a model, best source first: what Google itself
 * reported in a real 429, then what was configured by hand from the panel,
 * then the blanket assumption.
 */
export function dailyLimitFor(db: Db, model: string): number {
  return getModelDailyLimits(db)[model] ?? configuredLimits()[model] ?? MAX_RPD
}

/** Quota check scoped to one model — the only scope Google actually enforces. */
export function checkQuota(db: Db, model: string): QuotaCheck {
  const counts = getQuotaWindowCounts(db, model)
  const limit = dailyLimitFor(db, model)

  if (counts.requestsToday >= limit) {
    return {
      ok: false,
      retryAfter: nextQuotaResetDate(),
      reason: `Se alcanzo el limite diario de ${model} (${counts.requestsToday}/${limit} peticiones hoy).`,
    }
  }

  // RPM and TPM are per-project in practice, so they are counted across models.
  const allModels = getQuotaWindowCounts(db)

  if (allModels.requestsLastMinute >= MAX_RPM) {
    return {
      ok: false,
      retryAfter: new Date(Date.now() + 60_000),
      reason: `Se alcanzo el limite por minuto de Gemini (${allModels.requestsLastMinute}/${MAX_RPM} peticiones en el ultimo minuto).`,
    }
  }

  if (allModels.tokensLastMinute >= MAX_TPM) {
    return {
      ok: false,
      retryAfter: new Date(Date.now() + 60_000),
      reason: `Se alcanzo el limite de tokens por minuto de Gemini (${allModels.tokensLastMinute}/${MAX_TPM}).`,
    }
  }

  return { ok: true }
}

export type ModelChoice = { ok: true; model: string } | { ok: false; retryAfter: Date; reason: string }

/** True for Google's "you ran out of daily requests for this model" (429). */
export function isQuotaExhaustedError(error: unknown): boolean {
  const message = (error as Error)?.message ?? ''
  return message.includes('RESOURCE_EXHAUSTED') || message.includes('"code":429')
}

/**
 * Every configured model that still has daily quota according to the local
 * counter, in priority order. The caller walks this list: if Google rejects
 * one with a 429 anyway (the local counter can lag reality), it just moves to
 * the next model instead of failing the job.
 */
export function listVideoModelsWithQuota(db: Db): string[] {
  return videoModels().filter((model) => checkQuota(db, model).ok)
}

/**
 * Models available for the text-only skill calls. GEMINI_SKILL_MODELS can
 * narrow it, but by default it is the same pool as video: these are plain
 * text+JSON calls, so any multimodal model can serve them — and they draw
 * from the same per-model daily caps, which is exactly why "Crear Skill" used
 * to die once gemini-3.7-flash alone ran out.
 */
export function listSkillModelsWithQuota(db: Db): string[] {
  const configured = process.env.GEMINI_SKILL_MODELS?.trim()
  const pool = configured
    ? configured.split(',').map((m) => m.trim()).filter(Boolean)
    : videoModels()
  return pool.filter((model) => checkQuota(db, model).ok)
}

/**
 * Text-output models with actual free-tier quota, read from the account's own
 * rate-limit panel (aistudio.google.com/rate-limit) on 2026-09-12 — the only
 * authoritative source, since Google publishes none of this.
 *
 * Deliberately EXCLUDED because their free-tier limit is literally 0 (they
 * would only waste a rotation step): Gemini 3.1 Pro, 2.5 Pro, 2 Flash,
 * 2 Flash Lite, and both Omni models. Aliases (gemini-flash-latest) are also
 * out: they resolve to a model already listed and would double-count.
 *
 * The real numbers: 20/day for every Flash, but **500/day** for Gemini 3.5
 * and 3.1 Flash Lite. That asymmetry is the whole story — the Lite models
 * carry ~88% of the daily capacity.
 */
const DEFAULT_VIDEO_MODELS = [
  // Flash: mejor calidad, 20/dia cada uno.
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  // Flash Lite: calidad menor pero 500/dia los de 3.x — es donde vive la
  // capacidad real, asi que van al final como caballo de batalla.
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
]

function videoModels(): string[] {
  const configured = process.env.GEMINI_VIDEO_MODELS?.trim()
  if (configured) return configured.split(',').map((m) => m.trim()).filter(Boolean)
  const single = process.env.GEMINI_VIDEO_MODEL?.trim()
  return single ? [single] : DEFAULT_VIDEO_MODELS
}

/**
 * Picks the first configured video model that still has daily quota left.
 * Falling back to the next model is what turns "20 analisis al dia" into
 * "20 por modelo" — with two models configured that is 40, at the cost of
 * the second model being a slightly different engine.
 */
export function pickVideoModel(db: Db): ModelChoice {
  const models = videoModels()
  let lastBlock: { retryAfter: Date; reason: string } | undefined

  for (const model of models) {
    const check = checkQuota(db, model)
    if (check.ok) return { ok: true, model }
    lastBlock = { retryAfter: check.retryAfter, reason: check.reason }
    // A per-minute/token block is project-wide: trying another model won't help.
    if (!check.reason.includes('limite diario')) break
  }

  return {
    ok: false,
    retryAfter: lastBlock?.retryAfter ?? new Date(Date.now() + 60_000),
    reason:
      models.length > 1 && lastBlock?.reason.includes('limite diario')
        ? `Sin cupo diario en ninguno de los modelos configurados (${models.join(', ')}).`
        : (lastBlock?.reason ?? 'Sin cupo disponible.'),
  }
}
