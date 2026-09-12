import { NextResponse } from 'next/server'
import { getVideo, enqueueJob } from '@cva/memory-engine'

export const runtime = 'nodejs'

type Body = { videoIds?: string[] }

/**
 * Queues several videos as ONE Gemini request (PROJECT.md §16: the free tier
 * caps requests per day, not videos, so batching is the cheapest way to get
 * more videos analyzed with the same quota). The worker enforces the size
 * limits and re-queues anything that does not fit.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as Body
  const videoIds = (body.videoIds ?? []).filter(Boolean)

  if (videoIds.length < 2) {
    return NextResponse.json({ error: 'Elige al menos 2 videos para analizar juntos.' }, { status: 400 })
  }

  const notReady = videoIds.filter((id) => {
    const video = getVideo(id)
    return !video || video.status !== 'queued'
  })
  if (notReady.length) {
    return NextResponse.json(
      { error: `${notReady.length} de los videos elegidos no estan listos para analizar.` },
      { status: 409 },
    )
  }

  const job = enqueueJob({ type: 'analyze', videoId: videoIds[0], payload: { videoIds } }, undefined)
  return NextResponse.json({ jobId: job.id, videoIds }, { status: 202 })
}
