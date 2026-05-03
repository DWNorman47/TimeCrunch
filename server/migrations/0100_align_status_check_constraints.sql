-- Align three CHECK constraints with the values the route code actually uses.
--
-- Migration 0071 added CHECKs based on what the workflow looked like at the
-- time. Since then, three of those workflows grew an additional state, and
-- the constraint never followed. Today the route code accepts a value the
-- DB rejects, so the corresponding admin actions all 500 at the DB layer:
--
--   daily_reports.status:    code expects 'reviewed', 0071 froze 'approved'
--   field_reports.status:    code allows 'draft',     0071 omitted it
--   incident_reports.status: code uses 'under_review', 0071 omitted it
--
-- Each block:
--   1. Drops the existing CHECK.
--   2. Normalizes any rows that are about to violate the new CHECK
--      (defensive — these values shouldn't exist post-0071, but worth doing
--      so a partial / dirty DB doesn't break the migration).
--   3. Re-adds the CHECK with the values the code actually uses today.
--
-- Idempotent: DROP IF EXISTS, and the UPDATEs no-op if all rows already
-- match.

-- ── daily_reports.status ────────────────────────────────────────────────────
-- The column 'reviewed_at' / 'reviewed_by' indicate the canonical name is
-- 'reviewed'. If any row got stamped 'approved' under the old constraint,
-- migrate it to 'reviewed' before re-constraining.
ALTER TABLE daily_reports DROP CONSTRAINT IF EXISTS chk_daily_reports_status;
UPDATE daily_reports SET status = 'reviewed' WHERE status = 'approved';
UPDATE daily_reports SET status = 'draft' WHERE status NOT IN ('draft', 'submitted', 'reviewed');
ALTER TABLE daily_reports
  ADD CONSTRAINT chk_daily_reports_status
  CHECK (status IN ('draft', 'submitted', 'reviewed'));

-- ── field_reports.status ────────────────────────────────────────────────────
-- 'draft' is a legitimate state — the route accepts it on create. The 0071
-- constraint blocked it, so any draft creation has been failing.
ALTER TABLE field_reports DROP CONSTRAINT IF EXISTS chk_field_reports_status;
UPDATE field_reports SET status = 'submitted' WHERE status NOT IN ('draft', 'submitted', 'reviewed');
ALTER TABLE field_reports
  ADD CONSTRAINT chk_field_reports_status
  CHECK (status IN ('draft', 'submitted', 'reviewed'));

-- ── incident_reports.status ─────────────────────────────────────────────────
-- The workflow has three states (open → under_review → closed). 0071 only
-- allowed the two endpoints; transitions to under_review have been failing.
ALTER TABLE incident_reports DROP CONSTRAINT IF EXISTS chk_incident_reports_status;
UPDATE incident_reports SET status = 'open' WHERE status NOT IN ('open', 'under_review', 'closed');
ALTER TABLE incident_reports
  ADD CONSTRAINT chk_incident_reports_status
  CHECK (status IN ('open', 'under_review', 'closed'));
