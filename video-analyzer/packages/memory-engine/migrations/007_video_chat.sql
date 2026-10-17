-- ─────────────────────────────────────────────────────────────────────────
-- 007_video_chat — conversation with a video (Q&A over its analysis). Each
-- row is one turn; the assistant's answers cite timestamps from the stored
-- scenes/transcript. Deleting the video deletes its chat.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE video_chat_messages (
  id         TEXT PRIMARY KEY,
  video_id   TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text       TEXT NOT NULL,
  provider   TEXT,  -- which model answered (assistant turns only)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_video_chat_messages_video ON video_chat_messages (video_id, created_at);
