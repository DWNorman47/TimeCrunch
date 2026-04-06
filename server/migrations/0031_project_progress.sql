-- Manual progress percentage (0–100) for at-a-glance completion status
ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress_pct SMALLINT CHECK (progress_pct >= 0 AND progress_pct <= 100);
