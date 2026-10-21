import { rm } from 'node:fs/promises'
import path from 'node:path'
import { DATA_DIR, VIDEOS_DIR, deleteVideo, getDb, type Db } from '@cva/memory-engine'

/**
 * Deletes the video's row; the foreign keys cascade to its jobs, analysis,
 * chat and skill improvements, while a skill it produced stays (unlinked).
 * Refused while a job still needs the video, including a batch analysis led
 * by another video. IMMEDIATE, so the worker cannot claim a job between the
 * check and the delete.
 */
export function deleteVideoUnlessBusy(id: string, db: Db = getDb()): 'deleted' | 'busy' | 'missing' {
  return db
    .transaction(() => {
      if (!db.prepare('SELECT 1 FROM videos WHERE id = ?').get(id)) return 'missing' as const
      const busy = db
        .prepare(
          `SELECT 1 FROM jobs
            WHERE status IN ('queued', 'running')
              AND (video_id = ? OR EXISTS (SELECT 1 FROM json_each(jobs.payload_json, '$.videoIds') WHERE value = ?))
            LIMIT 1`,
        )
        .get(id, id)
      if (busy) return 'busy' as const
      deleteVideo(id, db)
      return 'deleted' as const
    })
    .immediate()
}

/**
 * Everything kept on disk for one video: the file itself (and yt-dlp's
 * captions) from the upload or download, the perception engine's work
 * folder, the timeline's frames and audio clips, the library thumbnail and
 * the raw Gemini response.
 */
function videoDataPaths(id: string): string[] {
  return [
    path.join(VIDEOS_DIR, id),
    path.join(DATA_DIR, 'perception', id),
    path.join(DATA_DIR, 'frames', id),
    path.join(DATA_DIR, 'clips', id),
    path.join(DATA_DIR, 'thumbnails', `${id}.jpg`),
    path.join(DATA_DIR, 'tmp', 'gemini-responses', `${id}.json`),
  ]
}

/** Removes the video's files; returns the ones that could not be removed (e.g. still open in another program on Windows). */
export async function removeVideoFiles(id: string): Promise<string[]> {
  // The id names folders that get removed recursively: never let it climb out of them.
  if (!/^[\w-]+$/.test(id)) return []
  const left: string[] = []
  for (const target of videoDataPaths(id)) {
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => left.push(target))
  }
  return left
}
