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
} from '@cva/memory-engine'
import type { Db, JobRow, VideoRow } from '@cva/memory-engine'
import { analyzeVideosBatch, parseQuotaLimit } from '@cva/ai-router'
import { isYoutubeUrl } from '@cva/video-processor'
import { listVideoModelsWithQuota, pickVideoModel } from '../quota.js'
import { JobDeferred } from '../deferred.js'
import { guessMimeType } from './mime.js'

type BatchPayload = { videoIds: string[] }

/**
 * Caps that keep a batch honest. The 65k output-token ceiling is shared by
 * every video in the call, so past a certain size the per-video analysis
 * stops being exhaustive (or the JSON gets truncated outright) — which would
 * defeat the purpose of batching to begin with.
 *
 * The 600s default from before assumed sparse ~50s scenes, then 150s once the
 * prompt moved to second-by-second audio description. The schema has since
 * tightened further — EXACTLY one scene object per second, never several
 * seconds bundled into one entry (see schema.ts) — which produces even more
 * JSON per second of combined footage than that 150s figure assumed. Halved
 * again for the same safety margin applied to GEMINI_WINDOW_SECONDS.
 */
const MAX_BATCH_VIDEOS = Number(process.env.GEMINI_BATCH_MAX_VIDEOS ?? 5)
const MAX_BATCH_SECONDS = Number(process.env.GEMINI_BATCH_MAX_SECONDS ?? 75)

export function planBatch(videos: VideoRow[]): { batch: VideoRow[]; skipped: VideoRow[] } {
  const batch: VideoRow[] = []
  const skipped: VideoRow[] = []
  let total = 0
  for (const video of videos) {
    const duration = video.duration_seconds ?? 0
    // A video long enough to need windowing on its own does not belong in a
    // shared-budget batch call at all, regardless of how much room is left —
    // it goes through the single-video (possibly windowed) path instead.
    if (batch.length >= MAX_BATCH_VIDEOS || total + duration > MAX_BATCH_SECONDS || duration > MAX_BATCH_SECONDS) {
      skipped.push(video)
      continue
    }
    batch.push(video)
    total += duration
  }
  return { batch, skipped }
}

/**
 * Analyzes several videos in ONE Gemini call (PROJECT.md §16's quota problem,
 * attacked from the other side): with a free tier capped at requests per day
 * rather than tokens per day, putting 5 short videos in one request makes
 * those 5 cost what 1 used to. Only the row that owns the call is counted
 * against the quota (`requestCount`), the rest ride along at 0.
 */
