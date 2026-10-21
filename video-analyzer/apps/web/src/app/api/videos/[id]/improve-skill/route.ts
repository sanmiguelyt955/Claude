import { NextResponse } from 'next/server'
import { getVideo, getSkill, enqueueJobUnlessActive, isAnotherWorkerAlive } from '@cva/memory-engine'
import { readJsonObject, stringField } from '../../../../../lib/json-body'
import { resolveSkillMdPath } from '../../../../../lib/skill-md'

export const runtime = 'nodejs'

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

  const body = await readJsonObject(request)
  const skillId = stringField(body, 'skillId')
  let sourceSkillPath = stringField(body, 'sourceSkillPath')

  if (!skillId && !sourceSkillPath) {
    return NextResponse.json({ error: 'Se requiere skillId o sourceSkillPath.' }, { status: 400 })
  }
  if (skillId && sourceSkillPath) {
    return NextResponse.json({ error: 'Elige solo una: skillId o sourceSkillPath, no ambas.' }, { status: 400 })
  }
  if (sourceSkillPath) {
    // Checked here, not three failed attempts later in the worker.
    const checked = await resolveSkillMdPath(sourceSkillPath)
    if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 })
    sourceSkillPath = checked.path
  }
  if (skillId) {
    const skill = getSkill(skillId)
    if (!skill || skill.status !== 'generated') {
      return NextResponse.json({ error: 'Esa skill no existe o todavía no fue generada.' }, { status: 404 })
    }
  }

  const outcome = enqueueJobUnlessActive(
    { type: 'improve_skill', videoId: id, payload: { skillId, sourceSkillPath } },
    ['improve_skill', 'analyze', 'detect_skills'],
  )
  if ('blocked' in outcome) {
    return NextResponse.json({ error: 'Ya hay un job en curso para este video.' }, { status: 409 })
  }

  return NextResponse.json({ jobId: outcome.job.id, workerAlive: isAnotherWorkerAlive() }, { status: 202 })
}
