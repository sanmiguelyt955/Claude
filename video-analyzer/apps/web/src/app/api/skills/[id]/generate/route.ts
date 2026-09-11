import { NextResponse } from 'next/server'
import { getSkill, claimSkillForGeneration, enqueueJob } from '@cva/memory-engine'

export const runtime = 'nodejs'

/**
 * Enqueues 'generate_skill' — the "[Crear Skill]" button (PROJECT.md §12).
 * Spends another of the account's shared 20 RPD, so this stays a click, not
 * something that follows detection automatically.
 *
 * claimSkillForGeneration does the status flip in one atomic UPDATE...WHERE
 * (see its comment in packages/memory-engine/src/repo/skills.ts) — a
 * SELECT-then-write guard here was not enough: two near-simultaneous POSTs
 * from one click, each on its own DB connection, both read status='detected'
 * before either commit, and both proceeded (confirmed live, bloque 6/7).
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  const skill = getSkill(id)
  if (!skill) return NextResponse.json({ error: 'La skill no existe.' }, { status: 404 })

  const claimed = claimSkillForGeneration(id)
  if (!claimed) {
    const current = getSkill(id)
    return NextResponse.json(
      { error: `La skill debe estar en estado "detected" (esta en "${current?.status ?? 'desconocido'}").` },
      { status: 409 },
    )
  }

  const job = enqueueJob({ type: 'generate_skill', videoId: skill.video_id ?? undefined, payload: { skillId: id } })
  return NextResponse.json({ jobId: job.id }, { status: 202 })
}
