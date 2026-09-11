import { NextResponse } from 'next/server'
import { getVideo, enqueueJobUnlessActive } from '@cva/memory-engine'

export const runtime = 'nodejs'

/**
 * Enqueues the real Gemini analysis (bloque 3). The worker does the actual
 * call (and any quota deferral) — this only validates and hands off, so the
 * request returns instantly regardless of how long the analysis takes.
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
  if (video.status !== 'queued') {
    return NextResponse.json(
      { error: `El video debe estar "listo para analizar" (esta en "${video.status}").` },
      { status: 409 },
    )
  }

  const outcome = enqueueJobUnlessActive({ type: 'analyze', videoId: video.id }, ['analyze', 'detect_skills'])
  if ('blocked' in outcome) {
    return NextResponse.json({ error: 'Ya hay un job en curso para este video.' }, { status: 409 })
  }

  return NextResponse.json({ video: getVideo(video.id), jobId: outcome.job.id }, { status: 202 })
}
