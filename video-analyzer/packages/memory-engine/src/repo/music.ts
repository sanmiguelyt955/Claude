import { randomUUID } from 'node:crypto'
import type { Db } from '../db.js'
import { getDb } from '../db.js'

export type MusicTrackRow = {
  id: string
  source: string
  source_id: string
  title: string
  artist: string
  license_code: string
  license_version: string | null
  license_url: string | null
  share_alike: number
  verified: number
  credit: string
  page_url: string | null
  duration_sec: number | null
  tags: string
  stored_path: string
  mime: string
  size_bytes: number
  created_at: string
}

export type SaveMusicTrackInput = Omit<MusicTrackRow, 'id' | 'created_at' | 'tags'> & { id?: string; tags?: string[] }

/** Saves a track, or replaces the one already saved from the same source and id. */
export function saveMusicTrack(input: SaveMusicTrackInput, db: Db = getDb()): MusicTrackRow {
  const id = input.id ?? randomUUID()
  db.prepare(
    `INSERT INTO music_tracks (id, source, source_id, title, artist, license_code, license_version, license_url, share_alike, verified, credit, page_url, duration_sec, tags, stored_path, mime, size_bytes)
     VALUES (@id, @source, @source_id, @title, @artist, @license_code, @license_version, @license_url, @share_alike, @verified, @credit, @page_url, @duration_sec, @tags, @stored_path, @mime, @size_bytes)
     ON CONFLICT (source, source_id) DO UPDATE SET title = excluded.title, artist = excluded.artist, license_code = excluded.license_code,
       license_version = excluded.license_version, license_url = excluded.license_url, share_alike = excluded.share_alike, verified = excluded.verified,
       credit = excluded.credit, page_url = excluded.page_url, duration_sec = excluded.duration_sec, tags = excluded.tags,
       stored_path = excluded.stored_path, mime = excluded.mime, size_bytes = excluded.size_bytes`,
  ).run({ ...input, id, tags: JSON.stringify(input.tags ?? []) })
  return db.prepare('SELECT * FROM music_tracks WHERE source = ? AND source_id = ?').get(input.source, input.source_id) as MusicTrackRow
}

export function listMusicTracks(db: Db = getDb()): MusicTrackRow[] {
  return db.prepare('SELECT * FROM music_tracks ORDER BY created_at DESC, rowid DESC').all() as MusicTrackRow[]
}

export function getMusicTrack(id: string, db: Db = getDb()): MusicTrackRow | undefined {
  return db.prepare('SELECT * FROM music_tracks WHERE id = ?').get(id) as MusicTrackRow | undefined
}

export function getMusicTrackBySource(source: string, sourceId: string, db: Db = getDb()): MusicTrackRow | undefined {
  return db.prepare('SELECT * FROM music_tracks WHERE source = ? AND source_id = ?').get(source, sourceId) as MusicTrackRow | undefined
}

/** Removes the row and returns it, so the caller can delete the file. */
export function deleteMusicTrack(id: string, db: Db = getDb()): MusicTrackRow | undefined {
  const row = getMusicTrack(id, db)
  if (row) db.prepare('DELETE FROM music_tracks WHERE id = ?').run(id)
  return row
}
