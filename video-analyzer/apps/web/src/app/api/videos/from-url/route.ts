import { NextResponse } from 'next/server'
import { createVideo, enqueueJob, isAnotherWorkerAlive } from '@cva/memory-engine'
import { readJsonObject, stringField } from '../../../../lib/json-body'

export const runtime = 'nodejs'

/**
 * Only creates the DB row and the 'probe' job — the actual download (or,
 * for a YouTube URL, the oEmbed title lookup) happens in the worker
 * (apps/worker/src/jobs/probe.ts), so this responds immediately instead of
 * blocking the request on a possibly slow remote transfer.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = await readJsonObject(request)
  const url = stringField(body, 'url')
  if (!url) {
    return NextResponse.json({ error: 'Pega el enlace del video.' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: 'El enlace no es válido.' }, { status: 400 })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Solo se aceptan enlaces que empiecen por http:// o https://.' }, { status: 400 })
  }

  // A bare '%' (oferta-50%.mp4) is not valid percent-encoding: keep it as typed.
  const last = parsed.pathname.split('/').filter(Boolean).pop() ?? url
  let fallbackTitle = last
  try {
    fallbackTitle = decodeURIComponent(last)
  } catch {}

  const video = createVideo({
    title: stringField(body, 'title') || fallbackTitle,
    sourceKind: 'url',
    sourceUrl: url,
  })

  const job = enqueueJob({ type: 'probe', videoId: video.id })

  return NextResponse.json({ video, jobId: job.id, workerAlive: isAnotherWorkerAlive() }, { status: 202 })
}
