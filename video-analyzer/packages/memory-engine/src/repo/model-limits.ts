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

export function recordModelDailyLimit(model: string, limit: number, db: Db = getDb()): void {
  if (!Number.isFinite(limit) || limit <= 0) return
  const current = getModelDailyLimits(db)
  if (current[model] === limit) return
  current[model] = limit
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(META_KEY, JSON.stringify(current))
}
