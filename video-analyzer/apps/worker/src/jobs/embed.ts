import {
  getVideo,
  getPendingChunks,
  insertEmbeddingsBatch,
  insertAnalysisRun,
  updateJobProgress,
  deferJob,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
} from '@cva/memory-engine'
import type { Db, JobRow } from '@cva/memory-engine'
import { embedTexts, isQuotaExhaustedError } from '@cva/ai-router'
import { JobDeferred } from '../deferred.js'

type EmbedJobPayload = { videoId: string }

/**
 * Chunks indexed per run. The embedding free tier caps requests PER MINUTE
 * (Google's 429 names it `EmbedContentRequestsPerMinute...-FreeTier`, limit
 * 100) and counts each content, not each batched call — so a video with 147
 * chunks blows the cap in a single run.
 * Staying under it and continuing on the next tick costs nothing: embeddings
 * are not the scarce daily video quota.
 */
const CHUNKS_PER_RUN = 80

/** Seconds Google asks us to wait, from its own RetryInfo. */
function retryDelaySeconds(error: unknown): number {
  const match = /"retryDelay":"(\d+)s"/.exec((error as Error)?.message ?? '')
  const seconds = match ? Number(match[1]) : NaN
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 60
}

/**
 * Handles the 'embed' job: indexes whatever memory_chunks bloque 3 left
 * pending for this video (idx_memory_chunks_pending) into vec_memory_chunks,
 * so the semantic layer (bloque 8's search) has something to query. Runs
 * against the free tier's embedding quota — not the scarce daily video quota
 * — so running out here only means "wait a minute", never "give up": the job
 * defers itself instead of spending one of its attempts.
 */
export async function runEmbedJob(job: JobRow, db: Db): Promise<void> {
  const { videoId } = JSON.parse(job.payload_json) as EmbedJobPayload
  const video = getVideo(videoId, db)
  if (!video) throw new Error(`El video ${videoId} ya no existe.`)

  const allPending = getPendingChunks(videoId, db)
  if (allPending.length === 0) return

  // One slice per run, saved as soon as it comes back: a 429 halfway through
  // used to throw away every embedding already paid for, because nothing was
  // written until the whole set finished.
  const pending = allPending.slice(0, CHUNKS_PER_RUN)
  const remaining = allPending.length - pending.length
  if (remaining > 0) {
    updateJobProgress(job.id, { label: `Indexando ${pending.length} de ${allPending.length} fragmentos...` }, db)
  }

  const startedAt = Date.now()
  try {
    const embedded = await embedTexts(
      pending.map((chunk) => chunk.text),
      EMBEDDING_MODEL,
      EMBEDDING_DIMENSIONS,
      'RETRIEVAL_DOCUMENT',
    )

    insertEmbeddingsBatch(
      videoId,
      pending.map((chunk, i) => ({ chunkRowid: chunk.rowid, embedding: embedded[i]!.embedding })),
      EMBEDDING_MODEL,
      db,
    )

    insertAnalysisRun(
      {
        videoId,
        jobId: job.id,
        phase: 'embedding',
        model: EMBEDDING_MODEL,
        processingMode: null,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        thoughtTokens: 0,
        estimatedCostUsd: 0,
        latencyMs: Date.now() - startedAt,
        succeeded: true,
      },
      db,
    )

    console.log(
      `[embed] ${videoId}: ${pending.length} fragmentos indexados` +
        (remaining > 0 ? `, faltan ${remaining}.` : '.'),
    )

    if (remaining > 0) {
      const reason = `Faltan ${remaining} fragmentos por indexar (se continua para no pasar el limite por minuto).`
      deferJob(job.id, new Date(Date.now() + 60_000).toISOString(), reason, db)
      throw new JobDeferred(reason)
    }
  } catch (error) {
    if (error instanceof JobDeferred) throw error

    // The embedding cap is PER MINUTE, not per day: waiting is the fix, so
    // this must not burn one of the job's three attempts the way a real
    // failure does.
    if (isQuotaExhaustedError(error)) {
      const wait = retryDelaySeconds(error)
      const reason = `Limite de embeddings por minuto alcanzado, reintentando en ${wait}s.`
      updateJobProgress(job.id, { label: reason }, db)
      deferJob(job.id, new Date(Date.now() + wait * 1000).toISOString(), reason, db)
      throw new JobDeferred(reason)
    }

    insertAnalysisRun(
      {
        videoId,
        jobId: job.id,
        phase: 'embedding',
        model: EMBEDDING_MODEL,
        processingMode: null,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        thoughtTokens: 0,
        estimatedCostUsd: 0,
        latencyMs: Date.now() - startedAt,
        succeeded: false,
        errorMessage: (error as Error).message,
      },
      db,
    )
    throw error
  }
}
