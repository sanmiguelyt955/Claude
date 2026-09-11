import { randomUUID } from 'node:crypto'
import type { Db } from '../db.js'
import { getDb } from '../db.js'
import type { JobRow, JobType } from '../types.js'

export type EnqueueJobInput = {
  type: JobType
  videoId?: string
  payload?: Record<string, unknown>
  priority?: number
  maxAttempts?: number
}

export function enqueueJob(input: EnqueueJobInput, db: Db = getDb()): JobRow {
  const id = randomUUID()
  // `videoId` also drives the FK column (jobs.video_id), but a handler only
  // ever sees payload_json — mirror it in there automatically so passing
  // videoId once is enough. (A real bug the first time this was wired up:
  // the FK was set but the handler read `undefined` from an empty payload.)
  const payload =
    input.videoId && !('videoId' in (input.payload ?? {}))
      ? { ...input.payload, videoId: input.videoId }
      : (input.payload ?? {})

  db.prepare(
    `INSERT INTO jobs (id, video_id, type, payload_json, priority, max_attempts)
     VALUES (@id, @videoId, @type, @payloadJson, @priority, @maxAttempts)`,
  ).run({
    id,
    videoId: input.videoId ?? null,
    type: input.type,
    payloadJson: JSON.stringify(payload),
    priority: input.priority ?? 0,
    maxAttempts: input.maxAttempts ?? 3,
  })
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow
}

/**
 * Same as enqueueJob, but refuses if the video already has a queued/running
 * job of one of `blockingTypes` — checked and inserted inside one
 * db.transaction so two near-simultaneous requests (a double-click before
 * React re-renders and disables the button, observed live in bloque 6) can't
 * both pass the check before either commits. better-sqlite3 is fully
 * synchronous, so nothing else can run on this connection between the SELECT
 * and the INSERT once the transaction starts.
 */
export function enqueueJobUnlessActive(
  input: EnqueueJobInput,
  blockingTypes: JobType[],
  db: Db = getDb(),
): { job: JobRow } | { blocked: JobRow } {
  return db.transaction(() => {
    if (input.videoId) {
      const placeholders = blockingTypes.map(() => '?').join(',')
      const active = db
        .prepare(
          `SELECT * FROM jobs
             WHERE video_id = ? AND status IN ('queued', 'running') AND type IN (${placeholders})
             ORDER BY created_at DESC LIMIT 1`,
        )
        .get(input.videoId, ...blockingTypes) as JobRow | undefined
      if (active) return { blocked: active }
    }
    return { job: enqueueJob(input, db) }
  })()
}

/**
 * Claims one job atomically. `UPDATE ... RETURNING` on the row picked by the
 * inner SELECT means two worker processes can never grab the same job, which
 * a SELECT-then-UPDATE pair would allow.
 */
export function claimNextJob(db: Db = getDb()): JobRow | undefined {
  const now = new Date().toISOString()
  return db
    .prepare(
      `UPDATE jobs
          SET status = 'running',
              attempts = attempts + 1,
              started_at = COALESCE(started_at, ?)
        WHERE id = (
          SELECT id FROM jobs
           WHERE status = 'queued' AND run_after <= ?
           ORDER BY priority DESC, created_at
           LIMIT 1
        )
        RETURNING *`,
    )
    .get(now, now) as JobRow | undefined
}

export function updateJobProgress(
  jobId: string,
  progress: { current?: number; total?: number | null; label?: string },
  db: Db = getDb(),
): void {
  const sets: string[] = []
  const params: Record<string, unknown> = { id: jobId }
  if (progress.current !== undefined) {
    sets.push('progress_current = @current')
    params.current = progress.current
  }
  if (progress.total !== undefined) {
    sets.push('progress_total = @total')
    params.total = progress.total
  }
  if (progress.label !== undefined) {
    sets.push('progress_label = @label')
    params.label = progress.label
  }
  if (sets.length === 0) return
  db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = @id`).run(params)
}

export function completeJob(jobId: string, resultJson?: unknown, db: Db = getDb()): void {
  db.prepare(
    `UPDATE jobs SET status='done', finished_at=?, last_error=NULL, result_json=? WHERE id=?`,
  ).run(new Date().toISOString(), resultJson === undefined ? null : JSON.stringify(resultJson), jobId)
}

/**
 * Marks a job failed and, on the final attempt, fails the video it belongs
 * to. Otherwise re-queues with exponential backoff + jitter — never an
 * immediate retry (CLAUDE.md rule 4: never retry a 429 immediately).
 */
export function retryOrFailJob(job: JobRow, error: Error, db: Db = getDb()): void {
  const now = new Date().toISOString()
  const exhausted = job.attempts >= job.max_attempts

  if (exhausted) {
    db.prepare(`UPDATE jobs SET status='failed', finished_at=?, last_error=? WHERE id=?`).run(
      now,
      error.message,
      job.id,
    )
    // A video that already reached 'ready' has a complete analysis sitting
    // in SQLite — a secondary job failing (e.g. 'embed', run after 'analyze'
    // already succeeded) must not hide that behind status='failed'. Only
    // 'probe'/'analyze' failures, where the video genuinely has nothing to
    // show yet, should flip it.
    if (job.video_id) {
      db.prepare(
        `UPDATE videos SET status='failed', error_message=? WHERE id=? AND status != 'ready'`,
      ).run(error.message, job.video_id)
    }
    return
  }

  const base = Math.min(2 ** job.attempts * 1000, 60_000)
  const delayMs = base + Math.random() * base * 0.5
  const runAfter = new Date(Date.now() + delayMs).toISOString()
  db.prepare(`UPDATE jobs SET status='queued', run_after=?, last_error=? WHERE id=?`).run(
    runAfter,
    error.message,
    job.id,
  )
}

/**
 * Re-queues a job for later without counting it as a failed attempt — used
 * when the local quota guard defers a Gemini call rather than the call
 * itself failing. claimNextJob already incremented `attempts` the moment
 * this job was picked up, so that bump is undone here; otherwise hitting
 * the daily quota 3 times would permanently fail a video that never actually
 * had anything go wrong.
 */
export function deferJob(jobId: string, runAfterIso: string, label: string, db: Db = getDb()): void {
  db.prepare(
    `UPDATE jobs
        SET status = 'queued',
            run_after = ?,
            attempts = MAX(0, attempts - 1),
            progress_label = ?
      WHERE id = ?`,
  ).run(runAfterIso, label, jobId)
}

export function getJob(id: string, db: Db = getDb()): JobRow | undefined {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined
}

export function listJobsForVideo(videoId: string, db: Db = getDb()): JobRow[] {
  return db
    .prepare('SELECT * FROM jobs WHERE video_id = ? ORDER BY created_at')
    .all(videoId) as JobRow[]
}

/**
 * The one job the UI actually needs per video: whatever is still pending —
 * so a quota deferral (progress_label = "Se alcanzo el limite diario...")
 * is visible instead of a video silently sitting in 'queued' with no
 * explanation.
 */
export function getActiveJobForVideo(videoId: string, db: Db = getDb()): JobRow | undefined {
  return db
    .prepare(
      `SELECT * FROM jobs
        WHERE video_id = ? AND status IN ('queued', 'running')
        ORDER BY created_at DESC
        LIMIT 1`,
    )
    .get(videoId) as JobRow | undefined
}
