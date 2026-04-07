-- Per-worker weekly minimum hour guarantee for invoicing.
-- NULL = no guarantee. A positive value (e.g. 40) means the worker's invoice
-- will include a shortfall line item if their actual hours fall below this amount
-- per week (scaled proportionally for multi-week billing periods).
ALTER TABLE users ADD COLUMN IF NOT EXISTS guaranteed_weekly_hours DECIMAL(5,2) DEFAULT NULL;
