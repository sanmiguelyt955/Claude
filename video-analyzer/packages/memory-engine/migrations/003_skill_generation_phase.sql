-- ─────────────────────────────────────────────────────────────────────────
-- 003_skill_generation_phase — bloque 6 needs to log the "Crear Skill" call
-- (writing SKILL.md from a detected candidate) separately from the
-- detection call itself, so cost/quota per phase stays legible in the UI.
-- SQLite CHECK constraints cannot be altered in place, so this rebuilds
-- analysis_runs with the wider list and copies every existing row across.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE analysis_runs_new (
  id             TEXT PRIMARY KEY,
  video_id       TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  job_id         TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  segment_id     TEXT REFERENCES video_segments(id) ON DELETE SET NULL,
  phase          TEXT NOT NULL
                   CHECK (phase IN ('first_pass','deep_pass','skill_detection',
                                     'skill_generation','embedding')),
  provider       TEXT NOT NULL DEFAULT 'gemini',
  model          TEXT NOT NULL,
  processing_mode TEXT CHECK (processing_mode IN ('STATIC','AGENTIC')),

  input_tokens   INTEGER,
  output_tokens  INTEGER,
  cached_tokens  INTEGER,
  thought_tokens INTEGER,
  estimated_cost_usd REAL,

  latency_ms     INTEGER,
  succeeded      INTEGER NOT NULL DEFAULT 0 CHECK (succeeded IN (0, 1)),
  error_message  TEXT,
  raw_response_path TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO analysis_runs_new SELECT * FROM analysis_runs;

DROP TABLE analysis_runs;
ALTER TABLE analysis_runs_new RENAME TO analysis_runs;

CREATE INDEX idx_analysis_runs_video ON analysis_runs (video_id, created_at DESC);
CREATE INDEX idx_analysis_runs_day   ON analysis_runs (created_at);
