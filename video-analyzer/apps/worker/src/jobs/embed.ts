import {
  getVideo,
  getPendingChunks,
  insertEmbeddingsBatch,
  insertAnalysisRun,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
} from '@cva/memory-engine'
import type { Db, JobRow } from '@cva/memory-engine'
import { embedTexts } from '@cva/ai-router'

type EmbedJobPayload = { videoId: string }

/**
 * Handles the 'embed' job: indexes whatever memory_chunks bloque 3 left
 * pending for this video (idx_memory_chunks_pending) into vec_memory_chunks,
 * so the semantic layer (bloque 8's search) has something to query. Runs
 * against the free tier's embedding quota (100 RPM / 1000 RPD, verified in
 * bloque 1) — not the scarce 20 RPD video quota — so no per-call guard here.
 */
export async function runEmbedJob(job: JobRow, db: Db): Promise<void> {
  const { videoId } = JSON.parse(job.payload_json) as EmbedJobPayload
  const video = getVideo(videoId, db)
  if (!video) throw new Error(`El video ${videoId} ya no existe.`)

  const pending = getPendingChunks(videoId, db)
  if (pending.length === 0) return

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

    console.log(`[embed] ${videoId}: ${pending.length} fragmentos indexados.`)
  } catch (error) {
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
