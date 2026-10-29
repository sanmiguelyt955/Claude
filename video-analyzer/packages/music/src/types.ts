import type { License } from './license.js'

export type SourceId = 'archive' | 'incompetech' | 'openverse' | 'jamendo'

/** A track found on a source, with everything needed to play, credit and save it. */
export type Track = {
  source: SourceId
  /** Id inside the source; with `source` it identifies the track. */
  sourceId: string
  title: string
  artist: string
  license: License
  durationSec: number | null
  /** Direct audio URL (https). */
  audioUrl: string
  /** Public page of the track, for the credit. */
  pageUrl: string | null
  tags: string[]
  /**
   * True when the author himself publishes the licence (Incompetech). Elsewhere
   * the licence is what the uploader declared and may be wrong (a cover of a
   * commercial song marked CC0), so the page tells the user to check it.
   */
  verified: boolean
}

export type SearchOptions = { limit?: number; signal?: AbortSignal }

export type Source = {
  id: SourceId
  label: string
  /** Why it cannot run (missing key), or null when ready. */
  unavailable(): string | null
  search(query: string, opts: SearchOptions): Promise<Track[]>
  /** Looks one track up again by id, so the server never trusts client URLs. */
  resolve(sourceId: string, opts?: SearchOptions): Promise<Track | null>
}

export type Fetch = typeof fetch
