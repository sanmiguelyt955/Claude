import { NextResponse } from 'next/server'
import { createVideo, enqueueJob } from '@cva/memory-engine'

export const runtime = 'nodejs'

/**
 * Only creates the DB row and the 'probe' job — the actual download (or,
 * for a YouTube URL, the oEmbed title lookup) happens in the worker
 * (apps/worker/src/jobs/probe.ts), so this responds immediately instead of
 * blocking the request on a possibly slow remote transfer.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: { url?: string; title?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo invalido: se esperaba JSON.' }, { status: 400 })
  }

  const url = body.url?.trim()
  if (!url) {
    return NextResponse.json({ error: 'Falta el campo "url".' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: 'La URL no es valida.' }, { status: 400 })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Solo se aceptan URLs http(s).' }, { status: 400 })
  }

  const fallbackTitle = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? url)

  const video = createVideo({
    title: body.title?.trim() || fallbackTitle,
    sourceKind: 'url',
    sourceUrl: url,
  })

  const job = enqueueJob({ type: 'probe', videoId: video.id })

  return NextResponse.json({ video, jobId: job.id }, { status: 202 })
}
