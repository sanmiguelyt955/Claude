import {
  getSkill,
  setSkillStatus,
  saveGeneratedSkill,
  insertAnalysisRun,
  updateJobProgress,
  deferJob,
} from '@cva/memory-engine'
import type { Db, JobRow } from '@cva/memory-engine'
import { generateSkillContent } from '@cva/ai-router'
import { buildSegmentDigest, writeSkillFolder, normalizeSkillName, clampDescription } from '@cva/skill-engine'
import { listSkillModelsWithQuota, skillPoolBlock } from '../quota.js'
import { JobDeferred } from '../deferred.js'

type GenerateSkillPayload = { skillId: string }

const SKILL_MODEL = process.env.GEMINI_SKILL_MODEL ?? 'gemini-3.8-flash'

/**
 * Handles 'generate_skill' (PROJECT.md §12, "Crear Skill" button): writes
 * the full SKILL.md + references/scripts folder for one already-detected
 * candidate, scoping the Gemini call to just that candidate's time range
 * rather than the whole video (buildSegmentDigest) to keep tokens down.
 */
export async function runGenerateSkillJob(job: JobRow, db: Db): Promise<void> {
  const { skillId } = JSON.parse(job.payload_json) as GenerateSkillPayload
  const skill = getSkill(skillId, db)
  if (!skill) throw new Error(`La skill ${skillId} ya no existe.`)
  // No status re-check here on purpose: the API route already claims the
  // skill atomically (claimSkillForGeneration) before enqueueing, so this
  // job is the sole owner of the 'generating' -> 'generated' transition.
  // A prior version re-checked status==='generating' here and reverted to
  // 'detected' on every failed attempt (not just the final one) — which
  // made the worker's own automatic retry (attempt 2, 3) immediately fail
  // this same check against the status *this job itself* had just reverted,
  // turning one transient 503 into a permanent failure. Confirmed live.
  if (!skill.video_id || skill.start_seconds == null || skill.end_seconds == null) {
    throw new Error('La skill no tiene video o rango de tiempo asociado.')
  }

  const models = listSkillModelsWithQuota(db)
  if (!models.length) {
    // The earliest any model of the pool is free: Flash-Lite pacing itself
    // frees up within a minute even when the Flash models are out for the day.
    const { reason, retryAfter } = skillPoolBlock(db)
    updateJobProgress(job.id, { label: reason }, db)
    deferJob(job.id, retryAfter.toISOString(), reason, db)
    throw new JobDeferred(reason)
  }

  updateJobProgress(job.id, { label: `Escribiendo SKILL.md para "${skill.name}"...` }, db)

  const digest = buildSegmentDigest(skill.video_id, skill.start_seconds, skill.end_seconds, db)

  const startedAt = Date.now()
  try {
    const { skill: content, usage, modelUsed } = await generateSkillContent({
      models,
      name: skill.name,
      description: skill.description,
      rationale: `Detectado entre los segundos ${skill.start_seconds} y ${skill.end_seconds}.`,
      segmentDigest: digest,
    })
    const latencyMs = Date.now() - startedAt

    insertAnalysisRun(
      {
        videoId: skill.video_id,
        jobId: job.id,
        phase: 'skill_generation',
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

    const name = normalizeSkillName(content.name || skill.name)
    const description = clampDescription(content.description || skill.description)

    const { outputPath, skillMd, assets } = await writeSkillFolder({
      name,
      description,
      bodyMarkdown: content.body_markdown,
      references: content.references ?? [],
      scripts: content.scripts ?? [],
    })

    saveGeneratedSkill(skillId, { skillMd, outputPath, assets }, db)
    console.log(`[generate-skill] ${skillId}: escrita en ${outputPath}`)
  } catch (error) {
    const latencyMs = Date.now() - startedAt
    insertAnalysisRun(
      {
        videoId: skill.video_id,
        jobId: job.id,
        phase: 'skill_generation',
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
    // Only hand the skill back to the UI as a re-clickable candidate once
    // the worker has actually given up on it — reverting on an intermediate
    // attempt would both cancel the pending retries' premise and briefly
    // re-expose the "Crear Skill" button while a retry is still queued.
    // claimNextJob already incremented attempts, so this matches
    // retryOrFailJob's own exhaustion check.
    if (job.attempts >= job.max_attempts) {
      setSkillStatus(skillId, 'detected', db)
    }
    throw error
  }
}
