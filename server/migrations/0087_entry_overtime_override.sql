-- Admin override for overtime hours on a specific time entry.
-- NULL = use the normal rule (daily/weekly threshold). When set, this many
-- hours of the entry count as OT, and the remainder counts as regular.
-- Useful when a worker's entry legitimately spans an OT boundary but the
-- admin knows part of it was travel/setup/etc that shouldn't qualify.

ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS overtime_hours_override DECIMAL(6,2);
