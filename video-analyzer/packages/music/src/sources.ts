import { parseLicense, verdict } from './license.js'
import type { Fetch, SearchOptions, Source, SourceId, Track } from './types.js'

export type SourceConfig = {
  fetch?: Fetch
  jamendoClientId?: string
  /** Base URLs, replaceable so tests can point at a local fake server. */
  bases?: Partial<Record<SourceId, string>>
}

const TIMEOUT_MS = 15_000
const DEFAULT_BASES: Record<SourceId, string> = {
  archive: 'https://archive.org',
  incompetech: 'https://incompetech.com',
  openverse: 'https://api.openverse.org',
  jamendo: 'https://api.jamendo.com',
}

function timeoutSignal(extra?: AbortSignal): AbortSignal {
  const t = AbortSignal.timeout(TIMEOUT_MS)
  return extra ? AbortSignal.any([t, extra]) : t
}

async function getJson(f: Fetch, url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await f(url, { signal: timeoutSignal(signal), headers: { accept: 'application/json', 'user-agent': 'VideoAnalyzer-Music/0.1' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const str = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) ? str(v[0]) : typeof v === 'number' ? String(v) : '')
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number.parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}
const record = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Keeps only letters, digits and spaces: the query goes into Lucene syntax on some sources. */
export function cleanQuery(q: string): string {
  return q.normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

/** "01:02:03" or "05:07" to seconds. */
function clockSeconds(s: string): number | null {
  const parts = s.split(':').map(Number)
  if (!parts.length || parts.some((p) => !Number.isFinite(p))) return null
  return parts.reduce((acc, p) => acc * 60 + p, 0) || null
}

// ── Internet Archive ──────────────────────────────────────────────────────

const AUDIO_FORMATS = ['VBR MP3', 'MP3', '128Kbps MP3', '64Kbps MP3', '256Kbps MP3', 'Ogg Vorbis']

function archiveTrack(base: string, meta: Record<string, unknown>, onlyFile?: string): Track | null {
  const md = record(meta.metadata)
  const id = str(md.identifier)
  const license = parseLicense(str(md.licenseurl))
  if (!id || verdict(license) === 'refused') return null
  const files = list(meta.files).map(record).filter((f) => AUDIO_FORMATS.includes(str(f.format)) && !/spectrogram/i.test(str(f.name)))
  const file = onlyFile ? files.find((f) => str(f.name) === onlyFile) : files.sort((a, b) => AUDIO_FORMATS.indexOf(str(a.format)) - AUDIO_FORMATS.indexOf(str(b.format)))[0]
  if (!file) return null
  const name = str(file.name)
  const fileTitle = str(file.title)
  const itemTitle = str(md.title) || id
  return {
    source: 'archive',
    sourceId: `${id}/${name}`,
    title: fileTitle && fileTitle !== itemTitle ? `${fileTitle} (${itemTitle})` : itemTitle,
    artist: str(md.creator) || 'Autor desconocido',
    license,
    durationSec: str(file.length).includes(':') ? clockSeconds(str(file.length)) : Math.round(num(file.length) ?? 0) || null,
    audioUrl: `${base}/download/${encodeURIComponent(id)}/${name.split('/').map(encodeURIComponent).join('/')}`,
    pageUrl: `${base}/details/${encodeURIComponent(id)}`,
    tags: str(md.subject) ? [str(md.subject)] : [],
    verified: false,
  }
}

function archive(f: Fetch, base: string): Source {
  return {
    id: 'archive',
    label: 'Internet Archive',
    unavailable: () => null,
    async search(query, opts) {
      const q = cleanQuery(query)
      if (!q) return []
      const limit = opts.limit ?? 12
      // Music only: spoken-word and radio collections are most of the audio there.
      const lucene = `mediatype:audio AND licenseurl:*creativecommons.org* AND NOT collection:(librivoxaudio OR librivox OR oldtimeradio OR radioprograms OR podcasts) AND NOT subject:(librivox OR audiobook OR "old time radio") AND (${q})`
      const url =
        `${base}/advancedsearch.php?q=${encodeURIComponent(lucene)}&fl%5B%5D=identifier&fl%5B%5D=licenseurl` +
        `&rows=${limit * 3}&sort%5B%5D=downloads+desc&output=json`
      const docs = list(record(record(await getJson(f, url, opts.signal)).response).docs).map(record)
      // The licence is already in the search result: skip what would be refused before asking for files.
      const ok = docs.filter((d) => verdict(parseLicense(str(d.licenseurl))) !== 'refused').slice(0, limit)
      const metas = await Promise.all(
        ok.map((d) => getJson(f, `${base}/metadata/${encodeURIComponent(str(d.identifier))}`, opts.signal).then(record).catch(() => null)),
      )
      return metas.flatMap((m) => (m ? [archiveTrack(base, m)] : [])).filter((t): t is Track => t !== null)
    },
    async resolve(sourceId, opts) {
      const slash = sourceId.indexOf('/')
      if (slash < 1) return null
      const meta = record(await getJson(f, `${base}/metadata/${encodeURIComponent(sourceId.slice(0, slash))}`, opts?.signal))
      return archiveTrack(base, meta, sourceId.slice(slash + 1))
    },
  }
}

// ── Incompetech (Kevin MacLeod) ───────────────────────────────────────────

type Piece = Record<string, unknown>

function incompetech(f: Fetch, base: string): Source {
  let cache: { at: number; pieces: Piece[] } | null = null
  const pieces = async (signal?: AbortSignal): Promise<Piece[]> => {
    if (cache && Date.now() - cache.at < 3_600_000) return cache.pieces
    const data = await getJson(f, `${base}/music/royalty-free/pieces.json`, signal)
    cache = { at: Date.now(), pieces: list(data).map(record) }
    return cache.pieces
  }
  const toTrack = (p: Piece): Track => ({
    source: 'incompetech',
    sourceId: str(p.filename),
    title: str(p.title),
    artist: 'Kevin MacLeod (incompetech.com)',
    license: parseLicense('https://creativecommons.org/licenses/by/4.0/'),
    durationSec: clockSeconds(str(p.length)),
    audioUrl: `${base}/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(str(p.filename))}`,
    pageUrl: 'https://incompetech.com/music/royalty-free/music.html',
    tags: [str(p.feel), ...str(p.instruments).split(',')].map((s) => s.trim()).filter(Boolean),
    verified: true,
  })
  return {
    id: 'incompetech',
    label: 'Incompetech (Kevin MacLeod)',
    unavailable: () => null,
    async search(query, opts) {
      const words = cleanQuery(query).toLowerCase().split(' ').filter(Boolean)
      if (!words.length) return []
      const scored = (await pieces(opts.signal))
        .filter((p) => str(p.filename))
        .map((p) => {
          const hay = `${str(p.title)} ${str(p.feel)} ${str(p.instruments)} ${str(p.description)}`.toLowerCase()
          const title = str(p.title).toLowerCase()
          const hits = words.filter((w) => hay.includes(w)).length
          return { p, score: hits === words.length ? hits + words.filter((w) => title.includes(w)).length : 0 }
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
      return scored.slice(0, opts.limit ?? 12).map((s) => toTrack(s.p))
    },
    async resolve(sourceId, opts) {
      const p = (await pieces(opts?.signal)).find((x) => str(x.filename) === sourceId)
      return p ? toTrack(p) : null
    },
  }
}

// ── Openverse ─────────────────────────────────────────────────────────────

function openverseTrack(r: Record<string, unknown>): Track | null {
  const license = parseLicense(str(r.license_url) || str(r.license), str(r.license_version))
  const audioUrl = str(r.url)
  if (!str(r.id) || !audioUrl || verdict(license) === 'refused') return null
  return {
    source: 'openverse',
    sourceId: str(r.id),
    title: str(r.title) || 'Sin título',
    artist: str(r.creator) || 'Autor desconocido',
    license,
    durationSec: num(r.duration) ? Math.round(num(r.duration)! / 1000) : null,
    audioUrl,
    pageUrl: str(r.foreign_landing_url) || null,
    tags: list(r.tags).map((t) => str(record(t).name)).filter(Boolean).slice(0, 8),
    verified: false,
  }
}

function openverse(f: Fetch, base: string): Source {
  return {
    id: 'openverse',
    label: 'Openverse',
    unavailable: () => null,
    async search(query, opts) {
      const q = cleanQuery(query)
      if (!q) return []
      const url = `${base}/v1/audio/?q=${encodeURIComponent(q)}&license_type=commercial&page_size=${opts.limit ?? 12}`
      return list(record(await getJson(f, url, opts.signal)).results).map((r) => openverseTrack(record(r))).filter((t): t is Track => t !== null)
    },
    async resolve(sourceId, opts) {
      if (!/^[0-9a-f-]{8,64}$/i.test(sourceId)) return null
      return openverseTrack(record(await getJson(f, `${base}/v1/audio/${sourceId}/`, opts?.signal)))
    },
  }
}

// ── Jamendo (needs a free client id) ──────────────────────────────────────

function jamendo(f: Fetch, base: string, clientId: string | undefined): Source {
  const toTrack = (r: Record<string, unknown>): Track | null => {
    const license = parseLicense(str(r.license_ccurl))
    if (!str(r.id) || !str(r.audio) || verdict(license) === 'refused') return null
    return {
      source: 'jamendo',
      sourceId: str(r.id),
      title: str(r.name) || 'Sin título',
      artist: str(r.artist_name) || 'Autor desconocido',
      license,
      durationSec: num(r.duration),
      audioUrl: str(r.audio),
      pageUrl: str(r.shareurl) || null,
      tags: [],
      verified: false,
    }
  }
  const call = async (params: string, signal?: AbortSignal): Promise<Track[]> => {
    const url = `${base}/v3.0/tracks/?client_id=${encodeURIComponent(clientId ?? '')}&format=json&audioformat=mp32&${params}`
    const body = record(await getJson(f, url, signal))
    const status = record(body.headers)
    if (str(status.status) === 'failed') throw new Error(str(status.error_message) || 'Jamendo rechazó la petición')
    return list(body.results).map((r) => toTrack(record(r))).filter((t): t is Track => t !== null)
  }
  return {
    id: 'jamendo',
    label: 'Jamendo',
    unavailable: () => (clientId ? null : 'Falta JAMENDO_CLIENT_ID (clave gratuita en devportal.jamendo.com).'),
    async search(query, opts) {
      const q = cleanQuery(query)
      return q ? call(`limit=${opts.limit ?? 12}&search=${encodeURIComponent(q)}`, opts.signal) : []
    },
    async resolve(sourceId, opts) {
      return /^\d+$/.test(sourceId) ? ((await call(`id=${sourceId}`, opts?.signal))[0] ?? null) : null
    },
  }
}

export function createSources(config: SourceConfig = {}): Source[] {
  const f = config.fetch ?? fetch
  const b = { ...DEFAULT_BASES, ...config.bases }
  return [
    incompetech(f, b.incompetech),
    archive(f, b.archive),
    openverse(f, b.openverse),
    jamendo(f, b.jamendo, config.jamendoClientId ?? process.env.JAMENDO_CLIENT_ID),
  ]
}

export type SearchResult = {
  tracks: Track[]
  /** One line per source that failed or could not run; the rest still answer. */
  problems: { source: SourceId; label: string; message: string }[]
}

/** Searches every source at once. A failing source never hides the others. */
export async function searchAll(sources: Source[], query: string, opts: SearchOptions & { only?: SourceId[] } = {}): Promise<SearchResult> {
  const chosen = sources.filter((s) => !opts.only || opts.only.includes(s.id))
  const settled = await Promise.all(
    chosen.map(async (s) => {
      const off = s.unavailable()
      if (off) return { s, error: off, tracks: [] as Track[] }
      try {
        return { s, error: null, tracks: await s.search(query, opts) }
      } catch (e) {
        return { s, error: (e as Error).message, tracks: [] as Track[] }
      }
    }),
  )
  return {
    tracks: settled.flatMap((r) => r.tracks),
    problems: settled.flatMap((r) => (r.error ? [{ source: r.s.id, label: r.s.label, message: r.error }] : [])),
  }
}
