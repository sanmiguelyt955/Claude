import { getQuotaWindowCounts, nextQuotaResetDate, resolveModelDailyLimit } from '@cva/memory-engine'
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

export type QuotaCheck = { ok: true } | { ok: false; retryAfter: Date; reason: string }

/**
 * The daily cap to enforce for a model: Google's own 429, then
 * GEMINI_MODEL_DAILY_LIMITS, then GEMINI_MAX_RPD. Shared with the quota
 * screen through memory-engine so both always show the same number.
 */
export function dailyLimitFor(db: Db, model: string): number {
  return resolveModelDailyLimit(model, db).limit
}

/** Quota check scoped to one model — the only scope Google actually enforces. */
export function checkQuota(db: Db, model: string): QuotaCheck {
  const counts = getQuotaWindowCounts(db, model)
  const limit = dailyLimitFor(db, model)

  if (counts.requestsToday >= limit) {
    return {
      ok: false,
      retryAfter: nextQuotaResetDate(),
      reason: `Se alcanzó el límite diario de ${model} (${counts.requestsToday}/${limit} peticiones hoy).`,
    }
  }

  // RPM and TPM are enforced per model too (Google's quota ids are
  // `...PerProjectPerModel`). Observed 2 Oct 2026: 12 requests in one minute
  // spread across models drew zero 429s. Counting them project-wide here
  // deferred every next video by a minute for no reason, once requests
  // started being logged live instead of at the end of each job.
  if (counts.requestsLastMinute >= MAX_RPM) {
    return {
      ok: false,
      retryAfter: minuteFreesAt(db, model),
      reason: `Se alcanzó el límite por minuto de ${model} (${counts.requestsLastMinute}/${MAX_RPM} peticiones en el último minuto).`,
    }
  }

  if (counts.tokensLastMinute >= MAX_TPM) {
    return {
      ok: false,
      retryAfter: minuteFreesAt(db, model),
      reason: `Se alcanzó el límite de tokens por minuto de ${model} (${counts.tokensLastMinute}/${MAX_TPM}).`,
    }
  }

  return { ok: true }
}

/** When the oldest request of the last minute leaves the window: the model can take another then. */
function minuteFreesAt(db: Db, model: string): Date {
  const oldest = (
    db
      .prepare('SELECT MIN(created_at) AS at FROM analysis_runs WHERE model = ? AND created_at >= ? AND request_count > 0')
      .get(model, new Date(Date.now() - 60_000).toISOString()) as { at: string | null }
  ).at
  return new Date(Math.max(Date.now() + 1_000, (oldest ? Date.parse(oldest) : Date.now()) + 60_000))
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
  return skillModels().filter((model) => checkQuota(db, model).ok)
}

/**
 * GEMINI_SKILL_MODELS when set; otherwise GEMINI_SKILL_MODEL first (it used
 * to be only a label, so setting it to Flash-Lite still spent the scarce
 * 20/day of gemini-3.8-flash on every skill call), then the video pool.
 */
function skillModels(): string[] {
  const configured = process.env.GEMINI_SKILL_MODELS?.trim()
  if (configured) return configured.split(',').map((m) => m.trim()).filter(Boolean)
  const first = process.env.GEMINI_SKILL_MODEL?.trim()
  return [...new Set([...(first ? [first] : []), ...videoModels()])]
}

/** Why no skill model can take a request now, and the earliest moment one can. */
export function skillPoolBlock(db: Db): { retryAfter: Date; reason: string } {
  return poolBlock(db, skillModels())
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
 * ALSO excluded, for a different reason: Gemini 2.5 Flash and 2.5 Flash Lite
 * return a permanent 404 ("no longer available to new users", pointing at
 * 3.6-flash / 3.5-flash-lite as replacements) — confirmed live 13 sep 2026.
 * Not a rate limit, not a transient outage: Google retired them. Keeping a
 * retired model in rotation just spends a wasted request every single run.
 *
 * The real numbers: 20/day for every Flash, but **500/day** for Gemini 3.5
 * and 3.1 Flash Lite. That asymmetry is the whole story — the Lite models
 * carry ~88% of the daily capacity.
 */
const DEFAULT_VIDEO_MODELS = [
  // Flash: mejor calidad, 20/dia cada uno.
  // gemini-2.5-flash y gemini-2.5-flash-lite fueron sacados de esta lista:
  // ambos devuelven 404 permanente ("no longer available to new users"),
  // confirmado en vivo el 13 sep 2026 -- no es una caida temporal, Google los
  // retiro. Dejarlos aqui solo gasta 2 peticiones inutiles (intento + retry)
  // en cada rotacion, en el peor momento posible: cuando ya se esta cayendo
  // en cascada por otros modelos con problemas reales.
  // gemini-3.7-flash y gemini-3.5-flash salieron por lo mismo: ya no aparecen
  // en la lista de modelos de Google (ai.google.dev/gemini-api/docs/models,
  // revisada el 17 oct 2026). gemini-3-flash-preview salió también: la
  // página de modelos obsoletos de Google lo da por reemplazado por
  // gemini-3.6-flash, que ya está aquí.
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  // Flash Lite: calidad menor pero 500/dia los de 3.x — es donde vive la
  // capacidad real, asi que van al final como caballo de batalla.
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
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
  for (const model of models) {
    // Every limit is per model, so a blocked model just means "try the next".
    if (checkQuota(db, model).ok) return { ok: true, model }
  }
  return { ok: false, ...poolBlock(db, models) }
}

/**
 * The earliest moment any model of the pool is free again. Taking the last
 * model's block instead put a job off until midnight because the Flash models
 * were out for the day, although Flash-Lite was only pacing itself and free
 * again within a minute.
 */
function poolBlock(db: Db, models: string[]): { retryAfter: Date; reason: string } {
  const blocks = models
    .map((model) => checkQuota(db, model))
    .filter((c): c is Extract<QuotaCheck, { ok: false }> => !c.ok)
  if (!blocks.length) return { retryAfter: new Date(Date.now() + 60_000), reason: 'Sin cupo disponible.' }
  const earliest = blocks.reduce((a, b) => (b.retryAfter < a.retryAfter ? b : a))
  const allDaily = blocks.length === models.length && blocks.every((b) => b.reason.includes('límite diario'))
  return {
    retryAfter: earliest.retryAfter,
    reason: allDaily && models.length > 1 ? `Sin cupo diario en ninguno de los modelos configurados (${models.join(', ')}).` : earliest.reason,
  }
}
