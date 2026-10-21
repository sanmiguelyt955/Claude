import { getDb, getSkill, setSkillStatus, type Db } from '@cva/memory-engine'

/**
 * Flips a 'proposed' improvement to 'applied' in one UPDATE...WHERE (same
 * idea as claimSkillForGeneration): of several simultaneous [Aplicar] on the
 * same improvement, only one wins and writes the SKILL.md.
 */
export function claimImprovementForApply(id: string, db: Db = getDb()): boolean {
  return (
    db
      .prepare(
        `UPDATE skill_improvements
            SET status = 'applied', applied_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE id = ? AND status = 'proposed'`,
      )
      .run(id).changes === 1
  )
}

/** Gives the claim back when the SKILL.md could not be written, so [Aplicar] can be tried again. */
export function releaseImprovementClaim(id: string, db: Db = getDb()): void {
  db.prepare("UPDATE skill_improvements SET status = 'proposed', applied_at = NULL WHERE id = ? AND status = 'applied'").run(id)
}

export type DiscardOutcome = 'discarded' | 'missing' | 'running' | 'generated'

/**
 * "Descartar". A 'detected' candidate is simply discarded. One the user
 * already sent to "Crear Skill" is discarded too while the worker has not
 * started it: its queued job is cancelled in the same transaction, so it
 * never spends a request nor turns the skill back into 'generated'. IMMEDIATE,
 * so the worker cannot claim that job between the check and the cancel.
 */
export function discardSkill(id: string, db: Db = getDb()): DiscardOutcome {
  return db
    .transaction((): DiscardOutcome => {
      const skill = getSkill(id, db)
      if (!skill) return 'missing'
      if (skill.status === 'generated') return 'generated'
      if (skill.status === 'generating') {
        const running = db
          .prepare(
            `SELECT 1 FROM jobs
              WHERE type = 'generate_skill' AND status = 'running' AND json_extract(payload_json, '$.skillId') = ?`,
          )
          .get(id)
        if (running) return 'running'
        db.prepare(
          `UPDATE jobs SET status = 'cancelled', finished_at = ?
            WHERE type = 'generate_skill' AND status = 'queued' AND json_extract(payload_json, '$.skillId') = ?`,
        ).run(new Date().toISOString(), id)
      }
      setSkillStatus(id, 'discarded', db)
      return 'discarded'
    })
    .immediate()
}
