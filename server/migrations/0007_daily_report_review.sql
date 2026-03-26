-- Admin review/sign-off on daily reports
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS reviewed_by  VARCHAR(255);
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS reviewed_at  TIMESTAMP;
