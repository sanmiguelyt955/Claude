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
  const start = Number(params.get('start'))
  const end = Number(params.get('end'))
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    return new Response('start/end no válidos', { status: 400 })
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
