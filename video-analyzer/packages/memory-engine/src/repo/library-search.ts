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
function buildFtsQuery(text: string): string | null {
  const tokens = text
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  if (!tokens.length) return null
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(' AND ')
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

  const ftsQuery = buildFtsQuery(queryText)
  if (ftsQuery) {
    const ftsRows = db
      .prepare(
        `SELECT mc.*, v.title AS video_title, v.status AS video_status
           FROM memory_chunks_fts
           JOIN memory_chunks mc ON mc.rowid = memory_chunks_fts.rowid
           JOIN videos v ON v.id = mc.video_id
          WHERE memory_chunks_fts MATCH ?
          ORDER BY rank
          LIMIT ?`,
      )
      .all(ftsQuery, limit) as Array<MemoryChunkRow & { video_title: string; video_status: string }>

    for (const row of ftsRows) {
      const existing = byId.get(row.id)
      if (existing) {
        existing.match_type = 'both'
      } else {
        byId.set(row.id, { ...row, distance: DISTANCE_FOR_KEYWORD_ONLY, match_type: 'keyword' })
      }
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => {
      // "both" ranks above a same-distance semantic-only or keyword-only hit.
      if (a.match_type === 'both' && b.match_type !== 'both') return -1
      if (b.match_type === 'both' && a.match_type !== 'both') return 1
      return (a.distance ?? DISTANCE_FOR_KEYWORD_ONLY) - (b.distance ?? DISTANCE_FOR_KEYWORD_ONLY)
    })
    .slice(0, limit)
}

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
  const ftsQuery = buildFtsQuery(queryText)
  if (!ftsQuery) return []
  const rows = db
    .prepare(
      `SELECT mc.*
         FROM memory_chunks_fts
         JOIN memory_chunks mc ON mc.rowid = memory_chunks_fts.rowid
        WHERE memory_chunks_fts MATCH ? AND mc.video_id = ?
        ORDER BY rank
        LIMIT ?`,
    )
    .all(ftsQuery, videoId, limit) as MemoryChunkRow[]
  return rows.map((row) => ({ ...row, distance: DISTANCE_FOR_KEYWORD_ONLY }))
}
