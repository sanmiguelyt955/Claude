import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  getVideo,
  setVideoStatus,
  updateJobProgress,
  resolveDataPath,
  insertAnalysisRun,
  saveAnalysisResult,
  deferJob,
  enqueueJob,
  DATA_DIR,
} from '@cva/memory-engine'
import type { Db, JobRow } from '@cva/memory-engine'
import { analyzeVideo, estimateVideoTokens } from '@cva/ai-router'
import { isYoutubeUrl } from '@cva/video-processor'
import { listVideoModelsWithQuota, pickVideoModel } from '../quota.js'
import { JobDeferred } from '../deferred.js'

type AnalyzeJobPayload = { videoId: string }

const VIDEO_PROCESSING = (process.env.GEMINI_VIDEO_PROCESSING ?? 'AGENTIC') as 'AGENTIC' | 'STATIC'

const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/mov',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/avi',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
}

function guessMimeType(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? 'video/mp4'
}

/**
 * Handles the 'analyze' job: the single comprehensive Gemini call over an
 * already-probed video (PROJECT.md §8), persisted into the structured tables
 * plus a token/cost log entry (CLAUDE.md rule 4). See analyzeVideo() in
 * ai-router for why this is one call rather than first_pass + deep_pass.
 */
export async function runAnalyzeJob(job: JobRow, db: Db): Promise<void> {
  const { videoId } = JSON.parse(job.payload_json) as AnalyzeJobPayload
  const video = getVideo(videoId, db)
  if (!video) throw new Error(`El video ${videoId} ya no existe.`)
  // 'analyzing' is accepted too: a previous attempt of THIS job left the video
  // in that state before failing, and rejecting it here would make every retry
  // fail on the guard instead of on the real problem.
  if (video.status !== 'queued' && video.status !== 'analyzing') {
    throw new Error(`El video debe estar "listo para analizar" (esta en "${video.status}").`)
  }

  const models = listVideoModelsWithQuota(db)
  if (!models.length) {
    const blocked = pickVideoModel(db)
    const reason = blocked.ok ? 'Sin cupo disponible.' : blocked.reason
    const retryAfter = blocked.ok ? new Date(Date.now() + 60_000) : blocked.retryAfter
    updateJobProgress(job.id, { label: reason }, db)
    deferJob(job.id, retryAfter.toISOString(), reason, db)
    throw new JobDeferred(reason)
  }

  if (video.duration_seconds) {
    const estimate = estimateVideoTokens(video.duration_seconds, VIDEO_PROCESSING)
    if (estimate.high > Number(process.env.GEMINI_MAX_TPM ?? 250_000)) {
      // PROJECT.md §16: segmentation is the prescribed fallback here, but
      // true multi-call segment-and-stitch is deferred past bloque 3 (see
      // packages/video-processor's planSegments stub) — it would spend
      // several of the account's 20 daily requests on the videos that can
      // least afford it. For now this is a loud warning, not a hard stop:
      // agentic processing's up-to-88% reduction often clears the budget
      // anyway, and the actual usageMetadata after the call is what gets
      // logged and trusted, not this estimate.
      console.warn(
        `[analyze] ${video.id}: estimado ${estimate.low}-${estimate.high} tokens, ` +
          `puede exceder el TPM configurado. Continuando de todas formas (sin segmentacion en este bloque).`,
      )
    }
  }

  setVideoStatus(video.id, 'analyzing', null, db)

  const isYoutube = video.source_kind === 'url' && !!video.source_url && isYoutubeUrl(video.source_url)
  const source = isYoutube
    ? ({ kind: 'youtube', url: video.source_url! } as const)
    : ({ kind: 'file', path: resolveDataPath(video.stored_path!), mimeType: guessMimeType(video.stored_path!) } as const)

  const startedAt = Date.now()
  let modelUsed = models[0]!
  try {
    // The model rotation itself lives in analyzeVideo, which uploads the file
    // once and then tries each model against that same upload — rotating out
    // here instead would re-upload the whole video per model.
    const attempt = await analyzeVideo({
      models,
      processing: VIDEO_PROCESSING,
      source,
      onProgress: (label) => updateJobProgress(job.id, { label }, db),
    })
    modelUsed = attempt.modelUsed

    // One row per model that refused, so the quota log reflects what Google
    // actually counted, not just the model that ended up answering.
    for (const skipped of attempt.exhaustedModels) {
      insertAnalysisRun(
        {
          videoId: video.id,
          jobId: job.id,
          phase: 'first_pass',
          model: skipped.model,
          processingMode: null,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          thoughtTokens: 0,
          estimatedCostUsd: 0,
          latencyMs: 0,
          succeeded: false,
          errorMessage: skipped.error,
        },
        db,
      )
    }

    const { result, usage, processingModeUsed, rawResponseText } = attempt
    const latencyMs = Date.now() - startedAt

    const rawDir = path.join(DATA_DIR, 'tmp', 'gemini-responses')
    await mkdir(rawDir, { recursive: true })
    const rawPath = path.join(rawDir, `${video.id}.json`)
    await writeFile(rawPath, rawResponseText, 'utf8')

    insertAnalysisRun(
      {
        videoId: video.id,
        jobId: job.id,
        phase: 'first_pass',
        model: modelUsed,
        processingMode: processingModeUsed,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedTokens: usage.cachedTokens,
        thoughtTokens: usage.thoughtTokens,
        estimatedCostUsd: usage.estimatedCostUsd,
        latencyMs,
        succeeded: true,
        rawResponsePath: path.relative(DATA_DIR, rawPath),
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
    enqueueJob({ type: 'embed', videoId: video.id }, db)
    console.log(
      `[analyze] ${video.id}: ${processingModeUsed}, ${usage.inputTokens + usage.outputTokens} tokens, ` +
        `$${usage.estimatedCostUsd.toFixed(4)}, ${result.scenes.length} escenas.`,
    )
  } catch (error) {
    const latencyMs = Date.now() - startedAt
    insertAnalysisRun(
      {
        videoId: video.id,
        jobId: job.id,
        phase: 'first_pass',
        model: modelUsed,
        processingMode: null,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        thoughtTokens: 0,
        estimatedCostUsd: 0,
        latencyMs,
        succeeded: false,
        errorMessage: (error as Error).message,
      },
      db,
    )
    throw error
  }
}
