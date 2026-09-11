import type { Db } from '../db.js'
import { getDb } from '../db.js'
import type { MemoryChunkRow } from '../types.js'

export type PendingChunk = MemoryChunkRow & { rowid: number }

/**
 * Chunks a video's analysis produced (bloque 3) that don't have a vector
 * yet — idx_memory_chunks_pending (WHERE embedding_rowid IS NULL) makes this
 * cheap even as the library grows. `rowid` is memory_chunks' own implicit
 * integer rowid (the table has a TEXT id as its declared PK, so rowid is a
 * separate hidden column) — it doubles as vec_memory_chunks.chunk_rowid so
 * the two tables stay addressable 1:1 without a separate mapping table.
 */
export function getPendingChunks(videoId: string, db: Db = getDb()): PendingChunk[] {
  return db
    .prepare(
      `SELECT rowid, * FROM memory_chunks WHERE video_id = ? AND embedding_rowid IS NULL ORDER BY rowid`,
    )
    .all(videoId) as PendingChunk[]
}

/**
 * Writes one chunk's vector and marks it indexed. vec0 is a virtual table,
 * so this INSERT plus the memory_chunks UPDATE are two separate statements —
 * always run inside the same transaction as its siblings from the caller.
 */
export function insertEmbedding(
  chunkRowid: number,
  videoId: string,
  embedding: number[],
  model: string,
  db: Db = getDb(),
): void {
  // vec0's explicit INTEGER PRIMARY KEY column requires a BigInt bind value —
  // a plain JS number (even integer-valued) fails with "Only integers are
  // allows for primary key values" because better-sqlite3 binds it via the
  // floating-point path unless it's a BigInt. Confirmed with a standalone
  // repro against sqlite-vec directly, not a guess.
  db.prepare(`INSERT INTO vec_memory_chunks (chunk_rowid, video_id, embedding) VALUES (?, ?, ?)`).run(
    BigInt(chunkRowid),
    videoId,
    new Float32Array(embedding),
  )
  db.prepare(`UPDATE memory_chunks SET embedding_rowid = ?, embedding_model = ? WHERE rowid = ?`).run(
    chunkRowid,
    model,
    chunkRowid,
  )
}

export function insertEmbeddingsBatch(
  videoId: string,
  items: Array<{ chunkRowid: number; embedding: number[] }>,
  model: string,
  db: Db = getDb(),
): void {
  const run = db.transaction(() => {
    for (const item of items) {
      insertEmbedding(item.chunkRowid, videoId, item.embedding, model, db)
    }
  })
  run()
}

export type SemanticSearchResult = MemoryChunkRow & { distance: number }

/**
 * K-nearest-neighbor search scoped to one video. `video_id` is a vec0
 * PARTITION KEY (see migrations/002_vec.sql.tpl), so this filter is pushed
 * into the index scan rather than applied as a post-filter over every
 * video's vectors.
 */
export function searchMemoryChunks(
  videoId: string,
  queryEmbedding: number[],
  limit: number,
  db: Db = getDb(),
): SemanticSearchResult[] {
  // vec0's `k` constraint must appear in the same query block as the MATCH
  // against the virtual table itself — a LIMIT on an outer JOIN (the more
  // natural way to write this) is rejected with "A LIMIT or 'k = ?'
  // constraint is required on vec0 knn queries", confirmed by running it.
  return db
    .prepare(
      `SELECT mc.*, knn.distance AS distance
         FROM (
           SELECT chunk_rowid, distance FROM vec_memory_chunks
            WHERE video_id = ? AND embedding MATCH ? AND k = ?
         ) AS knn
         JOIN memory_chunks mc ON mc.rowid = knn.chunk_rowid
        ORDER BY knn.distance`,
    )
    .all(videoId, new Float32Array(queryEmbedding), limit) as SemanticSearchResult[]
}
