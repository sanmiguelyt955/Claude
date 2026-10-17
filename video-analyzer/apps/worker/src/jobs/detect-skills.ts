import {
  getVideo,
  insertAnalysisRun,
  insertSkillCandidates,
  updateJobProgress,
  deferJob,
} from '@cva/memory-engine'
import type { Db, JobRow } from '@cva/memory-engine'
import { detectSkillCandidates } from '@cva/ai-router'
import { buildVideoDigest, normalizeSkillName, clampDescription, SKILL_NAME_PATTERN } from '@cva/skill-engine'
import { listSkillModelsWithQuota, checkQuota } from '../quota.js'
import { JobDeferred } from '../deferred.js'

type DetectSkillsPayload = { videoId: string }

const SKILL_MODEL = process.env.GEMINI_SKILL_MODEL ?? 'gemini-3.8-flash'

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

  const models = listSkillModelsWithQuota(db)
  if (!models.length) {
    const quota = checkQuota(db, SKILL_MODEL)
    const reason = quota.ok ? 'Sin cupo disponible en ningun modelo.' : quota.reason
    const retryAfter = quota.ok ? new Date(Date.now() + 60_000) : quota.retryAfter
    updateJobProgress(job.id, { label: reason }, db)
    deferJob(job.id, retryAfter.toISOString(), reason, db)
    throw new JobDeferred(reason)
  }

  updateJobProgress(job.id, { label: 'Buscando procesos reutilizables en el video...' }, db)
  const digest = buildVideoDigest(videoId, db)

  const startedAt = Date.now()
  try {
    const { candidates, usage, rawResponseText, modelUsed } = await detectSkillCandidates({
      models,
      videoDigest: digest,
    })
    const latencyMs = Date.now() - startedAt

    insertAnalysisRun(
      {
        videoId,
        jobId: job.id,
        phase: 'skill_detection',
        model: modelUsed,
        processingMode: null,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedTokens: usage.cachedTokens,
        thoughtTokens: usage.thoughtTokens,
        estimatedCostUsd: usage.estimatedCostUsd,
        latencyMs,
        succeeded: true,
      },
      db,
    )

    const cleaned = candidates.map((c) => ({
      name: SKILL_NAME_PATTERN.test(c.name) && c.name.length <= 64 ? c.name : normalizeSkillName(c.name),
      description: clampDescription(c.description),
      startSeconds: c.start_seconds,
      endSeconds: c.end_seconds,
      confidence: c.confidence,
    }))

    if (cleaned.length) insertSkillCandidates(videoId, cleaned, db)

    console.log(`[detect-skills] ${videoId}: ${cleaned.length} skill(s) candidata(s) detectada(s).`)
    void rawResponseText
  } catch (error) {
    const latencyMs = Date.now() - startedAt
    insertAnalysisRun(
      {
        videoId,
        jobId: job.id,
        phase: 'skill_detection',
        model: SKILL_MODEL,
        processingMode: null,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        thoughtTokens: 0,
        estimatedCostUsd: 0,
        latencyMs,
        succeeded: false,
        errorMessage: (error as Error).message,
      },
      db,
    )
    throw error
  }
}
