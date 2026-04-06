-- Track highest budget threshold already alerted (90 or 100) to avoid duplicate emails
-- NULL = no alert sent yet
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_alert_pct SMALLINT;
