import {
  getVideo,
  insertAnalysisRun,
  replaceDetectedCandidates,
  updateJobProgress,
  deferJob,
} from '@cva/memory-engine'
import type { Db, JobRow } from '@cva/memory-engine'
import { detectSkillCandidates } from '@cva/ai-router'
import { buildVideoDigest, normalizeSkillName, clampDescription } from '@cva/skill-engine'
import { listSkillModelsWithQuota, skillPoolBlock } from '../quota.js'
import { JobDeferred } from '../deferred.js'
import { requireGeminiKey, skillRequestLogger } from '../skill-requests.js'

type DetectSkillsPayload = { videoId: string }


/**
 * Handles 'detect_skills' (PROJECT.md §12): a text-only Gemini call over the
 * transcript/scenes already in SQLite, looking for reusable processes worth
 * turning into an Agent Skill. Shares the same 20 RPD account ceiling as
 * video analysis (.env.example), so it goes through the same quota guard and
 * defers rather than burning a retry attempt when the budget is spent.
 */
export async function runDetectSkillsJob(job: JobRow, db: Db): Promise<void> {
  const { videoId } = JSON.parse(job.payload_json) as DetectSkillsPayload
  const video = getVideo(videoId, db)
  if (!video) throw new Error(`El video ${videoId} ya no existe.`)
  if (video.status !== 'ready') {
    throw new Error(`El video debe estar analizado ("ready") para detectar skills (esta en "${video.status}").`)
  }

  requireGeminiKey(job, db)
  const models = listSkillModelsWithQuota(db)
  if (!models.length) {
    // The earliest any model of the pool is free: Flash-Lite pacing itself
    // frees up within a minute even when the Flash models are out for the day.
    const { reason, retryAfter } = skillPoolBlock(db)
    updateJobProgress(job.id, { label: reason }, db)
    deferJob(job.id, retryAfter.toISOString(), reason, db)
    throw new JobDeferred(reason)
  }

  updateJobProgress(job.id, { label: 'Buscando procesos reutilizables en el video...' }, db)
  const digest = buildVideoDigest(videoId, db)

  const startedAt = Date.now()
  try {
    const { candidates } = await detectSkillCandidates({
      models,
      videoDigest: digest,
      onRequest: skillRequestLogger(videoId, job.id, 'skill_detection', db),
    })

    const cleaned = candidates.map((c) => ({
      name: normalizeSkillName(c.name),
      description: clampDescription(c.description),
      startSeconds: c.start_seconds,
      endSeconds: c.end_seconds,
      confidence: c.confidence,
      // Kept for "Crear Skill": it is the reason this stretch is a method.
      rationale: c.rationale,
    }))

    // Replaces the candidates of an earlier run instead of adding copies.
    replaceDetectedCandidates(videoId, cleaned, db)

    console.log(`[detect-skills] ${videoId}: ${cleaned.length} skill(s) candidata(s) detectada(s).`)
  } catch (error) {
    const latencyMs = Date.now() - startedAt
    insertAnalysisRun(
      {
        videoId,
        jobId: job.id,
        phase: 'skill_detection',
        model: models[0]!,
        processingMode: null,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        thoughtTokens: 0,
        estimatedCostUsd: 0,
        latencyMs,
        succeeded: false,
        errorMessage: (error as Error).message,
        // Each request was counted as it was sent; this row is the job's outcome.
        requestCount: 0,
      },
      db,
    )
    throw error
  }
}
