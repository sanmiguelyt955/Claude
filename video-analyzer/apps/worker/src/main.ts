import {
  getDb,
  inspectSchema,
  closeDb,
  SQLITE_PATH,
  claimNextJob,
  completeJob,
  retryOrFailJob,
} from '@cva/memory-engine'
import type { Db, JobRow, JobType } from '@cva/memory-engine'
import { runProbeJob } from './jobs/probe.js'
import { runAnalyzeJob } from './jobs/analyze.js'
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
  analyze: runAnalyzeJob,
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
    const job = claimNextJob(db)
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
      retryOrFailJob(job, error as Error, db)
    }
  }

  console.log('[worker] Detenido.')
  closeDb()
}

void main()
