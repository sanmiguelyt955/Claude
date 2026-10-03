-- ─────────────────────────────────────────────────────────────────────────
-- 006_protocol_record — the complete record produced under an analysis
-- protocol (V6.0 Protocolo Maestro), as one Markdown document in the
-- protocol's own section order. scenes/transcript/elements keep feeding the
-- UI and search; this column is what gets exported to the Obsidian vault.
-- NULL for videos analyzed before the protocol existed.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE video_summaries ADD COLUMN protocol_version TEXT;
ALTER TABLE video_summaries ADD COLUMN protocol_record_md TEXT;
