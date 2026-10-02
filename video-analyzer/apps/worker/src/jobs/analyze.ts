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
  recordModelDailyLimit,
  saveJobCheckpoint,
  DATA_DIR,
} from '@cva/memory-engine'
import type { Db, JobRow } from '@cva/memory-engine'
import { analyzeVideo, estimateVideoTokens, parseQuotaLimit, WindowedAnalysisError } from '@cva/ai-router'
import type { WindowState } from '@cva/ai-router'
import { isYoutubeUrl } from '@cva/video-processor'
import { listVideoModelsWithQuota, pickVideoModel } from '../quota.js'
import { JobDeferred } from '../deferred.js'
import { guessMimeType } from './mime.js'

type AnalyzeJobPayload = { videoId: string }

const VIDEO_PROCESSING = (process.env.GEMINI_VIDEO_PROCESSING ?? 'AGENTIC') as 'AGENTIC' | 'STATIC'


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

  // A PREVIOUS attempt of this same job may have exhausted every configured
  // model mid-video and saved its WindowState via saveJobCheckpoint (see the
  // catch block below) — without this, a retried attempt would start
  // analyzeVideoWindowedWithRotation from window 0 and redo work Google
  // already got paid for. result_json is otherwise unused until success
  // (completeJob writes it then), so any value here IS a checkpoint from an
  // earlier failed attempt of this exact job.
  let initialWindowState: WindowState | undefined
  if (job.result_json) {
    try {
      initialWindowState = JSON.parse(job.result_json) as WindowState
    } catch {
      // Malformed/foreign content — proceed without a checkpoint rather than
      // crash the job over a corrupt resume point.
    }
  }

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
      durationSeconds: video.duration_seconds,
      initialWindowState,
      // current/total are only present for a windowed video's per-window
      // notifications — the UI's progress bar turns from indeterminate into
      // a real percentage-plus-ETA display exactly when these are set.
      onProgress: (progress) => updateJobProgress(job.id, { label: progress.label, current: progress.current, total: progress.total }, db),
      // One quota-log row per real Gemini call, written the moment it
      // happens. Logging only at the end of the job left the quota counter
      // at 0 for the whole run and lost every request if the worker died
      // mid-video.
      onRequest: (event) => {
        insertAnalysisRun(
          {
            videoId: video.id,
            jobId: job.id,
            phase: 'first_pass',
            model: event.model,
            processingMode: event.processingMode,
            inputTokens: event.usage?.inputTokens ?? 0,
            outputTokens: event.usage?.outputTokens ?? 0,
            cachedTokens: event.usage?.cachedTokens ?? 0,
            thoughtTokens: event.usage?.thoughtTokens ?? 0,
            estimatedCostUsd: event.usage?.estimatedCostUsd ?? 0,
            latencyMs: event.latencyMs,
            succeeded: event.succeeded,
            errorMessage: event.error ?? null,
            requestCount: 1,
          },
          db,
        )
        // Google states the real DAILY cap in a daily-quota 429; remember it
        // so the next run stops guessing. A per-minute 429 carries the RPM
        // value instead, which must never be stored as a daily limit.
        if (event.error?.includes('PerDay')) {
          const reportedLimit = parseQuotaLimit(new Error(event.error))
          if (reportedLimit) recordModelDailyLimit(event.model, reportedLimit, db)
        }
      },
      // Saved after every finished window, not only when every model fails:
      // a worker killed mid-video (app closed, PC restarted) resumes from
      // the last finished window once the job is requeued at startup.
      onCheckpoint: (state) => saveJobCheckpoint(job.id, JSON.stringify(state), db),
    })
    modelUsed = attempt.modelUsed

    const { result, usage, processingModeUsed, rawResponseText } = attempt
    const latencyMs = Date.now() - startedAt

    const rawDir = path.join(DATA_DIR, 'tmp', 'gemini-responses')
    await mkdir(rawDir, { recursive: true })
    const rawPath = path.join(rawDir, `${video.id}.json`)
    await writeFile(rawPath, rawResponseText, 'utf8')

    // Summary row for the whole job (total latency + raw response path).
    // Requests and tokens are already in the per-call rows written by
    // onRequest, so this one counts 0 of each to avoid double counting.
    insertAnalysisRun(
      {
        videoId: video.id,
        jobId: job.id,
        phase: 'first_pass',
        model: modelUsed,
        processingMode: processingModeUsed,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        thoughtTokens: 0,
        estimatedCostUsd: 0,
        latencyMs,
        succeeded: true,
        rawResponsePath: path.relative(DATA_DIR, rawPath),
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
        // Every real call is already logged by onRequest; this row only
        // records that the job as a whole failed. The old default of 1 here
        // both double-counted and hid how many calls the job really spent.
        requestCount: 0,
      },
      db,
    )
    // Every model failed within THIS attempt — but if some windows were
    // already completed (by this attempt or a prior one), save them so the
    // next retry (or a permanently-failed job resumed by hand) does not
    // redo work Google already got paid for. A state with nextWindowIndex 0
    // is not worth persisting — that is "no progress", same as no checkpoint.
    if (error instanceof WindowedAnalysisError && error.state.nextWindowIndex > 0) {
      saveJobCheckpoint(job.id, JSON.stringify(error.state), db)
      console.warn(
        `[analyze] ${video.id}: guardado checkpoint en el tramo ${error.state.nextWindowIndex} para el proximo intento.`,
      )
    }
    throw error
  }
}
