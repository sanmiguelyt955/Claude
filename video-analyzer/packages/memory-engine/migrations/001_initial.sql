-- ─────────────────────────────────────────────────────────────────────────
-- 001_initial — core schema
-- Every column holding a position inside a video is REAL seconds from the
-- start of that video. Wall-clock columns are TEXT ISO-8601 UTC.
-- ─────────────────────────────────────────────────────────────────────────

-- Video sources ingested by the app. A row exists from the moment a file or
-- URL is accepted, before any analysis has run.
CREATE TABLE videos (
  id                TEXT PRIMARY KEY,           -- uuid
  title             TEXT NOT NULL,
  source_kind       TEXT NOT NULL CHECK (source_kind IN ('file', 'url')),
  source_url        TEXT,                       -- original URL when source_kind='url'
  original_filename TEXT,
  -- Path relative to DATA_DIR. NULL when the user declined to keep the file
  -- (default: nothing is retained without explicit opt-in, PROJECT.md §19).
  stored_path       TEXT,
  retained          INTEGER NOT NULL DEFAULT 0 CHECK (retained IN (0, 1)),
  -- Set once the user presses "Guardar en memoria". Analyses of non-persisted
  -- videos are discarded on cleanup.
  saved_to_memory   INTEGER NOT NULL DEFAULT 0 CHECK (saved_to_memory IN (0, 1)),

  -- FFmpeg-probed metadata. NULL until the probe step completes.
  duration_seconds  REAL,
  width             INTEGER,
  height            INTEGER,
  fps               REAL,
  container         TEXT,
  video_codec       TEXT,
  audio_codec       TEXT,
  has_audio         INTEGER,
  size_bytes        INTEGER,
  -- sha256 of the source file; lets us detect a re-upload of the same video.
  content_hash      TEXT,

  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','probing','queued','analyzing','ready','failed')),
  error_message     TEXT,

  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_videos_status     ON videos (status);
CREATE INDEX idx_videos_created_at ON videos (created_at DESC);
CREATE INDEX idx_videos_hash       ON videos (content_hash) WHERE content_hash IS NOT NULL;

-- Segments produced by FFmpeg when a video exceeds the per-request token
-- budget and has to be sent to Gemini in pieces (PROJECT.md §8, §16).
CREATE TABLE video_segments (
  id             TEXT PRIMARY KEY,
  video_id       TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  segment_index  INTEGER NOT NULL,
  start_seconds  REAL NOT NULL,
  end_seconds    REAL NOT NULL,
  stored_path    TEXT,
  -- Pre-flight estimate used to decide the split; compare against
  -- analysis_runs.input_tokens afterwards to calibrate the estimator.
  estimated_tokens INTEGER,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (video_id, segment_index)
);

-- Background work queue. Polled by apps/worker; deliberately not Redis.
CREATE TABLE jobs (
  id            TEXT PRIMARY KEY,
  video_id      TEXT REFERENCES videos(id) ON DELETE CASCADE,
  type          TEXT NOT NULL
                  CHECK (type IN ('probe','segment','analyze','embed','detect_skills',
                                  'generate_skill','improve_skill')),
  status        TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','running','done','failed','cancelled')),
  priority      INTEGER NOT NULL DEFAULT 0,   -- higher runs first
  payload_json  TEXT NOT NULL DEFAULT '{}',
  result_json   TEXT,

  -- Live progress for the UI. progress_total is NULL while still unknown.
  progress_current INTEGER NOT NULL DEFAULT 0,
  progress_total   INTEGER,
  progress_label   TEXT,                      -- shown as-is in the UI (Spanish)

  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 3,
  -- Set by the 429 backoff handler; the worker skips rows until this passes.
  run_after     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_error    TEXT,

  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  started_at    TEXT,
  finished_at   TEXT
);

-- The worker's claim query hits exactly this index.
CREATE INDEX idx_jobs_claim ON jobs (status, run_after, priority DESC, created_at);
CREATE INDEX idx_jobs_video ON jobs (video_id, created_at DESC);

-- One row per call to Gemini, for real cost/quota visibility (CLAUDE.md rule 4).
CREATE TABLE analysis_runs (
  id             TEXT PRIMARY KEY,
  video_id       TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  job_id         TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  segment_id     TEXT REFERENCES video_segments(id) ON DELETE SET NULL,
  phase          TEXT NOT NULL
                   CHECK (phase IN ('first_pass','deep_pass','skill_detection','embedding')),
  provider       TEXT NOT NULL DEFAULT 'gemini',
  model          TEXT NOT NULL,
  processing_mode TEXT CHECK (processing_mode IN ('STATIC','AGENTIC')),

  input_tokens   INTEGER,
  output_tokens  INTEGER,
  cached_tokens  INTEGER,
  thought_tokens INTEGER,
  -- USD, computed at insert time from the rates in ai-router. Stored because
  -- published rates change (the 2026 promo rates double on 2027-01-01).
  estimated_cost_usd REAL,

  latency_ms     INTEGER,
  succeeded      INTEGER NOT NULL DEFAULT 0 CHECK (succeeded IN (0, 1)),
  error_message  TEXT,
  raw_response_path TEXT,                     -- debug dump, relative to DATA_DIR
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_analysis_runs_video ON analysis_runs (video_id, created_at DESC);
CREATE INDEX idx_analysis_runs_day   ON analysis_runs (created_at);

-- Top-level narrative layer (PROJECT.md §8: resumen).
CREATE TABLE video_summaries (
  video_id      TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
  short_summary TEXT NOT NULL,                -- 1-2 sentences, for library cards
  full_summary  TEXT NOT NULL,
  topics_json   TEXT NOT NULL DEFAULT '[]',   -- string[]
  language      TEXT,                         -- BCP-47 of the spoken audio
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Timeline layer. Scenes tile the video; ordering is by start_seconds.
CREATE TABLE scenes (
  id            TEXT PRIMARY KEY,
  video_id      TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  scene_index   INTEGER NOT NULL,
  start_seconds REAL NOT NULL,
  end_seconds   REAL NOT NULL,
  title         TEXT,
  description   TEXT NOT NULL,
  -- What is heard during this scene, so the visual and the spoken layer stay
  -- joined in one row (CLAUDE.md rule 6: sync is a requirement, not an extra).
  audio_description TEXT,
  keyframe_path TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (video_id, scene_index),
  CHECK (end_seconds >= start_seconds)
);

CREATE INDEX idx_scenes_time ON scenes (video_id, start_seconds);

-- Transcript layer: timestamped speech, one row per utterance.
CREATE TABLE transcript_chunks (
  id            TEXT PRIMARY KEY,
  video_id      TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  scene_id      TEXT REFERENCES scenes(id) ON DELETE SET NULL,
  chunk_index   INTEGER NOT NULL,
  start_seconds REAL NOT NULL,
  end_seconds   REAL NOT NULL,
  speaker       TEXT,
  text          TEXT NOT NULL,
  language      TEXT,
  confidence    REAL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (video_id, chunk_index),
  CHECK (end_seconds >= start_seconds)
);

CREATE INDEX idx_transcript_time ON transcript_chunks (video_id, start_seconds);

-- Detail layer: objects, on-screen text (OCR), actions and their relations.
-- One table rather than four: they share every column and the UI tabs are
-- just filters on `kind`.
CREATE TABLE video_elements (
  id            TEXT PRIMARY KEY,
  video_id      TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  scene_id      TEXT REFERENCES scenes(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL
                  CHECK (kind IN ('object','on_screen_text','action','person','relation')),
  label         TEXT NOT NULL,
  detail        TEXT,
  start_seconds REAL NOT NULL,
  end_seconds   REAL,
  confidence    REAL,
  -- kind-specific extras: bounding boxes, relation endpoints, OCR styling.
  attributes_json TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_elements_kind ON video_elements (video_id, kind, start_seconds);

-- ── Semantic layer ────────────────────────────────────────────────────────
-- memory_chunks holds the retrievable text; the vec0 table (created in
-- 002_vec.sql, since it needs the sqlite-vec extension loaded) holds its
-- vector, keyed by embedding_rowid.
CREATE TABLE memory_chunks (
  id            TEXT PRIMARY KEY,
  video_id      TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  -- Which layer this text was distilled from; lets search be scoped.
  source        TEXT NOT NULL
                  CHECK (source IN ('summary','scene','transcript','element','skill')),
  source_id     TEXT,
  start_seconds REAL,
  end_seconds   REAL,
  text          TEXT NOT NULL,
  token_count   INTEGER,
  -- rowid handed to the vec0 table; NULL until the embed job runs.
  embedding_rowid INTEGER UNIQUE,
  embedding_model TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_memory_chunks_video   ON memory_chunks (video_id, start_seconds);
CREATE INDEX idx_memory_chunks_pending ON memory_chunks (id) WHERE embedding_rowid IS NULL;

-- Keyword search alongside vector search: sqlite-vec finds paraphrases,
-- FTS5 finds exact product names and quoted phrases. The UI blends both.
CREATE VIRTUAL TABLE memory_chunks_fts USING fts5 (
  text,
  content='memory_chunks',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER memory_chunks_fts_ai AFTER INSERT ON memory_chunks BEGIN
  INSERT INTO memory_chunks_fts (rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TRIGGER memory_chunks_fts_ad AFTER DELETE ON memory_chunks BEGIN
  INSERT INTO memory_chunks_fts (memory_chunks_fts, rowid, text)
    VALUES ('delete', old.rowid, old.text);
END;

CREATE TRIGGER memory_chunks_fts_au AFTER UPDATE OF text ON memory_chunks BEGIN
  INSERT INTO memory_chunks_fts (memory_chunks_fts, rowid, text)
    VALUES ('delete', old.rowid, old.text);
  INSERT INTO memory_chunks_fts (rowid, text) VALUES (new.rowid, new.text);
END;

-- ── Skills ────────────────────────────────────────────────────────────────
-- A reusable process spotted inside a video (PROJECT.md §12). A row is
-- created at detection time with status='detected'; the SKILL.md is only
-- written to disk when the user presses "Crear Skill".
CREATE TABLE skills (
  id            TEXT PRIMARY KEY,
  video_id      TEXT REFERENCES videos(id) ON DELETE SET NULL,
  -- Agent Skills spec: <=64 chars, lowercase/digits/hyphens only.
  name          TEXT NOT NULL,
  -- Agent Skills spec: <=200 chars.
  description   TEXT NOT NULL,
  -- Time range in the source video that this process was extracted from.
  start_seconds REAL,
  end_seconds   REAL,
  status        TEXT NOT NULL DEFAULT 'detected'
                  CHECK (status IN ('detected','generating','generated','discarded')),
  version       INTEGER NOT NULL DEFAULT 1,
  skill_md      TEXT,                          -- full SKILL.md contents
  -- Written folder under data/skills-generadas, relative to DATA_DIR.
  output_path   TEXT,
  -- references/ and scripts/ files: [{path, contents}]
  assets_json   TEXT NOT NULL DEFAULT '[]',
  confidence    REAL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (length(name) <= 64),
  CHECK (length(description) <= 200)
);

CREATE INDEX idx_skills_video ON skills (video_id);

-- Improvements proposed against an existing SKILL.md (PROJECT.md §13).
-- Each row is one [Aplicar]/[Ignorar] card in the UI.
CREATE TABLE skill_improvements (
  id            TEXT PRIMARY KEY,
  -- Set when improving a skill this app generated; NULL when the user pointed
  -- at a SKILL.md living elsewhere on disk.
  skill_id      TEXT REFERENCES skills(id) ON DELETE CASCADE,
  source_skill_path TEXT,
  video_id      TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL
                  CHECK (kind IN ('new_step','better_method','new_tool',
                                  'pitfall','missing_info','outdated')),
  title         TEXT NOT NULL,
  rationale     TEXT NOT NULL,
  -- Evidence: where in the video this improvement comes from.
  start_seconds REAL,
  end_seconds   REAL,
  -- The concrete edit, so [Aplicar] is deterministic rather than a re-prompt.
  proposed_diff TEXT,
  status        TEXT NOT NULL DEFAULT 'proposed'
                  CHECK (status IN ('proposed','applied','ignored')),
  applied_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_skill_improvements ON skill_improvements (video_id, status);

-- Keeps updated_at honest without touching every write site.
CREATE TRIGGER videos_touch AFTER UPDATE ON videos
  FOR EACH ROW WHEN old.updated_at = new.updated_at
BEGIN
  UPDATE videos SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = old.id;
END;

CREATE TRIGGER skills_touch AFTER UPDATE ON skills
  FOR EACH ROW WHEN old.updated_at = new.updated_at
BEGIN
  UPDATE skills SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = old.id;
END;