export async function runAnalyzeBatchJob(job: JobRow, db: Db): Promise<void> {
  const { videoIds } = JSON.parse(job.payload_json) as BatchPayload

  const candidates = videoIds
    .map((id) => getVideo(id, db))
    .filter((v): v is VideoRow => !!v && (v.status === 'queued' || v.status === 'analyzing'))

  if (!candidates.length) throw new Error('Ningun video del lote esta listo para analizar.')

  const { batch, skipped } = planBatch(candidates)

  const models = listVideoModelsWithQuota(db)
  if (!models.length) {
    const blocked = pickVideoModel(db)
    const reason = blocked.ok ? 'Sin cupo disponible.' : blocked.reason
    const retryAfter = blocked.ok ? new Date(Date.now() + 60_000) : blocked.retryAfter
    updateJobProgress(job.id, { label: reason }, db)
    deferJob(job.id, retryAfter.toISOString(), reason, db)
    throw new JobDeferred(reason)
  }

  // Anything that did not fit goes back to the queue as its own job rather
  // than being silently dropped — once, after the quota check: before it,
  // every deferral of this batch queued another copy.
  for (const video of skipped) {
    const active = db
      .prepare("SELECT 1 FROM jobs WHERE video_id = ? AND type = 'analyze' AND status IN ('queued', 'running') AND id <> ? LIMIT 1")
      .get(video.id, job.id)
    if (!active) enqueueJob({ type: 'analyze', videoId: video.id }, db)
  }

  for (const video of batch) setVideoStatus(video.id, 'analyzing', null, db)

  const items = batch.map((video) => {
    const isYoutube = video.source_kind === 'url' && !!video.source_url && isYoutubeUrl(video.source_url)
    return {
      key: video.id,
      title: video.title,
      durationSeconds: video.duration_seconds,
      source: isYoutube
        ? ({ kind: 'youtube', url: video.source_url! } as const)
        : ({
            kind: 'file',
            path: resolveDataPath(video.stored_path!),
            mimeType: guessMimeType(video.stored_path!),
          } as const),
    }
  })

  const startedAt = Date.now()
  try {
    const { results, usage, modelUsed, missingKeys } = await analyzeVideosBatch({
      models,
      items,
      onProgress: (label) => updateJobProgress(job.id, { label }, db),
      // Each refused call is a request Google counted, under its own model.
      onFailedRequest: ({ model, error, latencyMs }) => {
        // Only Google's daily quota is a daily limit: a per-minute 429
        // carries its per-minute value ("5"), which was stored as the daily
        // cap of the first model for good.
        if (error.includes('PerDay')) {
          const limit = parseQuotaLimit(new Error(error))
          if (limit) recordModelDailyLimit(model, limit, db)
        }
        insertAnalysisRun(
          {
            videoId: batch[0]!.id,
            jobId: job.id,
            phase: 'first_pass',
            model,
            processingMode: 'STATIC',
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            thoughtTokens: 0,
            estimatedCostUsd: 0,
            latencyMs,
            succeeded: false,
            errorMessage: error,
            requestCount: 1,
          },
          db,
        )
      },
    })
    const latencyMs = Date.now() - startedAt

    // Cost and tokens are shared, so split them evenly for a per-video view;
    // only the first row carries the request against the daily quota.
    const share = results.length || 1
    results.forEach(({ key, result }, index) => {
      insertAnalysisRun(
        {
          videoId: key,
          jobId: job.id,
          phase: 'first_pass',
          model: modelUsed,
          processingMode: 'STATIC',
          inputTokens: Math.round(usage.inputTokens / share),
          outputTokens: Math.round(usage.outputTokens / share),
          cachedTokens: Math.round(usage.cachedTokens / share),
          thoughtTokens: Math.round(usage.thoughtTokens / share),
          estimatedCostUsd: usage.estimatedCostUsd / share,
          latencyMs,
          succeeded: true,
          requestCount: index === 0 ? 1 : 0,
        },
        db,
      )

      saveAnalysisResult(
        key,
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

      setVideoStatus(key, 'ready', null, db)
      enqueueJob({ type: 'embed', videoId: key }, db)
    })

    // A video the model skipped gets its own single-video job instead of
    // being left stuck in 'analyzing' forever.
    for (const key of missingKeys) {
      setVideoStatus(key, 'queued', null, db)
      enqueueJob({ type: 'analyze', videoId: key }, db)
    }

    console.log(
      `[analyze-batch] ${results.length} videos en 1 peticion (${modelUsed}), ` +
        `${usage.inputTokens + usage.outputTokens} tokens, $${usage.estimatedCostUsd.toFixed(4)}` +
        (missingKeys.length ? `, ${missingKeys.length} reencolados` : ''),
    )
  } catch (error) {
    for (const video of batch) setVideoStatus(video.id, 'queued', null, db)
    insertAnalysisRun(
      {
        videoId: batch[0]!.id,
        jobId: job.id,
        phase: 'first_pass',
        model: models[0]!,
        processingMode: 'STATIC',
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        thoughtTokens: 0,
        estimatedCostUsd: 0,
        latencyMs: Date.now() - startedAt,
        succeeded: false,
        errorMessage: (error as Error).message,
        // The requests themselves were counted one by one above; an upload
        // failure sent none.
        requestCount: 0,
      },
      db,
    )
    throw error
  }
}
