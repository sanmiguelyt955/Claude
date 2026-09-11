import { NextResponse } from 'next/server'
import { getDb, getSkill, setSkillStatus, enqueueJob } from '@cva/memory-engine'

export const runtime = 'nodejs'

/**
 * Enqueues 'generate_skill' — the "[Crear Skill]" button (PROJECT.md §12).
 * Spends another of the account's shared 20 RPD, so this stays a click, not
 * something that follows detection automatically.
 *
 * The status flip to 'generating' happens inside the same db.transaction as
 * the enqueue, both gated on status still being 'detected' — this closes a
 * double-click race observed live in bloque 6 (two POSTs from one click both
 * passing a check-then-write guard and burning two real Gemini requests on
 * the same candidate).
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  const db = getDb()

  const outcome = db.transaction(() => {
    const skill = getSkill(id, db)
    if (!skill) return { notFound: true as const }
    if (skill.status !== 'detected') return { conflict: skill.status }
    const job = enqueueJob({ type: 'generate_skill', videoId: skill.video_id ?? undefined, payload: { skillId: id } }, db)
    setSkillStatus(id, 'generating', db)
    return { job }
  })()

  if ('notFound' in outcome) return NextResponse.json({ error: 'La skill no existe.' }, { status: 404 })
  if ('conflict' in outcome) {
    return NextResponse.json(
      { error: `La skill debe estar en estado "detected" (esta en "${outcome.conflict}").` },
      { status: 409 },
    )
  }

  return NextResponse.json({ jobId: outcome.job.id }, { status: 202 })
}
