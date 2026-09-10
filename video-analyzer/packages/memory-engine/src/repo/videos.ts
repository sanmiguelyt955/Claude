import { randomUUID } from 'node:crypto'
import type { Db } from '../db.js'
import { getDb } from '../db.js'
import type { VideoMetadata, VideoRow, VideoStatus } from '../types.js'

export type CreateVideoInput = {
  title: string
  sourceKind: 'file' | 'url'
  sourceUrl?: string
  originalFilename?: string
  /** Path relative to DATA_DIR where the bytes currently live, if any. */
  storedPath?: string
  /**
   * Lets the caller pre-generate the id so an upload's destination folder
   * (data/videos/{id}/) can be decided before the row exists. Generated
   * internally when omitted.
   */
  id?: string
}

/** Inserts the row that exists from the moment a file or URL is accepted. */
export function createVideo(input: CreateVideoInput, db: Db = getDb()): VideoRow {
  const id = input.id ?? randomUUID()
  db.prepare(
    `INSERT INTO videos (id, title, source_kind, source_url, original_filename, stored_path, status)
     VALUES (@id, @title, @sourceKind, @sourceUrl, @originalFilename, @storedPath, 'pending')`,
  ).run({
    id,
    title: input.title,
    sourceKind: input.sourceKind,
    sourceUrl: input.sourceUrl ?? null,
    originalFilename: input.originalFilename ?? null,
    storedPath: input.storedPath ?? null,
  })
  return getVideo(id, db)!
}

export function getVideo(id: string, db: Db = getDb()): VideoRow | undefined {
  return db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as VideoRow | undefined
}

export function listVideos(db: Db = getDb()): VideoRow[] {
  return db.prepare('SELECT * FROM videos ORDER BY created_at DESC').all() as VideoRow[]
}

export function setVideoStatus(
  id: string,
  status: VideoStatus,
  errorMessage: string | null = null,
  db: Db = getDb(),
): void {
  db.prepare('UPDATE videos SET status = ?, error_message = ? WHERE id = ?').run(
    status,
    errorMessage,
    id,
  )
}

export function setVideoStoredPath(id: string, storedPath: string, db: Db = getDb()): void {
  db.prepare('UPDATE videos SET stored_path = ? WHERE id = ?').run(storedPath, id)
}

/** Applies the result of an FFmpeg probe (packages/video-processor). */
export function applyVideoMetadata(
  id: string,
  metadata: VideoMetadata,
  contentHash: string,
  db: Db = getDb(),
): void {
  db.prepare(
    `UPDATE videos
        SET duration_seconds = @durationSeconds,
            width = @width,
            height = @height,
            fps = @fps,
            container = @container,
            video_codec = @videoCodec,
            audio_codec = @audioCodec,
            has_audio = @hasAudio,
            size_bytes = @sizeBytes,
            content_hash = @contentHash
      WHERE id = @id`,
  ).run({
    id,
    durationSeconds: metadata.durationSeconds,
    width: metadata.width,
    height: metadata.height,
    fps: metadata.fps,
    container: metadata.container,
    videoCodec: metadata.videoCodec,
    audioCodec: metadata.audioCodec,
    hasAudio: metadata.hasAudio ? 1 : 0,
    sizeBytes: metadata.sizeBytes,
    contentHash: contentHash,
  })
}

/** Sets just the title — used when a YouTube oEmbed lookup improves on the default. */
export function setVideoTitle(id: string, title: string, db: Db = getDb()): void {
  db.prepare('UPDATE videos SET title = ? WHERE id = ?').run(title, id)
}

export function deleteVideo(id: string, db: Db = getDb()): void {
  db.prepare('DELETE FROM videos WHERE id = ?').run(id)
}
