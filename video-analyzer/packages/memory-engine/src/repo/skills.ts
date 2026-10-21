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
  rationale?: string | null
}

/** Persists candidates found by the 'detect_skills' job, one row each, status='detected'. */
export function insertSkillCandidates(
  videoId: string,
  candidates: SkillCandidateInput[],
  db: Db = getDb(),
): SkillRow[] {
  const insert = db.prepare(
    `INSERT INTO skills (id, video_id, name, description, start_seconds, end_seconds, confidence, rationale)
     VALUES (@id, @videoId, @name, @description, @startSeconds, @endSeconds, @confidence, @rationale)`,
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
        rationale: c.rationale ?? null,
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

/**
 * Atomically claims a 'detected' skill for generation, flipping it to
 * 'generating' in one UPDATE...WHERE — unlike a SELECT-then-UPDATE, this is
 * safe even against a second, truly concurrent request on a *different*
 * connection: the WHERE clause is evaluated by SQLite as part of the single
 * atomic statement, at the moment it actually runs, not against a JS-level
 * snapshot read earlier. Confirmed necessary live (bloque 6/7 testing): two
 * near-simultaneous POSTs to the "Crear Skill" endpoint both read
 * status='detected' via separate connections before either had committed,
 * and both proceeded, spending two real Gemini requests on the same
 * candidate. Returns whether THIS call won the race.
 */
export function claimSkillForGeneration(id: string, db: Db = getDb()): boolean {
  const result = db
    .prepare("UPDATE skills SET status = 'generating' WHERE id = ? AND status = 'detected'")
    .run(id)
  return result.changes === 1
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

/**
 * Every already-generated Skill, across every video — the pool a "Mejorar
 * Skill" flow picks from, since PROJECT.md §13 compares a skill against the
 * NEW knowledge of a (typically different) video than the one it came from.
 */
export function listGeneratedSkills(db: Db = getDb()): SkillRow[] {
  return db
    .prepare("SELECT * FROM skills WHERE status = 'generated' ORDER BY updated_at DESC")
    .all() as SkillRow[]
}

/**
 * Writes a new SKILL.md version onto an already-generated skill (bloque 7's
 * "[Aplicar]" action) — bumps `version` so the history of a skill is visible
 * even though only the latest body is kept in `skill_md`.
 */
export function updateSkillMd(id: string, skillMd: string, db: Db = getDb()): SkillRow {
  db.prepare('UPDATE skills SET skill_md = ?, version = version + 1 WHERE id = ?').run(skillMd, id)
  return getSkill(id, db)!
}

/**
 * A new "Detectar skills" replaces the candidates of the previous one that
 * were neither turned into a skill nor discarded: running it again used to
 * stack a second copy of every candidate.
 */
export function replaceDetectedCandidates(videoId: string, candidates: SkillCandidateInput[], db: Db = getDb()): SkillRow[] {
  return db.transaction(() => {
    db.prepare("DELETE FROM skills WHERE video_id = ? AND status = 'detected'").run(videoId)
    const kept = new Set(
      (db.prepare("SELECT name FROM skills WHERE video_id = ? AND status IN ('generating', 'generated')").all(videoId) as Array<{ name: string }>).map((r) => r.name),
    )
    // One already being created or created is not offered again.
    return insertSkillCandidates(videoId, candidates.filter((c) => !kept.has(c.name)), db)
  })()
}
