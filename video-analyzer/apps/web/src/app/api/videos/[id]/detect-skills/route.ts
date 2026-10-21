import { NextResponse } from 'next/server'
import { getVideo, enqueueJobUnlessActive, isAnotherWorkerAlive } from '@cva/memory-engine'

export const runtime = 'nodejs'

/**
 * Enqueues 'detect_skills' (PROJECT.md §12, bloque 6). Shares the video's
 * 20 RPD Gemini budget, so this is a manual, explicit action — never
 * triggered automatically after analysis.
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
  if (video.status !== 'ready') {
    return NextResponse.json(
      { error: `El video debe estar analizado ("ready") para detectar skills (esta en "${video.status}").` },
      { status: 409 },
    )
  }

  const outcome = enqueueJobUnlessActive({ type: 'detect_skills', videoId: id }, ['detect_skills', 'analyze'])
  if ('blocked' in outcome) {
    return NextResponse.json({ error: 'Ya hay un job en curso para este video.' }, { status: 409 })
  }

  return NextResponse.json({ jobId: outcome.job.id, workerAlive: isAnotherWorkerAlive() }, { status: 202 })
}
