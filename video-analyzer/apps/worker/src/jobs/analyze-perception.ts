import path from 'node:path'
import {
  getVideo,
  setVideoStatus,
  resolveDataPath,
  insertAnalysisRun,
  saveAnalysisResult,
  enqueueJob,
  saveJobCheckpoint,
  getLatestFailedAnalyzeCheckpoint,
  DATA_DIR,
} from '@cva/memory-engine'
import type { Db, JobRow } from '@cva/memory-engine'
import { perceive, parseCheckpoint } from '@cva/perception'

type AnalyzeJobPayload = { videoId: string }

/**
 * Analysis through @cva/perception instead of a single Gemini video call:
 * frames for "ver", Whisper for "escuchar", and a vision provider chain
 * (Gemini, Claude) that falls over on 503/429. Selected with
 * ANALYSIS_ENGINE=perception; the Gemini path stays the default.
 */
export async function runAnalyzePerceptionJob(job: JobRow, db: Db): Promise<void> {
  const { videoId } = JSON.parse(job.payload_json) as AnalyzeJobPayload
  const video = getVideo(videoId, db)
  if (!video) throw new Error(`El video ${videoId} ya no existe.`)
  if (video.status !== 'queued' && video.status !== 'analyzing') {
    throw new Error(`El video debe estar "listo para analizar" (esta en "${video.status}").`)
  }
  if (!video.stored_path) throw new Error('El video no tiene archivo local que analizar.')

  setVideoStatus(video.id, 'analyzing', null, db)
  const startedAt = Date.now()
  const workDir = path.join(DATA_DIR, 'perception', video.id)

  // A retry of this job keeps its own checkpoint; a new analyze job (the
  // "Reintentar" button) picks up the one its failed predecessor left.
  const checkpoint = parseCheckpoint(job.result_json) ?? parseCheckpoint(getLatestFailedAnalyzeCheckpoint(video.id, db))

  try {
    const result = await perceive(resolveDataPath(video.stored_path), workDir, {
      log: (msg) => console.log(`[perception] ${video.id}: ${msg}`),
      checkpoint,
      onCheckpoint: (cp) => saveJobCheckpoint(job.id, JSON.stringify(cp), db),
    })

    insertAnalysisRun(
      {
        videoId: video.id,
        jobId: job.id,
        phase: 'first_pass',
        model: 'perception',
        processingMode: null,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        thoughtTokens: 0,
        estimatedCostUsd: 0,
        latencyMs: Date.now() - startedAt,
        succeeded: true,
        requestCount: 0,
      },
      db,
    )

    saveAnalysisResult(
      video.id,
      {
        summary: {
          shortSummary: result.summary.short_summary,
          fullSummary: result.summary.full_summary,
          topics: result.summary.topics,
          language: result.summary.language,
        },
        scenes: result.scenes.map((s) => ({
          index: s.index,
          startSeconds: s.start_seconds,
          endSeconds: s.end_seconds,
          title: s.title,
          description: s.description,
          audioDescription: s.audio_description,
        })),
        transcript: result.transcript.map((t) => ({
          index: t.index,
          startSeconds: t.start_seconds,
          endSeconds: t.end_seconds,
          speaker: t.speaker,
          text: t.text,
          language: t.language,
        })),
        elements: result.elements.map((e) => ({
          kind: e.kind,
          label: e.label,
          detail: e.detail,
          startSeconds: e.start_seconds,
          endSeconds: e.end_seconds,
        })),
      },
      db,
    )
    setVideoStatus(video.id, 'ready', null, db)
    // Same as the Gemini path: index the new analysis for library search.
    enqueueJob({ type: 'embed', videoId: video.id }, db)
    console.log(`[perception] ${video.id}: ${result.scenes.length} escenas, ${result.transcript.length} frases.`)
  } catch (error) {
    insertAnalysisRun(
      {
        videoId: video.id,
        jobId: job.id,
        phase: 'first_pass',
        model: 'perception',
        processingMode: null,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        thoughtTokens: 0,
        estimatedCostUsd: 0,
        latencyMs: Date.now() - startedAt,
        succeeded: false,
        errorMessage: (error as Error).message,
        requestCount: 0,
      },
      db,
    )
    // Status stays 'analyzing' so the retry passes the guard above;
    // retryOrFailJob marks the video 'failed' once retries run out.
    throw error
  }
}
