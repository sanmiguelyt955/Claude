import { execFile } from 'node:child_process'
import { mkdir, readFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { DATA_DIR, getVideo, resolveDataPath } from '@cva/memory-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const run = promisify(execFile)
const pending = new Map<string, Promise<Buffer>>()

/**
 * A still of the video for its library card, taken once with FFmpeg (a tenth
 * into the video, so it skips black intros) and kept in data/thumbnails/.
 */
async function thumbnailOf(id: string, file: string, duration: number | null): Promise<Buffer> {
  const out = path.join(DATA_DIR, 'thumbnails', `${id}.jpg`)
  try {
    return await readFile(out)
  } catch {
    // not made yet
  }
  await mkdir(path.dirname(out), { recursive: true })
  const at = duration ? Math.min(duration * 0.1, 30) : 1
  const tmp = `${out}.${process.pid}.tmp.jpg`
  await run(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-hide_banner', '-v', 'error', '-y', '-ss', at.toFixed(2), '-i', file,
    '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', tmp,
  ])
  await rename(tmp, out)
  return readFile(out)
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params
  const video = getVideo(id)
  if (!video?.stored_path) return new Response(null, { status: 404 })
  let job = pending.get(id)
  if (!job) {
    job = thumbnailOf(id, resolveDataPath(video.stored_path), video.duration_seconds).finally(() => pending.delete(id))
    pending.set(id, job)
  }
  try {
    const jpg = await job
    return new Response(new Uint8Array(jpg), {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400' },
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}
