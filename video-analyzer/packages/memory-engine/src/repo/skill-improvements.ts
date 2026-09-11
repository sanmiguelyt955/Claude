import { randomUUID } from 'node:crypto'
import type { Db } from '../db.js'
import { getDb } from '../db.js'
import type { SkillImprovementRow } from '../types.js'

export type SkillImprovementInput = {
  kind: SkillImprovementRow['kind']
  title: string
  rationale: string
  startSeconds: number | null
  endSeconds: number | null
  proposedDiff: string
}

/** Persists the proposals from one 'improve_skill' run, all status='proposed'. */
export function insertSkillImprovements(
  input: {
    videoId: string
    skillId: string | null
    sourceSkillPath: string | null
  },
  improvements: SkillImprovementInput[],
  db: Db = getDb(),
): SkillImprovementRow[] {
  const insert = db.prepare(
    `INSERT INTO skill_improvements
       (id, skill_id, source_skill_path, video_id, kind, title, rationale, start_seconds, end_seconds, proposed_diff)
     VALUES (@id, @skillId, @sourceSkillPath, @videoId, @kind, @title, @rationale, @startSeconds, @endSeconds, @proposedDiff)`,
  )
  const ids = db.transaction(() => {
    return improvements.map((imp) => {
      const id = randomUUID()
      insert.run({
        id,
        skillId: input.skillId,
        sourceSkillPath: input.sourceSkillPath,
        videoId: input.videoId,
        kind: imp.kind,
        title: imp.title,
        rationale: imp.rationale,
        startSeconds: imp.startSeconds,
        endSeconds: imp.endSeconds,
        proposedDiff: imp.proposedDiff,
      })
      return id
    })
  })()
  return ids.map((id) => getSkillImprovement(id, db)!)
}

export function getSkillImprovement(id: string, db: Db = getDb()): SkillImprovementRow | undefined {
  return db.prepare('SELECT * FROM skill_improvements WHERE id = ?').get(id) as
    | SkillImprovementRow
    | undefined
}

export function listSkillImprovementsForVideo(videoId: string, db: Db = getDb()): SkillImprovementRow[] {
  return db
    .prepare('SELECT * FROM skill_improvements WHERE video_id = ? ORDER BY created_at')
    .all(videoId) as SkillImprovementRow[]
}

export function setSkillImprovementStatus(
  id: string,
  status: SkillImprovementRow['status'],
  db: Db = getDb(),
): SkillImprovementRow {
  db.prepare(
    `UPDATE skill_improvements
        SET status = ?, applied_at = CASE WHEN ? = 'applied' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE applied_at END
      WHERE id = ?`,
  ).run(status, status, id)
  return getSkillImprovement(id, db)!
}
