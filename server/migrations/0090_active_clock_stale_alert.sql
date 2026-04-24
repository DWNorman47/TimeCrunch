-- Track when admins were alerted about a stale active_clock row so the
-- hourly sweep doesn't re-notify on every run. NULL = not yet alerted.
-- When the worker eventually clocks out, the row is deleted normally,
-- which discards this column too.

ALTER TABLE active_clock
  ADD COLUMN IF NOT EXISTS stale_alert_sent_at TIMESTAMPTZ;
