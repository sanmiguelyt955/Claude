import { getDb, inspectSchema, closeDb, SQLITE_PATH } from '@cva/memory-engine'
import type { Db, JobRow } from '@cva/memory-engine'

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 1500)

/**
 * Claims one job atomically. `UPDATE ... RETURNING` on the row picked by the
 * inner SELECT means two worker processes can never grab the same job, which
 * a SELECT-then-UPDATE pair would allow.
 */
function claimNextJob(db: Db): JobRow | undefined {
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

async function runJob(job: JobRow): Promise<void> {
  // Handlers land in bloques 2-7. Until then an unknown type fails loudly
  // rather than silently marking work as done.
  throw new Error(`Sin handler para el job de tipo "${job.type}" (llega en un bloque posterior).`)
}

function finishJob(db: Db, job: JobRow, error: Error | null): void {
  const now = new Date().toISOString()
  if (!error) {
    db.prepare(`UPDATE jobs SET status='done', finished_at=?, last_error=NULL WHERE id=?`).run(
      now,
      job.id,
    )
    return
  }

  const exhausted = job.attempts >= job.max_attempts
  if (exhausted) {
    db.prepare(`UPDATE jobs SET status='failed', finished_at=?, last_error=? WHERE id=?`).run(
      now,
      error.message,
      job.id,
    )
    if (job.video_id) {
      db.prepare(`UPDATE videos SET status='failed', error_message=? WHERE id=?`).run(
        error.message,
        job.video_id,
      )
    }
    return
  }

  // Exponential backoff with jitter, never an immediate retry (CLAUDE.md rule 4).
  const base = Math.min(2 ** job.attempts * 1000, 60_000)
  const delayMs = base + Math.random() * base * 0.5
  const runAfter = new Date(Date.now() + delayMs).toISOString()
  db.prepare(`UPDATE jobs SET status='queued', run_after=?, last_error=? WHERE id=?`).run(
    runAfter,
    error.message,
    job.id,
  )
}

async function main(): Promise<void> {
  const db = getDb()
  const status = inspectSchema(db)
  if (!status.ok) {
    console.error(`[worker] La base de datos no esta lista (${SQLITE_PATH}):`)
    for (const problem of status.problems) console.error(`  - ${problem}`)
    process.exit(1)
  }

  console.log(`[worker] Escuchando jobs. sqlite-vec ${status.vecVersion}, esquema v${status.schemaVersion}.`)

  let stopping = false
  const stop = () => {
    stopping = true
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)

  while (!stopping) {
    const job = claimNextJob(db)
    if (!job) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      continue
    }

    console.log(`[worker] ${job.type} ${job.id} (intento ${job.attempts}/${job.max_attempts})`)
    try {
      await runJob(job)
      finishJob(db, job, null)
    } catch (error) {
      console.error(`[worker] fallo: ${(error as Error).message}`)
      finishJob(db, job, error as Error)
    }
  }

  console.log('[worker] Detenido.')
  closeDb()
}

void main()
