import type { Db } from '../db.js'
import { getDb } from '../db.js'

const META_KEY = 'model_daily_limits'

/**
 * Per-model daily request caps, as reported by Google itself in the 429 it
 * returns when one is hit (`"quotaValue":"20"`). Free-tier limits are NOT
 * published per model in models.list and are not the same across models, so
 * assuming one number for all of them is guesswork. Learning them from the
 * real rejections turns the quota display from an estimate into a fact —
 * for whichever models have actually been pushed to their limit so far.
 */
export function getModelDailyLimits(db: Db = getDb()): Record<string, number> {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(META_KEY) as { value: string } | undefined
  if (!row) return {}
  try {
    return JSON.parse(row.value) as Record<string, number>
  } catch {
    return {}
  }
}

/**
 * Per-model caps copied by hand from aistudio.google.com/rate-limit, as
 * GEMINI_MODEL_DAILY_LIMITS="model=RPD,model=RPD".
 */
function configuredDailyLimits(): Record<string, number> {
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

export type ModelDailyLimit = {
  limit: number
  /** google = learned from a real 429; config = GEMINI_MODEL_DAILY_LIMITS; assumed = GEMINI_MAX_RPD fallback. */
  source: 'google' | 'config' | 'assumed'
}

/**
 * The daily cap for one model, best source first. The ONLY place this is
 * decided: the worker's pre-flight guard and the quota screen used to compute
 * it separately, and the screen ignored GEMINI_MODEL_DAILY_LIMITS entirely —
 * so it showed 20/day for Flash Lite models whose real cap is 500.
 */
export function resolveModelDailyLimit(model: string, db: Db = getDb()): ModelDailyLimit {
  const learned = getModelDailyLimits(db)[model]
  if (learned !== undefined) return { limit: learned, source: 'google' }
  const configured = configuredDailyLimits()[model]
  if (configured !== undefined) return { limit: configured, source: 'config' }
  return { limit: Number(process.env.GEMINI_MAX_RPD ?? 20), source: 'assumed' }
}

export function recordModelDailyLimit(model: string, limit: number, db: Db = getDb()): void {
  if (!Number.isFinite(limit) || limit <= 0) return
  const current = getModelDailyLimits(db)
  if (current[model] === limit) return
  current[model] = limit
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(META_KEY, JSON.stringify(current))
}
