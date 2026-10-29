import path from 'node:path'
import { getVideo, resolveDataPath } from '@cva/memory-engine'
import { serveFile } from '../../../../../lib/serve-file'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
}

/**
 * The video file itself, for the player on the video page. Honours HTTP
 * Range requests so the browser can seek (jump to a timestamp) without
 * downloading the whole file first.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params
  const video = getVideo(id)
  if (!video?.stored_path) return new Response('El video no tiene archivo local.', { status: 404 })
  const file = resolveDataPath(video.stored_path)
  return serveFile(request, file, TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'No se encontró el archivo del video.')
}

export const HEAD = GET
