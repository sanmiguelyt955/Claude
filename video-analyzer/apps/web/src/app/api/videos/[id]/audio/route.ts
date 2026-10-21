import { execFile } from 'node:child_process'
import { mkdir, readFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { DATA_DIR, getVideo, resolveDataPath } from '@cva/memory-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const run = promisify(execFile)
/** Longest clip served; a scene is at most a couple of minutes. */
const MAX_SECONDS = 300

/**
 * What is heard between ?start= and ?end= seconds, as a small Opus clip the
 * timeline can play next to each scene. Cut once and kept in data/clips/{id}/.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params
  const video = getVideo(id)
  if (!video?.stored_path) return new Response(null, { status: 404 })
  const params = new URL(request.url).searchParams
  // Number('') is 0: a missing start used to be read as the beginning.
  const start = numberParam(params.get('start'))
  let end = numberParam(params.get('end'))
  if (start === undefined || end === undefined || start < 0 || end <= start) {
    return new Response('start/end no válidos', { status: 400 })
  }
  // Past the end there is nothing to hear: an empty clip used to be cached
  // for a day. A scene that runs past the end is cut at it.
  if (video.duration_seconds) {
    if (start >= video.duration_seconds) return new Response(null, { status: 416 })
    end = Math.min(end, video.duration_seconds)
  }
  const length = Math.min(end - start, MAX_SECONDS)
  const out = path.join(DATA_DIR, 'clips', id, `${Math.round(start * 10)}-${Math.round(length * 10)}.webm`)
  try {
    return clip(await readFile(out))
  } catch {
    // not cut yet
  }
  try {
    await mkdir(path.dirname(out), { recursive: true })
    const tmp = `${out}.${process.pid}.${Date.now()}.tmp.webm`
    await run(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-hide_banner', '-v', 'error', '-y', '-ss', start.toFixed(2), '-t', length.toFixed(2),
      '-i', resolveDataPath(video.stored_path), '-vn', '-ac', '1', '-c:a', 'libopus', '-b:a', '48k',
      '-f', 'webm', tmp,
    ])
    await rename(tmp, out)
    return clip(await readFile(out))
  } catch {
    return new Response(null, { status: 404 })
  }
}

function clip(bytes: Buffer): Response {
  return new Response(new Uint8Array(bytes), {
    headers: { 'content-type': 'audio/webm', 'cache-control': 'private, max-age=86400', 'accept-ranges': 'none' },
  })
}

function numberParam(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}
