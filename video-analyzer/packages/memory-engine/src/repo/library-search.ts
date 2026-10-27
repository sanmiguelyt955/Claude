import type { Db } from '../db.js'
import { getDb } from '../db.js'
import type { MemoryChunkRow } from '../types.js'

export type LibrarySearchResult = MemoryChunkRow & {
  video_title: string
  video_status: string
  distance: number | null
  /** 'semantic': only the vector index found it. 'keyword': only FTS did. 'both': found by both. */
  match_type: 'semantic' | 'keyword' | 'both'
}

/**
 * Common short function words (Spanish + a few English) that appear in
 * almost every chunk — without filtering these, a natural-language query
 * like "como generan los videos" would OR-match "los"/"con" against nearly
 * everything and mislabel most results as an "exact" keyword hit. Only
 * words with actual search value should drive the FTS side.
 */
const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'a', 'al',
  'en', 'con', 'por', 'para', 'sin', 'sobre', 'entre', 'que', 'como', 'cómo',
  'y', 'o', 'u', 'e', 'ni', 'pero', 'es', 'son', 'se', 'su', 'sus', 'lo', 'le',
  'les', 'mi', 'tu', 'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'muy',
  'the', 'a', 'an', 'of', 'in', 'on', 'for', 'with', 'and', 'or', 'to', 'is',
  // Question words: "¿qué dice del precio?" is about the price, not "qué".
  'qué', 'que', 'cuál', 'cual', 'cuánto', 'cuanto', 'cuánta', 'cuanta', 'cuántos', 'cuantos', 'dónde', 'donde',
  'cuándo', 'cuando', 'quién', 'quien', 'dice', 'hay', 'what', 'where', 'when', 'who', 'how', 'does',
])

/**
 * FTS5 MATCH syntax treats quotes/AND/OR/NOT/hyphens/etc as operators —
 * feeding it a raw user query can throw a syntax error instead of just
 * finding nothing. Quoting each significant token as its own FTS string
 * literal (with internal quotes escaped by doubling, the FTS5 escape rule)
 * makes it a literal substring match; joining with AND means a "keyword"
 * hit means every meaningful word in the query is actually present, closer
 * to the "exact product name/phrase" role this is meant to play alongside
 * the semantic vector search. Returns null when nothing meaningful is left.
 */
function buildFtsQuery(text: string, join: 'AND' | 'OR' = 'AND'): string | null {
  const tokens = text
    // Punctuation is not part of a word ("precio?" → "precio", "¿qué" → "qué").
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.toLowerCase())
    // Two-character terms and numbers count ("IA", "3D", "29"); one letter does not.
    .filter((t) => (t.length >= 2 || /\p{N}/u.test(t)) && !STOPWORDS.has(t))
  if (!tokens.length) return null
  return [...new Set(tokens)].map((t) => `"${t.replace(/"/g, '""')}"`).join(` ${join} `)
}

/**
 * FTS rows for the query: every term present first (the "exact" hits), then,
 * when those are fewer than `limit`, chunks with any of the terms ranked by
 * bm25 — a natural question rarely has all its words in one chunk.
 */
function ftsSearch<T extends { id: string }>(queryText: string, limit: number, run: (match: string, limit: number) => T[]): T[] {
  const all = buildFtsQuery(queryText, 'AND')
  if (!all) return []
  const rows = run(all, limit)
  if (rows.length >= limit) return rows
  const any = buildFtsQuery(queryText, 'OR')!
  if (any === all) return rows
  const seen = new Set(rows.map((r) => r.id))
  return [...rows, ...run(any, limit).filter((r) => !seen.has(r.id))].slice(0, limit)
}

const DISTANCE_FOR_KEYWORD_ONLY = 1 // vec0 cosine distance is in [0, 2]; treat an FTS-only hit as "close enough" to rank alongside vector results without a real distance to compare.

/**
 * Blended library-wide search (PROJECT.md §28 bloque 8): sqlite-vec for
 * semantic/paraphrase matches, FTS5 for exact terms (product names, quoted
 * phrases) that a paraphrase-oriented embedding can miss. Unlike
 * searchMemoryChunks (bloque 4, scoped to one video), this omits the
 * video_id partition-key filter entirely — vec0 partition keys are optional
 * on a query, so this just scans across every video's vectors.
 */
