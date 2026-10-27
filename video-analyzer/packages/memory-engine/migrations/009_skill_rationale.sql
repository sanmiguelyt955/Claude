-- ─────────────────────────────────────────────────────────────────────────
-- 009_skill_rationale — why detection judged a stretch a reusable process.
-- It was dropped between detection and generation, so the SKILL.md prompt
-- only got "Detectado entre los segundos 4 y 51".
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE skills ADD COLUMN rationale TEXT;
