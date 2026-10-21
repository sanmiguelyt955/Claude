import { NextResponse } from 'next/server'
import { getVideo, enqueueJob, isAnotherWorkerAlive } from '@cva/memory-engine'
import { readJsonObject } from '../../../../lib/json-body'

export const runtime = 'nodejs'

/**
 * Queues several videos as ONE Gemini request (PROJECT.md §16: the free tier
 * caps requests per day, not videos, so batching is the cheapest way to get
 * more videos analyzed with the same quota). The worker enforces the size
 * limits and re-queues anything that does not fit.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = await readJsonObject(request)
  const videoIds = [...new Set(Array.isArray(body.videoIds) ? body.videoIds.filter((id): id is string => typeof id === 'string' && id !== '') : [])]

  if (videoIds.length < 2) {
    return NextResponse.json({ error: 'Elige al menos 2 videos para analizar juntos.' }, { status: 400 })
  }

  const notReady = videoIds.filter((id) => {
    const video = getVideo(id)
    return !video || video.status !== 'queued'
  })
  if (notReady.length) {
    return NextResponse.json(
      { error: `${notReady.length} de los videos elegidos no están listos para analizar.` },
      { status: 409 },
    )
  }

  // The perception engine analyzes one video at a time, each with its full
  // V6.5 record; a single-request batch would skip it (and could never be redone).
  if (process.env.ANALYSIS_ENGINE === 'perception') {
    const jobIds = videoIds.map((videoId) => enqueueJob({ type: 'analyze', videoId }, undefined).id)
    return NextResponse.json({ jobIds, videoIds, separate: true, workerAlive: isAnotherWorkerAlive() }, { status: 202 })
  }
  const job = enqueueJob({ type: 'analyze', videoId: videoIds[0], payload: { videoIds } }, undefined)
  return NextResponse.json({ jobId: job.id, videoIds, workerAlive: isAnotherWorkerAlive() }, { status: 202 })
}