export function searchLibrary(
  /** null = keyword-only (no embedding available, e.g. Gemini down or no key). */
  queryEmbedding: number[] | null,
  queryText: string,
  limit: number,
  db: Db = getDb(),
): LibrarySearchResult[] {
  const vectorRows = !queryEmbedding ? [] : db
    .prepare(
      `SELECT mc.*, v.title AS video_title, v.status AS video_status, knn.distance AS distance
         FROM (
           SELECT chunk_rowid, distance FROM vec_memory_chunks
            WHERE embedding MATCH ? AND k = ?
         ) AS knn
         JOIN memory_chunks mc ON mc.rowid = knn.chunk_rowid
         JOIN videos v ON v.id = mc.video_id
        ORDER BY knn.distance`,
    )
    .all(new Float32Array(queryEmbedding), limit) as Array<
    MemoryChunkRow & { video_title: string; video_status: string; distance: number }
  >

  const byId = new Map<string, LibrarySearchResult>()
  for (const row of vectorRows) {
    byId.set(row.id, { ...row, match_type: 'semantic' })
  }

  const ftsIds: string[] = []
  {
    const ftsRows = ftsSearch(queryText, limit, (match, n) =>
      db
        .prepare(
          `SELECT mc.*, v.title AS video_title, v.status AS video_status
             FROM memory_chunks_fts
             JOIN memory_chunks mc ON mc.rowid = memory_chunks_fts.rowid
             JOIN videos v ON v.id = mc.video_id
            WHERE memory_chunks_fts MATCH ?
            ORDER BY rank
            LIMIT ?`,
        )
        .all(match, n) as Array<MemoryChunkRow & { video_title: string; video_status: string }>,
    )

    ftsIds.push(...ftsRows.map((r) => r.id))
    for (const row of ftsRows) {
      const existing = byId.get(row.id)
      if (existing) {
        existing.match_type = 'both'
      } else {
        byId.set(row.id, { ...row, distance: DISTANCE_FOR_KEYWORD_ONLY, match_type: 'keyword' })
      }
    }
  }

  // Reciprocal rank fusion: each list scores a hit by its position in it.
  // Sorting by distance put every keyword-only hit (distance 1) behind all
  // semantic ones, so with `limit` semantic results an exact product name
  // was never shown. A hit in both lists adds both scores and ranks first.
  return fuse(byId, [vectorRows.map((r) => r.id), ftsIds], limit)
}

function fuse<T extends { id: string }>(byId: Map<string, T>, lists: string[][], limit: number): T[] {
  const score = new Map<string, number>()
  for (const ids of lists) ids.forEach((rowId, rank) => score.set(rowId, (score.get(rowId) ?? 0) + 1 / (RRF_K + rank + 1)))
  return Array.from(byId.values())
    .sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0))
    .slice(0, limit)
}

/** The usual RRF constant: damps the gap between the first places of each list. */
const RRF_K = 60

/**
 * Keyword-only (FTS5) search scoped to one video: the fallback for the
 * per-video semantic search when no query embedding can be made. Same
 * literal-term matching as the keyword half of searchLibrary.
 */
export function searchVideoKeywords(
  videoId: string,
  queryText: string,
  limit: number,
  db: Db = getDb(),
): Array<MemoryChunkRow & { distance: number }> {
  const rows = ftsSearch(queryText, limit, (match, n) =>
    db
      .prepare(
        `SELECT mc.*
           FROM memory_chunks_fts
           JOIN memory_chunks mc ON mc.rowid = memory_chunks_fts.rowid
          WHERE memory_chunks_fts MATCH ? AND mc.video_id = ?
          ORDER BY rank
          LIMIT ?`,
      )
      .all(match, videoId, n) as MemoryChunkRow[],
  )
  return rows.map((row) => ({ ...row, distance: DISTANCE_FOR_KEYWORD_ONLY }))
}

/**
 * Search in one video, by meaning and by keyword, fused like searchLibrary.
 * Vector-only, a video whose pieces were not embedded yet (its embed job
 * still queued, or failed) found nothing at all.
 */
export function searchVideo<T extends MemoryChunkRow & { distance: number }>(
  videoId: string,
  semantic: T[],
  queryText: string,
  limit: number,
  db: Db = getDb(),
): Array<(T | (MemoryChunkRow & { distance: number })) & { match_type: 'semantic' | 'keyword' | 'both' }> {
  type Row = (T | (MemoryChunkRow & { distance: number })) & { match_type: 'semantic' | 'keyword' | 'both' }
  const byId = new Map<string, Row>(semantic.map((r) => [r.id, { ...r, match_type: 'semantic' as const }]))
  const keyword = searchVideoKeywords(videoId, queryText, limit, db)
  for (const row of keyword) {
    const existing = byId.get(row.id)
    if (existing) existing.match_type = 'both'
    else byId.set(row.id, { ...row, match_type: 'keyword' })
  }
  return fuse(byId, [semantic.map((r) => r.id), keyword.map((r) => r.id)], limit)
}
