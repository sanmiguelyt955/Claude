import {
  enqueueJob,
  getDb,
  inspectSchema,
  closeDb,
  SQLITE_PATH,
  claimNextJob,
  completeJob,
  retryOrFailJob,
  WORKER_HEARTBEAT_INTERVAL_MS,
  writeWorkerHeartbeat,
  isAnotherWorkerAlive,
  requeueOrphanedJobs,
} from '@cva/memory-engine'
import type { Db, JobRow, JobType } from '@cva/memory-engine'
import { runProbeJob } from './jobs/probe.js'
import { runAnalyzeJob } from './jobs/analyze.js'
import { runAnalyzeBatchJob } from './jobs/analyze-batch.js'
import { runAnalyzePerceptionJob } from './jobs/analyze-perception.js'
import { runEmbedJob } from './jobs/embed.js'
import { runDetectSkillsJob } from './jobs/detect-skills.js'
import { runGenerateSkillJob } from './jobs/generate-skill.js'
import { runImproveSkillJob } from './jobs/improve-skill.js'
import { JobDeferred } from './deferred.js'

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 1500)

type JobHandler = (job: JobRow, db: Db) => Promise<void>

// Handlers land here as each bloque implements them. An unqueued type simply
// isn't dispatched by any code path yet — see the fallback in runJob below.
const HANDLERS: Partial<Record<JobType, JobHandler>> = {
  probe: runProbeJob,
  // One job type, two shapes: a payload carrying `videoIds` is a batch (N
  // videos in a single Gemini request), anything else is the single-video
  // path. Keeping one type avoids migrating the jobs.type CHECK constraint.
  analyze: async (job, db) => {
    // ANALYSIS_ENGINE=perception routes every video through @cva/perception.
    // A batch queued before the web stopped making them (they skipped the
    // V6.5 record) becomes one perception analysis per video.
    if (process.env.ANALYSIS_ENGINE === 'perception') {
      const single = JSON.parse(job.payload_json) as { videoIds?: string[] }
      for (const id of new Set(single.videoIds ?? [])) if (id !== job.video_id) enqueueJob({ type: 'analyze', videoId: id }, db)
      return runAnalyzePerceptionJob(job, db)
    }
    const payload = JSON.parse(job.payload_json) as { videoIds?: string[] }
    return Array.isArray(payload.videoIds) && payload.videoIds.length > 1
      ? runAnalyzeBatchJob(job, db)
      : runAnalyzeJob(job, db)
  },
  embed: runEmbedJob,
  detect_skills: runDetectSkillsJob,
  generate_skill: runGenerateSkillJob,
  improve_skill: runImproveSkillJob,
}

async function runJob(job: JobRow, db: Db): Promise<void> {
  const handler = HANDLERS[job.type]
  if (!handler) {
    throw new Error(`Sin handler para el job de tipo "${job.type}" (llega en un bloque posterior).`)
  }
  await handler(job, db)
}

async function main(): Promise<void> {
  const db = getDb()
  const status = inspectSchema(db)
  if (!status.ok) {
    console.error(`[worker] La base de datos no esta lista (${SQLITE_PATH}):`)
    for (const problem of status.problems) console.error(`  - ${problem}`)
    process.exit(1)
  }

  if (isAnotherWorkerAlive(db)) {
    console.error('[worker] Ya hay otro worker corriendo sobre esta base de datos. Cierra ese antes de abrir otro.')
    process.exit(1)
  }
  writeWorkerHeartbeat(db)
  // Timer-based, not per poll: the poll loop sits inside one long job for
  // many minutes, and the heartbeat must keep beating the whole time.
  // A database locked longer than busy_timeout (SQLITE_BUSY) used to throw
  // out of the loop and end the worker for good; now it waits and goes on.
  const busy = (what: string, err: unknown) => console.error(`[worker] la base de datos no respondió al ${what} (${(err as Error).message}); sigo en unos segundos.`)
  const heartbeat = setInterval(() => {
    try {
      writeWorkerHeartbeat(db)
    } catch (err) {
      busy('latido', err)
    }
  }, WORKER_HEARTBEAT_INTERVAL_MS)
  heartbeat.unref()

  const recovered = requeueOrphanedJobs(db)
  if (recovered > 0) {
    console.warn(`[worker] ${recovered} job(s) quedaron a medias por un cierre anterior; vuelven a la cola y retoman desde su ultimo checkpoint.`)
  }

  console.log(
    `[worker] Escuchando jobs. sqlite-vec ${status.vecVersion}, esquema v${status.schemaVersion}.`,
  )

  let stopping = false
  const stop = () => {
    stopping = true
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)

  while (!stopping) {
    let job: JobRow | undefined
    try {
      job = claimNextJob(db)
    } catch (err) {
      busy('buscar trabajo', err)
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS * 2))
      continue
    }
    if (!job) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      continue
    }

    console.log(`[worker] ${job.type} ${job.id} (intento ${job.attempts}/${job.max_attempts})`)
    try {
      await runJob(job, db)
      completeJob(job.id, undefined, db)
      console.log(`[worker] ${job.type} ${job.id} completado.`)
    } catch (error) {
      if (error instanceof JobDeferred) {
        // The handler already called deferJob() itself with the right
        // run_after and undid the attempts++ from claimNextJob — this isn't
        // a failure, just "try again later", so nothing more to do here.
        console.log(`[worker] ${job.type} ${job.id} diferido: ${error.message}`)
        continue
      }
      console.error(`[worker] ${job.type} ${job.id} fallo: ${(error as Error).message}`)
      try {
        retryOrFailJob(job, error as Error, db)
      } catch (err) {
        // The job stays 'running'; requeueOrphanedJobs picks it up on the next start.
        busy('guardar el fallo', err)
      }
    }
  }

  console.log('[worker] Detenido.')
  closeDb()
}

void main()
