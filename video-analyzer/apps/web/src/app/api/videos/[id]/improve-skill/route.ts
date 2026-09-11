import { NextResponse } from 'next/server'
import { getVideo, getSkill, enqueueJobUnlessActive } from '@cva/memory-engine'

export const runtime = 'nodejs'

type Body = { skillId?: string; sourceSkillPath?: string }

/**
 * Enqueues 'improve_skill' (PROJECT.md §13, "Mejorar Skill"). Accepts either
 * a skill this app generated (skillId) or a SKILL.md living elsewhere on
 * disk (sourceSkillPath) — exactly one of the two.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  const video = getVideo(id)
  if (!video) return NextResponse.json({ error: 'El video no existe.' }, { status: 404 })
  if (video.status !== 'ready') {
    return NextResponse.json(
      { error: `El video debe estar analizado ("ready") para comparar skills (esta en "${video.status}").` },
      { status: 409 },
    )
  }

  const body = (await request.json().catch(() => ({}))) as Body
  const skillId = body.skillId?.trim() || undefined
  const sourceSkillPath = body.sourceSkillPath?.trim() || undefined

  if (!skillId && !sourceSkillPath) {
    return NextResponse.json({ error: 'Se requiere skillId o sourceSkillPath.' }, { status: 400 })
  }
  if (skillId && sourceSkillPath) {
    return NextResponse.json({ error: 'Elige solo una: skillId o sourceSkillPath, no ambas.' }, { status: 400 })
  }
  if (skillId) {
    const skill = getSkill(skillId)
    if (!skill || skill.status !== 'generated') {
      return NextResponse.json({ error: 'Esa skill no existe o todavia no fue generada.' }, { status: 404 })
    }
  }

  const outcome = enqueueJobUnlessActive(
    { type: 'improve_skill', videoId: id, payload: { skillId, sourceSkillPath } },
    ['improve_skill', 'analyze', 'detect_skills'],
  )
  if ('blocked' in outcome) {
    return NextResponse.json({ error: 'Ya hay un job en curso para este video.' }, { status: 409 })
  }

  return NextResponse.json({ jobId: outcome.job.id }, { status: 202 })
}
