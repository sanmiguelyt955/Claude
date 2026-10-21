import { NextResponse } from 'next/server'
import { getSkill } from '@cva/memory-engine'
import { discardSkill } from '../../../../../lib/skill-claims'

export const runtime = 'nodejs'

/**
 * Marks a candidate as discarded — no Gemini call, purely local. A "Crear
 * Skill" not started yet is cancelled with it (it used to run anyway and
 * silently undo the discard); one the worker is already writing is refused.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  const outcome = discardSkill(id)
  if (outcome === 'missing') return NextResponse.json({ error: 'La skill no existe.' }, { status: 404 })
  if (outcome === 'running') {
    return NextResponse.json({ error: 'Esta skill se está generando ahora; espera a que termine.' }, { status: 409 })
  }
  if (outcome === 'generated') {
    return NextResponse.json({ error: 'Esta skill ya se creó; no se puede descartar.' }, { status: 409 })
  }
  return NextResponse.json({ skill: getSkill(id) })
}
