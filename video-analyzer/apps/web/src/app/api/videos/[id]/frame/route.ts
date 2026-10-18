import { execFile } from 'node:child_process'
import { mkdir, readFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { DATA_DIR, getVideo, resolveDataPath } from '@cva/memory-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const run = promisify(execFile)

/**
 * The picture at ?t= seconds, for each scene of the timeline: taken once with
 * FFmpeg and kept in data/frames/{id}/, named by tenths of a second.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params
  const video = getVideo(id)
  if (!video?.stored_path) return new Response(null, { status: 404 })
  const t = Number(new URL(request.url).searchParams.get('t'))
  if (!Number.isFinite(t) || t < 0) return new Response('t no válido', { status: 400 })
  const at = video.duration_seconds ? Math.min(t, Math.max(video.duration_seconds - 0.1, 0)) : t
  const out = path.join(DATA_DIR, 'frames', id, `${Math.round(at * 10)}.jpg`)
  try {
    return jpeg(await readFile(out))
  } catch {
    // not made yet
  }
  try {
    await mkdir(path.dirname(out), { recursive: true })
    const tmp = `${out}.${process.pid}.${Date.now()}.tmp.jpg`
    await run(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-hide_banner', '-v', 'error', '-y', '-ss', at.toFixed(2), '-i', resolveDataPath(video.stored_path),
      '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '5', tmp,
    ])
    await rename(tmp, out)
    return jpeg(await readFile(out))
  } catch {
    return new Response(null, { status: 404 })
  }
}

function jpeg(bytes: Buffer): Response {
  return new Response(new Uint8Array(bytes), {
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400' },
  })
}
