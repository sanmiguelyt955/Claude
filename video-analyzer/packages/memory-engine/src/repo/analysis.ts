import { randomUUID } from 'node:crypto'
import type { Db } from '../db.js'
import { getDb } from '../db.js'
import type { AnalysisRunRow } from '../types.js'

export type InsertAnalysisRunInput = {
  videoId: string
  jobId?: string
  phase: AnalysisRunRow['phase']
  model: string
  processingMode: 'STATIC' | 'AGENTIC' | null
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  thoughtTokens: number
  estimatedCostUsd: number
  latencyMs: number
  succeeded: boolean
  errorMessage?: string | null
  rawResponsePath?: string | null
  /** Real API requests this row represents: 1 normally, 0 for the extra
   * videos that rode along in a batched call. */
  requestCount?: number
}

export function insertAnalysisRun(input: InsertAnalysisRunInput, db: Db = getDb()): AnalysisRunRow {
  const id = randomUUID()
  db.prepare(
    `INSERT INTO analysis_runs (
       id, video_id, job_id, phase, provider, model, processing_mode,
       input_tokens, output_tokens, cached_tokens, thought_tokens,
       estimated_cost_usd, latency_ms, succeeded, error_message, raw_response_path, request_count
     ) VALUES (
       @id, @videoId, @jobId, @phase, 'gemini', @model, @processingMode,
       @inputTokens, @outputTokens, @cachedTokens, @thoughtTokens,
       @estimatedCostUsd, @latencyMs, @succeeded, @errorMessage, @rawResponsePath, @requestCount
     )`,
  ).run({
    id,
    videoId: input.videoId,
    jobId: input.jobId ?? null,
    phase: input.phase,
    model: input.model,
    processingMode: input.processingMode,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    cachedTokens: input.cachedTokens,
    thoughtTokens: input.thoughtTokens,
    estimatedCostUsd: input.estimatedCostUsd,
    latencyMs: input.latencyMs,
    succeeded: input.succeeded ? 1 : 0,
    errorMessage: input.errorMessage ?? null,
    rawResponsePath: input.rawResponsePath ?? null,
    requestCount: input.requestCount ?? 1,
  })
  return db.prepare('SELECT * FROM analysis_runs WHERE id = ?').get(id) as AnalysisRunRow
}

export type QuotaWindowCounts = {
  requestsLastMinute: number
  requestsToday: number
  tokensLastMinute: number
}

/** Minutes that `tz` is offset from UTC at a given instant (negative west of UTC). */
function timeZoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  // Reading the wall-clock time in `tz` as if it were UTC gives the offset.
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - at.getTime()) / 60_000)
}

/**
 * Start of the current quota day, as a UTC ISO string.
 *
 * Gemini's free-tier daily quota resets at midnight **Pacific time**, not UTC
 * — confirmed the hard way: the local counter read 0/20 just after UTC
 * midnight while Google was still rejecting calls with
 * `GenerateRequestsPerDayPerProjectPerModel-FreeTier, limit: 20`. Counting on
 * a UTC boundary hands out a false green light for up to 8 hours a day.
 */
function startOfQuotaDayIso(now = new Date()): string {
  const timeZone = process.env.GEMINI_QUOTA_TIMEZONE ?? 'America/Los_Angeles'
  const dayThere = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const offsetMinutes = timeZoneOffsetMinutes(timeZone, now)
  return new Date(Date.parse(`${dayThere}T00:00:00Z`) - offsetMinutes * 60_000).toISOString()
}

/**
 * Counts Gemini calls the app itself has made, straight from analysis_runs —
 * survives worker restarts (unlike an in-memory counter). Every row counts
 * regardless of `succeeded`: a call that came back 500/503 still spent one of
 * the account's real daily requests.
 *
 * Pass `model` to scope the count to one model. Google's own 429 payload
 * reports the quota as `GenerateRequestsPerDayPerProjectPerModel-FreeTier`
 * with a `model` dimension, so each model carries its own 20/day — which is
 * what makes rotating between models a real capacity increase, not a trick.
 */
export function getQuotaWindowCounts(db: Db = getDb(), model?: string): QuotaWindowCounts {
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
  const startOfToday = startOfQuotaDayIso()
  const modelFilter = model ? ' AND model = ?' : ''
  const args = (since: string) => (model ? [since, model] : [since])

  const perMinute = db
    .prepare(
      `SELECT COALESCE(SUM(request_count), 0) AS requests,
              COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
         FROM analysis_runs WHERE created_at >= ?${modelFilter}`,
    )
    .get(...args(oneMinuteAgo)) as { requests: number; tokens: number }

  const perDay = db
    .prepare(
      `SELECT COALESCE(SUM(request_count), 0) AS requests FROM analysis_runs WHERE created_at >= ?${modelFilter}`,
    )
    .get(...args(startOfToday)) as { requests: number }

  return {
    requestsLastMinute: perMinute.requests,
    requestsToday: perDay.requests,
    tokensLastMinute: perMinute.tokens,
  }
}

/** When the current quota day rolls over, for a deferral's `run_after`. */
export function nextQuotaResetDate(now = new Date()): Date {
  const startOfToday = new Date(startOfQuotaDayIso(now))
  return new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 + 60_000)
}

export function listAnalysisRunsForVideo(videoId: string, db: Db = getDb()): AnalysisRunRow[] {
  return db
    .prepare('SELECT * FROM analysis_runs WHERE video_id = ? ORDER BY created_at')
    .all(videoId) as AnalysisRunRow[]
}
