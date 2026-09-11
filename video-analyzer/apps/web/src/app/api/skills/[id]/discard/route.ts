import { NextResponse } from 'next/server'
import { getSkill, setSkillStatus } from '@cva/memory-engine'

export const runtime = 'nodejs'

/** Marks a detected candidate as discarded — no Gemini call, purely local. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  const skill = getSkill(id)
  if (!skill) return NextResponse.json({ error: 'La skill no existe.' }, { status: 404 })

  setSkillStatus(id, 'discarded')
  return NextResponse.json({ skill: getSkill(id) })
}
