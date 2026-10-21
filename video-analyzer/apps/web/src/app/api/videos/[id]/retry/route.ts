import { NextResponse } from 'next/server'
import { getVideo, setVideoStatus, enqueueJob, isAnotherWorkerAlive } from '@cva/memory-engine'

export const runtime = 'nodejs'

/**
 * Re-enqueues a 'probe' job for a video stuck in 'failed' — without asking
 * the user to re-upload or re-type the URL. The file (if any) is already on
 * disk; a failed download-by-URL simply retries the download too, since the
 * probe handler redoes that step whenever stored_path is still empty.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  const video = getVideo(id)
  if (!video) {
    return NextResponse.json({ error: 'El video no existe.' }, { status: 404 })
  }
  if (video.status !== 'failed') {
    return NextResponse.json(
      { error: `Solo se puede reintentar un video en estado "failed" (este esta en "${video.status}").` },
      { status: 409 },
    )
  }

  setVideoStatus(video.id, 'pending', null)
  const job = enqueueJob({ type: 'probe', videoId: video.id })

  return NextResponse.json({ video: getVideo(video.id), jobId: job.id, workerAlive: isAnotherWorkerAlive() }, { status: 202 })
}
