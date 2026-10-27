import { NextResponse } from 'next/server'
import { listVideos, getActiveJobForVideo, isAnotherWorkerAlive } from '@cva/memory-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Backs the polling list in the ingestion UI. Simple polling rather than SSE
 * (PROJECT.md §27 leaves this as Claude Code's call) — one video library for
 * one local user does not need a push channel, and polling has no server
 * state to leak between requests.
 *
 * Each video carries its active job's progress_label so a quota deferral
 * ("Se alcanzo el limite diario...") is visible instead of a video sitting
 * in 'queued' with no explanation.
 */
export async function GET(): Promise<NextResponse> {
  const videos = listVideos().map((video) => {
    const activeJob = getActiveJobForVideo(video.id)
    return {
      ...video,
      activeJob: activeJob
        ? {
            type: activeJob.type,
            status: activeJob.status,
            progressLabel: activeJob.progress_label,
            progressCurrent: activeJob.progress_current,
            progressTotal: activeJob.progress_total,
            startedAt: activeJob.started_at,
          }
        : null,
    }
  })
  return NextResponse.json({ videos, workerAlive: isAnotherWorkerAlive() })
}
