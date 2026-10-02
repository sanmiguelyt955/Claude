import type { Db } from '../db.js'
import { getDb } from '../db.js'

const HEARTBEAT_KEY = 'worker_heartbeat'

/** How often a live worker refreshes its heartbeat. */
export const WORKER_HEARTBEAT_INTERVAL_MS = 10_000

/** A heartbeat older than this means no worker is alive anymore. */
const HEARTBEAT_STALE_MS = 3 * WORKER_HEARTBEAT_INTERVAL_MS

export function writeWorkerHeartbeat(db: Db = getDb()): void {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(HEARTBEAT_KEY, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }))
}

/**
 * True when another worker process refreshed its heartbeat recently. A second
 * worker must not start: it would requeue the first one's running jobs, and
 * two processes pacing Gemini independently can exceed the per-minute limit.
 */
export function isAnotherWorkerAlive(db: Db = getDb()): boolean {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(HEARTBEAT_KEY) as { value: string } | undefined
  if (!row) return false
  let beat: { pid?: number; at?: string }
  try {
    beat = JSON.parse(row.value) as { pid?: number; at?: string }
  } catch {
    return false
  }
  const last = Date.parse(beat.at ?? '')
  if (!Number.isFinite(last) || Date.now() - last >= HEARTBEAT_STALE_MS) return false
  if (!beat.pid || beat.pid === process.pid) return false
  // A fresh heartbeat from a process that no longer exists is a worker that
  // was killed (e.g. a `tsx watch` reload on Windows), not a live one.
  try {
    process.kill(beat.pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Puts jobs left in 'running' by a worker that died mid-job (app closed, PC
 * restarted, `tsx watch` reload) back in the queue. Without this they stayed
 * 'running' forever: claimNextJob only takes 'queued' jobs, and the video was
 * stuck in "analizando" with the analyze button refusing to re-queue it.
 *
 * The interrupted attempt is not charged against max_attempts — the job did
 * not fail, it was cut off. A windowed analysis resumes from its last
 * checkpoint (jobs.result_json), so finished windows are not paid for twice.
 * Only safe to call when no other worker is alive (see isAnotherWorkerAlive).
 */
export function requeueOrphanedJobs(db: Db = getDb()): number {
  const now = new Date().toISOString()
  return db
    .prepare(
      `UPDATE jobs
          SET status = 'queued',
              run_after = ?,
              attempts = MAX(attempts - 1, 0),
              progress_label = 'Reanudado: el worker se cerro mientras procesaba este job.'
        WHERE status = 'running'`,
    )
    .run(now).changes
}
