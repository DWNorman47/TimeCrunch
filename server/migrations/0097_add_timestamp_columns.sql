-- TIMESTAMPTZ migration — Phase 1 (additive schema only, silent).
--
-- The app currently stores time_entries.start_time / end_time as plain TIME
-- (HH:MM:SS wall-clock strings) plus a separate work_date and an entry-level
-- timezone string. That representation breaks for cross-TZ shifts (worker
-- travels) and DST transitions: wall-clock subtraction produces wrong totals
-- twice a year, every year. The fix is to store the actual instant
-- (TIMESTAMPTZ) and convert to wall-clock for display.
--
-- This migration is purely additive — adds the new columns, does not
-- populate them. 0098 backfills. Both old and new columns coexist through
-- the read-site cutover (Phase 3); a later migration drops the old columns
-- once dual-write has soaked.
--
-- users.timezone is added so admin actions on a worker's behalf have a
-- canonical TZ to resolve against. Defaults are populated in 0098.

ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS start_ts TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_ts   TIMESTAMPTZ;

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS start_ts TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_ts   TIMESTAMPTZ;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50);

-- Indexes for the start-of-period queries that today scan work_date.
-- Match the existing idx_time_entries_work_date / idx_shifts_shift_date
-- usage patterns so reader cutover (Phase 3) doesn't regress query plans.
CREATE INDEX IF NOT EXISTS idx_time_entries_start_ts ON time_entries (start_ts);
CREATE INDEX IF NOT EXISTS idx_shifts_start_ts       ON shifts (start_ts);
