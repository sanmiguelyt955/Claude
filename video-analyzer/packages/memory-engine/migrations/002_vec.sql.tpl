-- ─────────────────────────────────────────────────────────────────────────
-- 002_vec — vector index (requires the sqlite-vec extension to be loaded)
--
-- {{DIMENSIONS}} is substituted by the migrator from EMBEDDING_DIMENSIONS.
-- A vec0 table's dimension is fixed at creation, so changing that env var
-- means dropping this table and re-running every embed job. The migrator
-- refuses to run silently in that case — see src/cli/migrate.ts.
-- ─────────────────────────────────────────────────────────────────────────

CREATE VIRTUAL TABLE vec_memory_chunks USING vec0 (
  -- Explicit rowid so memory_chunks.embedding_rowid can address a row.
  chunk_rowid INTEGER PRIMARY KEY,
  -- Partition key: lets a search be scoped to one video without a post-filter.
  video_id TEXT PARTITION KEY,
  embedding FLOAT[{{DIMENSIONS}}] distance_metric=cosine
);

-- vec0 is a virtual table, so ON DELETE CASCADE does not reach it. This
-- trigger is what actually keeps the vector index from leaking rows.
CREATE TRIGGER memory_chunks_vec_ad AFTER DELETE ON memory_chunks
  FOR EACH ROW WHEN old.embedding_rowid IS NOT NULL
BEGIN
  DELETE FROM vec_memory_chunks WHERE chunk_rowid = old.embedding_rowid;
END;
