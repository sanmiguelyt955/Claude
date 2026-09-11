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
}

export function insertAnalysisRun(input: InsertAnalysisRunInput, db: Db = getDb()): AnalysisRunRow {
  const id = randomUUID()
  db.prepare(
    `INSERT INTO analysis_runs (
       id, video_id, job_id, phase, provider, model, processing_mode,
       input_tokens, output_tokens, cached_tokens, thought_tokens,
       estimated_cost_usd, latency_ms, succeeded, error_message, raw_response_path
     ) VALUES (
       @id, @videoId, @jobId, @phase, 'gemini', @model, @processingMode,
       @inputTokens, @outputTokens, @cachedTokens, @thoughtTokens,
       @estimatedCostUsd, @latencyMs, @succeeded, @errorMessage, @rawResponsePath
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
  })
  return db.prepare('SELECT * FROM analysis_runs WHERE id = ?').get(id) as AnalysisRunRow
}

export type QuotaWindowCounts = {
  requestsLastMinute: number
  requestsToday: number
  tokensLastMinute: number
}

/**
 * Counts Gemini calls the app itself has made, straight from analysis_runs —
 * survives worker restarts (unlike an in-memory counter), which matters
 * given the account's real free-tier ceiling is 20 requests/day (bloque 1
 * investigation). Every row counts toward RPD/RPM regardless of `succeeded`:
 * a failed call still spent one of the account's real daily requests.
 */
export function getQuotaWindowCounts(db: Db = getDb()): QuotaWindowCounts {
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
  const startOfToday = new Date()
  startOfToday.setUTCHours(0, 0, 0, 0)

  const perMinute = db
    .prepare(
      `SELECT COUNT(*) AS requests, COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
         FROM analysis_runs WHERE created_at >= ?`,
    )
    .get(oneMinuteAgo) as { requests: number; tokens: number }

  const perDay = db
    .prepare(`SELECT COUNT(*) AS requests FROM analysis_runs WHERE created_at >= ?`)
    .get(startOfToday.toISOString()) as { requests: number }

  return {
    requestsLastMinute: perMinute.requests,
    requestsToday: perDay.requests,
    tokensLastMinute: perMinute.tokens,
  }
}

export function listAnalysisRunsForVideo(videoId: string, db: Db = getDb()): AnalysisRunRow[] {
  return db
    .prepare('SELECT * FROM analysis_runs WHERE video_id = ? ORDER BY created_at')
    .all(videoId) as AnalysisRunRow[]
}
