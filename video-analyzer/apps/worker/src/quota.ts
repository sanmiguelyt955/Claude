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
 * The daily cap to enforce for a model: the real one Google reported in a
 * previous 429 if we have learned it, otherwise the configured assumption.
 */
export function dailyLimitFor(db: Db, model: string): number {
  return getModelDailyLimits(db)[model] ?? MAX_RPD
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
 * Every general-purpose multimodal model the account can reach, newest and
 * highest-quality first, as reported by the API's own models.list (image-gen,
 * TTS, music, robotics and text-only Gemma models filtered out). Since the
 * free-tier daily cap is per model, this list IS the daily capacity: ~20
 * analyses per model. Aliases like gemini-flash-latest are deliberately left
 * out — they resolve to a model already in this list and would double-count.
 */
const DEFAULT_VIDEO_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-omni-1.1-flash',
  'gemini-omni-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
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
