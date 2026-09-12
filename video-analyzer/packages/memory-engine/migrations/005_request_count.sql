-- ─────────────────────────────────────────────────────────────────────────
-- 005_request_count — batching several videos into ONE Gemini call means one
-- job produces several analysis_runs rows but spends a single request against
-- the daily quota. Counting rows would over-report usage and make the app
-- refuse work it still has budget for, so each row now carries how many real
-- API requests it represents: 1 for the row that owns the call, 0 for the
-- other videos that rode along in the same request.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE analysis_runs ADD COLUMN request_count INTEGER NOT NULL DEFAULT 1;
