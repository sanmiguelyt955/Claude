import { NextResponse } from 'next/server'
import {
  getDb,
  getSkillImprovement,
  setSkillImprovementStatus,
  getSkill,
  updateSkillMd,
} from '@cva/memory-engine'
import { appendImprovementToSkillMd, writeSkillMdAtOutputPath, writeExternalSkillMd, readExternalSkillMd } from '@cva/skill-engine'

export const runtime = 'nodejs'

/**
 * "[Aplicar]" (PROJECT.md §13): appends the improvement's proposed_diff to
 * the SKILL.md and writes it back — no Gemini call, fully deterministic
 * (see appendImprovementToSkillMd's comment in packages/skill-engine).
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  const db = getDb()
  const improvement = getSkillImprovement(id, db)
  if (!improvement) return NextResponse.json({ error: 'La mejora no existe.' }, { status: 404 })
  if (improvement.status !== 'proposed') {
    return NextResponse.json({ error: `Esta mejora ya esta "${improvement.status}".` }, { status: 409 })
  }
  if (!improvement.proposed_diff) {
    return NextResponse.json({ error: 'Esta mejora no tiene contenido para aplicar.' }, { status: 500 })
  }

  const forAppend = {
    kind: improvement.kind,
    title: improvement.title,
    proposedDiff: improvement.proposed_diff,
  }

  try {
    if (improvement.skill_id) {
      const skill = getSkill(improvement.skill_id, db)
      if (!skill || !skill.skill_md || !skill.output_path) {
        return NextResponse.json({ error: 'La skill asociada ya no existe.' }, { status: 404 })
      }
      const newSkillMd = appendImprovementToSkillMd(skill.skill_md, forAppend)
      await writeSkillMdAtOutputPath(skill.output_path, newSkillMd)
      updateSkillMd(improvement.skill_id, newSkillMd, db)
    } else if (improvement.source_skill_path) {
      const currentSkillMd = await readExternalSkillMd(improvement.source_skill_path)
      const newSkillMd = appendImprovementToSkillMd(currentSkillMd, forAppend)
      await writeExternalSkillMd(improvement.source_skill_path, newSkillMd)
    } else {
      return NextResponse.json({ error: 'La mejora no tiene skill ni ruta asociada.' }, { status: 500 })
    }
  } catch (error) {
    return NextResponse.json({ error: `No se pudo escribir el SKILL.md: ${(error as Error).message}` }, { status: 500 })
  }

  const updated = setSkillImprovementStatus(id, 'applied', db)
  return NextResponse.json({ improvement: updated })
}
