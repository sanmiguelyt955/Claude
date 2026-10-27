-- ─────────────────────────────────────────────────────────────────────────
-- 008_video_folder — folders to organise the library (memories.ai has them).
-- A folder is just a name on the video: NULL means "sin carpeta". No folder
-- table, so a folder exists while some video is in it.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE videos ADD COLUMN folder TEXT;

CREATE INDEX idx_videos_folder ON videos (folder);
