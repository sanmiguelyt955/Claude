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
import { checkQuota } from '../quota.js'
import { JobDeferred } from '../deferred.js'

type GenerateSkillPayload = { skillId: string }

const SKILL_MODEL = process.env.GEMINI_SKILL_MODEL ?? 'gemini-3.7-flash'

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
  // The API route flips status to 'generating' at enqueue time (inside the
  // same transaction as the insert) so a double-click can't enqueue this
  // twice — by the time the job actually runs, 'generating' is the expected
  // state, not 'detected'.
  if (skill.status !== 'generating') {
    throw new Error(`La skill debe estar en estado "generating" (esta en "${skill.status}").`)
  }
  if (!skill.video_id || skill.start_seconds == null || skill.end_seconds == null) {
    throw new Error('La skill no tiene video o rango de tiempo asociado.')
  }

  const quota = checkQuota(db)
  if (!quota.ok) {
    updateJobProgress(job.id, { label: quota.reason }, db)
    deferJob(job.id, quota.retryAfter.toISOString(), quota.reason, db)
    throw new JobDeferred(quota.reason)
  }

  updateJobProgress(job.id, { label: `Escribiendo SKILL.md para "${skill.name}"...` }, db)

  const digest = buildSegmentDigest(skill.video_id, skill.start_seconds, skill.end_seconds, db)

  const startedAt = Date.now()
  try {
    const { skill: content, usage } = await generateSkillContent({
      model: SKILL_MODEL,
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
    setSkillStatus(skillId, 'detected', db)
    throw error
  }
}
