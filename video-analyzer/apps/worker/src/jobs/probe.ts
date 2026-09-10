import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import {
  getVideo,
  applyVideoMetadata,
  setVideoStoredPath,
  setVideoStatus,
  setVideoTitle,
  updateJobProgress,
  resolveDataPath,
  toDataRelativePath,
  VIDEOS_DIR,
} from '@cva/memory-engine'
import type { Db, JobRow } from '@cva/memory-engine'
import { probe, hashFile, downloadToFile, isYoutubeUrl, isSupportedExtension } from '@cva/video-processor'

type ProbeJobPayload = { videoId: string }

/**
 * Best-effort title lookup via YouTube's public oEmbed endpoint — no API key,
 * no download. Purely cosmetic: a failure here must never fail the job.
 */
async function fetchYoutubeTitle(url: string): Promise<string | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    const response = await fetch(oembedUrl)
    if (!response.ok) return null
    const data = (await response.json()) as { title?: string }
    return data.title ?? null
  } catch {
    return null
  }
}

function guessExtensionFromUrl(url: string): string {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase()
    return isSupportedExtension(ext) ? ext : '.mp4'
  } catch {
    return '.mp4'
  }
}

/**
 * Handles the 'probe' job type: gets the video's bytes onto local disk if
 * they are not there yet (a URL still pending download), then runs FFmpeg
 * to fill in videos.duration_seconds/width/height/... (PROJECT.md §8 step 1).
 *
 * A YouTube URL is the one case with no local file at all — Gemini's File
 * API accepts a YouTube URL directly (bloque 3), so this only fetches a
 * nicer title via oEmbed and leaves FFmpeg out of it entirely.
 */
export async function runProbeJob(job: JobRow, db: Db): Promise<void> {
  const { videoId } = JSON.parse(job.payload_json) as ProbeJobPayload
  const video = getVideo(videoId, db)
  if (!video) throw new Error(`El video ${videoId} ya no existe.`)

  setVideoStatus(video.id, 'probing', null, db)

  if (video.source_kind === 'url' && video.source_url && isYoutubeUrl(video.source_url)) {
    updateJobProgress(job.id, { label: 'Obteniendo datos de YouTube...' }, db)
    const title = await fetchYoutubeTitle(video.source_url)
    if (title) setVideoTitle(video.id, title, db)
    setVideoStatus(video.id, 'queued', null, db)
    return
  }

  let absolutePath: string
  if (video.stored_path) {
    // File upload: the route handler already wrote the bytes to disk.
    absolutePath = resolveDataPath(video.stored_path)
  } else if (video.source_kind === 'url' && video.source_url) {
    updateJobProgress(job.id, { label: 'Descargando video...' }, db)
    const dir = path.join(VIDEOS_DIR, video.id)
    await mkdir(dir, { recursive: true })
    absolutePath = path.join(dir, `source${guessExtensionFromUrl(video.source_url)}`)
    await downloadToFile(video.source_url, absolutePath)
    setVideoStoredPath(video.id, toDataRelativePath(absolutePath), db)
  } else {
    throw new Error('El video no tiene ni archivo ni URL asociados.')
  }

  updateJobProgress(job.id, { label: 'Leyendo metadata con FFmpeg...' }, db)
  const [metadata, contentHash] = await Promise.all([probe(absolutePath), hashFile(absolutePath)])
  applyVideoMetadata(video.id, metadata, contentHash, db)
  setVideoStatus(video.id, 'queued', null, db)
}
