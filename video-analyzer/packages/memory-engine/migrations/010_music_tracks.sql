-- ─────────────────────────────────────────────────────────────────────────
-- 010_music_tracks — the "Música libre" library: licensed tracks saved from
-- Internet Archive, Incompetech, Openverse or Jamendo. The licence and the
-- ready-to-paste credit are kept with each file.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE music_tracks (
  id            TEXT PRIMARY KEY,
  source        TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  title         TEXT NOT NULL,
  artist        TEXT NOT NULL,
  license_code  TEXT NOT NULL,
  license_version TEXT,
  license_url   TEXT,
  share_alike   INTEGER NOT NULL DEFAULT 0,
  verified      INTEGER NOT NULL DEFAULT 0,
  credit        TEXT NOT NULL DEFAULT '',
  page_url      TEXT,
  duration_sec  INTEGER,
  tags          TEXT NOT NULL DEFAULT '[]',
  stored_path   TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (source, source_id)
);
