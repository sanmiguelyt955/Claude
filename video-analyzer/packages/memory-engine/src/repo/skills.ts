import { randomUUID } from 'node:crypto'
import type { Db } from '../db.js'
import { getDb } from '../db.js'
import type { SkillRow } from '../types.js'

export type SkillCandidateInput = {
  name: string
  description: string
  startSeconds: number | null
  endSeconds: number | null
  confidence: number | null
}

/** Persists candidates found by the 'detect_skills' job, one row each, status='detected'. */
export function insertSkillCandidates(
  videoId: string,
  candidates: SkillCandidateInput[],
  db: Db = getDb(),
): SkillRow[] {
  const insert = db.prepare(
    `INSERT INTO skills (id, video_id, name, description, start_seconds, end_seconds, confidence)
     VALUES (@id, @videoId, @name, @description, @startSeconds, @endSeconds, @confidence)`,
  )
  const ids = db.transaction(() => {
    return candidates.map((c) => {
      const id = randomUUID()
      insert.run({
        id,
        videoId,
        name: c.name,
        description: c.description,
        startSeconds: c.startSeconds,
        endSeconds: c.endSeconds,
        confidence: c.confidence,
      })
      return id
    })
  })()
  return ids.map((id) => getSkill(id, db)!)
}

export function getSkill(id: string, db: Db = getDb()): SkillRow | undefined {
  return db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as SkillRow | undefined
}

export function listSkillsForVideo(videoId: string, db: Db = getDb()): SkillRow[] {
  return db
    .prepare('SELECT * FROM skills WHERE video_id = ? ORDER BY start_seconds')
    .all(videoId) as SkillRow[]
}

export function setSkillStatus(
  id: string,
  status: SkillRow['status'],
  db: Db = getDb(),
): void {
  db.prepare('UPDATE skills SET status = ? WHERE id = ?').run(status, id)
}

export type SaveGeneratedSkillInput = {
  skillMd: string
  outputPath: string
  assets: { path: string; contents: string }[]
}

export function saveGeneratedSkill(id: string, input: SaveGeneratedSkillInput, db: Db = getDb()): SkillRow {
  db.prepare(
    `UPDATE skills
        SET status = 'generated', skill_md = ?, output_path = ?, assets_json = ?
      WHERE id = ?`,
  ).run(input.skillMd, input.outputPath, JSON.stringify(input.assets), id)
  return getSkill(id, db)!
}
