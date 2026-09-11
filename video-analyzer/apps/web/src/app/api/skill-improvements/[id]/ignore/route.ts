import { NextResponse } from 'next/server'
import { getSkillImprovement, setSkillImprovementStatus } from '@cva/memory-engine'

export const runtime = 'nodejs'

/** "[Ignorar]" — no Gemini call, no disk write, purely local status change. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  const improvement = getSkillImprovement(id)
  if (!improvement) return NextResponse.json({ error: 'La mejora no existe.' }, { status: 404 })
  if (improvement.status !== 'proposed') {
    return NextResponse.json({ error: `Esta mejora ya esta "${improvement.status}".` }, { status: 409 })
  }

  const updated = setSkillImprovementStatus(id, 'ignored')
  return NextResponse.json({ improvement: updated })
}
