import path from 'node:path'
import { NextResponse } from 'next/server'
import { getDb, getSkillImprovement, getSkill, updateSkillMd, resolveDataPath } from '@cva/memory-engine'
import { appendImprovementToSkillMd, readExternalSkillMd } from '@cva/skill-engine'
import { claimImprovementForApply, releaseImprovementClaim } from '../../../../../lib/skill-claims'
import { realFile, resolveSkillMdPath, withFileLock, writeFileAtomic } from '../../../../../lib/skill-md'

export const runtime = 'nodejs'

/**
 * "[Aplicar]" (PROJECT.md §13): appends the improvement's proposed_diff to
 * the SKILL.md and writes it back — no Gemini call, fully deterministic
 * (see appendImprovementToSkillMd's comment in packages/skill-engine).
 *
 * Several clicks at once: the improvement is claimed in one UPDATE, so only
 * one request applies it (the others get 409), and every write to one file
 * goes through a per-file queue and a temp file + rename, so two different
 * improvements on the same SKILL.md both land and nothing is ever truncated.
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
    return NextResponse.json({ error: `Esta mejora ya está "${improvement.status}".` }, { status: 409 })
  }
  if (!improvement.proposed_diff) {
    return NextResponse.json({ error: 'Esta mejora no tiene contenido para aplicar.' }, { status: 500 })
  }

  const forAppend = {
    kind: improvement.kind,
    title: improvement.title,
    proposedDiff: improvement.proposed_diff,
  }

  // An external target is checked before anything is claimed: the path was
  // typed by the user and may now point at another file or at nothing.
  let external: string | undefined
  if (!improvement.skill_id) {
    if (!improvement.source_skill_path) {
      return NextResponse.json({ error: 'La mejora no tiene skill ni ruta asociada.' }, { status: 500 })
    }
    const checked = await resolveSkillMdPath(improvement.source_skill_path)
    if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 })
    external = checked.path
  }

  if (!claimImprovementForApply(id, db)) {
    return NextResponse.json({ error: 'Esta mejora ya se está aplicando o ya se aplicó.' }, { status: 409 })
  }
  try {
    if (improvement.skill_id) {
      const skillId = improvement.skill_id
      await withFileLock(`skill:${skillId}`, async () => {
        // Read inside the queue: an improvement applied just before changed it.
        const skill = getSkill(skillId, db)
        if (!skill || !skill.skill_md || !skill.output_path) throw new Error('la skill asociada ya no existe')
        const newSkillMd = appendImprovementToSkillMd(skill.skill_md, forAppend)
        const file = path.join(resolveDataPath(skill.output_path), 'SKILL.md')
        await writeFileAtomic(file, newSkillMd)
        updateSkillMd(skillId, newSkillMd, db)
      })
    } else {
      const target = await realFile(external!)
      await withFileLock(`file:${target}`, async () => {
        const currentSkillMd = await readExternalSkillMd(target)
        await writeFileAtomic(target, appendImprovementToSkillMd(currentSkillMd, forAppend))
      })
    }
  } catch (error) {
    releaseImprovementClaim(id, db)
    return NextResponse.json({ error: `No se pudo escribir el SKILL.md: ${(error as Error).message}` }, { status: 500 })
  }

  return NextResponse.json({ improvement: getSkillImprovement(id, db) })
}
