-- Daily-rate workers can optionally use a simplified "Mark Day Worked"
-- workflow: one tap per day, no clock-out, immediate pending entry. When
-- this flag is true, the client shows a single Mark Day button instead of
-- Clock In / Clock Out, and the server's mark-day endpoint creates a
-- finished time entry with start=end=now. Day-rate pay calc (count of
-- distinct work_date) is unaffected.
--
-- Only meaningful for rate_type='daily' workers; the client ignores it
-- for hourly workers and continues to show the normal Clock In/Out UI.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS day_mark_mode BOOLEAN NOT NULL DEFAULT false;
