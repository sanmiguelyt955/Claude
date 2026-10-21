import { insertAnalysisRun } from '@cva/memory-engine'
import type { AnalysisRunRow, Db, JobRow } from '@cva/memory-engine'
import type { RequestEvent } from '@cva/ai-router'

type SkillPhase = 'skill_detection' | 'skill_generation' | 'skill_improvement'

/**
 * The skill calls are Gemini only. Without GEMINI_API_KEY (perception runs
 * with an Anthropic key alone) each click failed three times and counted
 * three requests that were never sent; now it fails once, saying why.
 */
export function requireGeminiKey(job: JobRow, db: Db): void {
  if (process.env.GEMINI_API_KEY) return
  job.max_attempts = job.attempts
  db.prepare('UPDATE jobs SET max_attempts = attempts WHERE id = ?').run(job.id)
  throw new Error('Las skills se hacen con Gemini y falta GEMINI_API_KEY: agrégala en la configuración (Archivo → Configuración o .env.local) y vuelve a intentarlo.')
}

/** One analysis_runs row per request the skill call sent, under its own model and tokens. */
export function skillRequestLogger(videoId: string, jobId: string, phase: SkillPhase, db: Db): (event: RequestEvent) => AnalysisRunRow {
  return (event) =>
    insertAnalysisRun(
      {
        videoId,
        jobId,
        phase,
        model: event.model,
        processingMode: null,
        inputTokens: event.usage?.inputTokens ?? 0,
        outputTokens: event.usage?.outputTokens ?? 0,
        cachedTokens: event.usage?.cachedTokens ?? 0,
        thoughtTokens: event.usage?.thoughtTokens ?? 0,
        estimatedCostUsd: event.usage?.estimatedCostUsd ?? 0,
        latencyMs: event.latencyMs,
        succeeded: event.succeeded,
        errorMessage: event.error ?? null,
        requestCount: 1,
      },
      db,
    )
}
