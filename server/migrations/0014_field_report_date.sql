-- Add report_date (local date set by client) to avoid UTC/local-timezone mismatches
-- when filtering field reports by date.

ALTER TABLE field_reports
  ADD COLUMN IF NOT EXISTS report_date DATE;

-- Backfill historical records from UTC reported_at (close enough for old data)
UPDATE field_reports
SET report_date = reported_at::date
WHERE report_date IS NULL;
