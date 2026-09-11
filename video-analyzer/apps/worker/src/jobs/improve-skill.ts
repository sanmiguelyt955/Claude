import {
  getVideo,
  getSkill,
  insertAnalysisRun,
  insertSkillImprovements,
  updateJobProgress,
  deferJob,
} from '@cva/memory-engine'
import type { Db, JobRow } from '@cva/memory-engine'
import { proposeSkillImprovements } from '@cva/ai-router'
import { buildVideoDigest, readExternalSkillMd } from '@cva/skill-engine'
import { checkQuota } from '../quota.js'
import { JobDeferred } from '../deferred.js'

type ImproveSkillPayload = { videoId: string; skillId?: string; sourceSkillPath?: string }

const SKILL_MODEL = process.env.GEMINI_SKILL_MODEL ?? 'gemini-3.7-flash'

/**
 * Handles 'improve_skill' (PROJECT.md §13): compares an already-generated
 * SKILL.md — either one this app wrote (skillId) or one living elsewhere on
 * disk (sourceSkillPath) — against a *different* video's content, and
 * proposes concrete additions. Text-only, same shared 20 RPD budget as
 * detection/generation (bloque 6).
 */
export async function runImproveSkillJob(job: JobRow, db: Db): Promise<void> {
  const { videoId, skillId, sourceSkillPath } = JSON.parse(job.payload_json) as ImproveSkillPayload
  const video = getVideo(videoId, db)
  if (!video) throw new Error(`El video ${videoId} ya no existe.`)
  if (video.status !== 'ready') {
    throw new Error(`El video debe estar analizado ("ready") para comparar skills (esta en "${video.status}").`)
  }

  let existingSkillMd: string
  if (skillId) {
    const skill = getSkill(skillId, db)
    if (!skill || !skill.skill_md) throw new Error(`La skill ${skillId} no existe o no tiene SKILL.md generado.`)
    existingSkillMd = skill.skill_md
  } else if (sourceSkillPath) {
    existingSkillMd = await readExternalSkillMd(sourceSkillPath)
  } else {
    throw new Error('Se requiere skillId o sourceSkillPath.')
  }

  const quota = checkQuota(db)
  if (!quota.ok) {
    updateJobProgress(job.id, { label: quota.reason }, db)
    deferJob(job.id, quota.retryAfter.toISOString(), quota.reason, db)
    throw new JobDeferred(quota.reason)
  }

  updateJobProgress(job.id, { label: 'Comparando la skill contra el video...' }, db)
  const digest = buildVideoDigest(videoId, db)

  const startedAt = Date.now()
  try {
    const { improvements, usage } = await proposeSkillImprovements({
      model: SKILL_MODEL,
      existingSkillMd,
      videoDigest: digest,
    })
    const latencyMs = Date.now() - startedAt

    insertAnalysisRun(
      {
        videoId,
        jobId: job.id,
        phase: 'skill_improvement',
        model: SKILL_MODEL,
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

    if (improvements.length) {
      insertSkillImprovements(
        { videoId, skillId: skillId ?? null, sourceSkillPath: sourceSkillPath ?? null },
        improvements.map((imp) => ({
          kind: imp.kind,
          title: imp.title,
          rationale: imp.rationale,
          startSeconds: imp.start_seconds,
          endSeconds: imp.end_seconds,
          proposedDiff: imp.proposed_diff,
        })),
        db,
      )
    }

    console.log(`[improve-skill] ${videoId}: ${improvements.length} mejora(s) propuesta(s).`)
  } catch (error) {
    const latencyMs = Date.now() - startedAt
    insertAnalysisRun(
      {
        videoId,
        jobId: job.id,
        phase: 'skill_improvement',
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
