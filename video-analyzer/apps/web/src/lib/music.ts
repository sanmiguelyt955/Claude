import fs from 'node:fs'
import path from 'node:path'
import { creditText, createSources, parseLicense, verdict } from '@cva/music'
import type { Source, Track, Verdict } from '@cva/music'
import { DATA_DIR, getMusicTrackBySource, saveMusicTrack } from '@cva/memory-engine'
import type { MusicTrackRow } from '@cva/memory-engine'
import { downloadTrack } from '@cva/music'

export const MUSIC_DIR = path.join(DATA_DIR, 'music')

let override: { sources: Source[]; fetch?: typeof fetch } | null = null
/** Tests point the sources (and downloads) at a local fake instead of the internet. */
export function useMusicSourcesForTest(o: { sources: Source[]; fetch?: typeof fetch } | null): void {
  override = o
}
export const musicSources = (): Source[] => override?.sources ?? createSources()

export type TrackJson = {
  source: string
  sourceId: string
  title: string
  artist: string
  license: { code: string; version: string | null; url: string | null; label: string }
  verdict: Verdict
  verified: boolean
  durationSec: number | null
  audioUrl: string
  pageUrl: string | null
  credit: string
  tags: string[]
  saved: { id: string } | null
}

export function trackJson(t: Track): TrackJson {
  const saved = getMusicTrackBySource(t.source, t.sourceId)
  return {
    source: t.source,
    sourceId: t.sourceId,
    title: t.title,
    artist: t.artist,
    license: { code: t.license.code, version: t.license.version, url: t.license.url, label: licenseLabelOf(t) },
    verdict: verdict(t.license),
    verified: t.verified,
    durationSec: t.durationSec,
    audioUrl: t.audioUrl,
    pageUrl: t.pageUrl,
    credit: creditText(t),
    tags: t.tags,
    saved: saved ? { id: saved.id } : null,
  }
}

function licenseLabelOf(t: Track): string {
  const l = t.license
  if (l.code === 'cc0') return 'CC0 (dominio público)'
  if (l.code === 'pdm') return 'Dominio público'
  return `CC ${l.code.toUpperCase()}${l.version ? ` ${l.version}` : ''}`
}

export function savedJson(r: MusicTrackRow) {
  return {
    id: r.id,
    source: r.source,
    sourceId: r.source_id,
    title: r.title,
    artist: r.artist,
    license: { code: r.license_code, version: r.license_version, url: r.license_url },
    shareAlike: r.share_alike === 1,
    verified: r.verified === 1,
    credit: r.credit,
    pageUrl: r.page_url,
    durationSec: r.duration_sec,
    tags: JSON.parse(r.tags) as string[],
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
  }
}

export class MusicError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

/**
 * Saves a track into the library. The server looks the track up again by
 * source + id: the browser never says which URL to download or which licence
 * applies, so a forged request cannot make it fetch an address or accept a
 * licence the source did not give.
 */
export async function saveTrackFromSource(source: string, sourceId: string): Promise<MusicTrackRow> {
  const src = musicSources().find((s) => s.id === source)
  if (!src) throw new MusicError('Fuente desconocida.', 400)
  const off = src.unavailable()
  if (off) throw new MusicError(off, 400)
  let track: Track | null
  try {
    track = await src.resolve(sourceId)
  } catch (e) {
    throw new MusicError(`${src.label} no respondió: ${(e as Error).message}`, 502)
  }
  if (!track) throw new MusicError('La pieza ya no está en la fuente.', 404)
  if (verdict(track.license) === 'refused') throw new MusicError('La licencia de esta pieza no permite uso comercial.', 422)

  const existing = getMusicTrackBySource(track.source, track.sourceId)
  const id = existing?.id ?? crypto.randomUUID()
  let got
  try {
    got = await downloadTrack(track, path.join(MUSIC_DIR, id), 'audio', override?.fetch)
  } catch (e) {
    fs.rmSync(path.join(MUSIC_DIR, id), { recursive: true, force: true })
    throw new MusicError((e as Error).message, 502)
  }
  const license = parseLicense(track.license.url ?? track.license.code, track.license.version)
  return saveMusicTrack({
    id,
    source: track.source,
    source_id: track.sourceId,
    title: track.title,
    artist: track.artist,
    license_code: license.code,
    license_version: license.version,
    license_url: license.url,
    share_alike: license.shareAlike ? 1 : 0,
    verified: track.verified ? 1 : 0,
    credit: creditText(track),
    page_url: track.pageUrl,
    duration_sec: track.durationSec,
    tags: track.tags,
    stored_path: path.relative(DATA_DIR, got.file),
    mime: got.mime,
    size_bytes: got.bytes,
  })
}
