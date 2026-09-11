import { NextResponse } from 'next/server'
import { getSkill } from '@cva/memory-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  const skill = getSkill(id)
  if (!skill) return NextResponse.json({ error: 'La skill no existe.' }, { status: 404 })
  return NextResponse.json({ skill })
}
