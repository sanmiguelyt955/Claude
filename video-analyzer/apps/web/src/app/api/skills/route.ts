import { NextResponse } from 'next/server'
import { listGeneratedSkills } from '@cva/memory-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Every generated skill, across every video — the pool "Mejorar Skill" picks from (PROJECT.md §13). */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ skills: listGeneratedSkills() })
}
