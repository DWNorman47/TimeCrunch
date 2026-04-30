-- Add CHECK constraints to the remaining app-only enum columns. Each
-- column has had hardcoded validation in the route layer for a while;
-- this is just the unbypassable backstop so a raw INSERT, future
-- endpoint, migration, or psql session can't write garbage.
--
-- Each block is the same shape: drop any pre-existing CHECK (idempotent
-- replay safety), normalise rows that would violate the new constraint,
-- then add the CHECK. Normalisation chooses a sensible default per
-- column — the actual canonical sets live in `server/constants/` and
-- in `docs/db-enums.md`.
--
-- Skipped intentionally:
--   companies.subscription_status — Stripe webhook (`stripe.js:180`)
--     writes obj.status from Stripe, which can include values our app
--     doesn't model (`incomplete`, `unpaid`, `paused`, etc.). Adding a
--     CHECK without first writing a Stripe-status → app-status mapper
--     would 500 the webhook on edge-case events. Tracked as a follow-up.
--   companies.plan — driven by Stripe price IDs through planFromPrice().
--     If a future Stripe price ID isn't in the map, plan ends up
--     undefined. Same risk as subscription_status; deferred.
--   inbox.type — open-ended in current code; the doc lists ~19 distinct
--     values. Needs centralisation refactor (single createInboxItem
--     wrapper that imports a constants array) before a CHECK is safe.
--   inventory_items.locations[].type — JSON-shaped column; CHECKs on
--     JSON contents are awkward and brittle.

-- ── projects.status ────────────────────────────────────────────────────────
-- Caused the original `status='active'` bug fixed in 0099. This is the
-- backstop the doc has been begging for.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS chk_projects_status;
UPDATE projects SET status = 'in_progress'
  WHERE status IS NOT NULL
    AND status NOT IN ('planning', 'in_progress', 'on_hold', 'completed');
ALTER TABLE projects
  ADD CONSTRAINT chk_projects_status
  CHECK (status IS NULL OR status IN ('planning', 'in_progress', 'on_hold', 'completed'));

-- ── incident_reports.type ──────────────────────────────────────────────────
-- Safety / OSHA-style metric. Validation in incidents.js:7.
ALTER TABLE incident_reports DROP CONSTRAINT IF EXISTS chk_incident_reports_type;
UPDATE incident_reports SET type = 'other'
  WHERE type NOT IN ('near_miss', 'first_aid', 'recordable', 'lost_time', 'property_damage', 'other');
ALTER TABLE incident_reports
  ADD CONSTRAINT chk_incident_reports_type
  CHECK (type IN ('near_miss', 'first_aid', 'recordable', 'lost_time', 'property_damage', 'other'));

-- ── punchlist_items.status / priority ──────────────────────────────────────
ALTER TABLE punchlist_items DROP CONSTRAINT IF EXISTS chk_punchlist_status;
UPDATE punchlist_items SET status = 'open'
  WHERE status NOT IN ('open', 'in_progress', 'resolved', 'verified');
ALTER TABLE punchlist_items
  ADD CONSTRAINT chk_punchlist_status
  CHECK (status IN ('open', 'in_progress', 'resolved', 'verified'));

ALTER TABLE punchlist_items DROP CONSTRAINT IF EXISTS chk_punchlist_priority;
UPDATE punchlist_items SET priority = 'normal'
  WHERE priority NOT IN ('low', 'normal', 'high', 'urgent');
ALTER TABLE punchlist_items
  ADD CONSTRAINT chk_punchlist_priority
  CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

-- ── service_requests.status ────────────────────────────────────────────────
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS chk_service_requests_status;
UPDATE service_requests SET status = 'new'
  WHERE status NOT IN ('new', 'in_review', 'converted', 'declined', 'spam');
ALTER TABLE service_requests
  ADD CONSTRAINT chk_service_requests_status
  CHECK (status IN ('new', 'in_review', 'converted', 'declined', 'spam'));

-- ── users.rate_type ────────────────────────────────────────────────────────
-- Drives daily-rate pay calc + the day-mark feature gate.
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_rate_type;
UPDATE users SET rate_type = 'hourly'
  WHERE rate_type NOT IN ('hourly', 'daily');
ALTER TABLE users
  ADD CONSTRAINT chk_users_rate_type
  CHECK (rate_type IN ('hourly', 'daily'));

-- ── users.overtime_rule ────────────────────────────────────────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_overtime_rule;
UPDATE users SET overtime_rule = 'daily'
  WHERE overtime_rule NOT IN ('daily', 'weekly', 'none');
ALTER TABLE users
  ADD CONSTRAINT chk_users_overtime_rule
  CHECK (overtime_rule IN ('daily', 'weekly', 'none'));

-- ── users.language ─────────────────────────────────────────────────────────
-- Stored as full names ('English', 'Spanish'), not ISO codes — keep in sync
-- with the i18n top-level keys in client/src/i18n.js.
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_language;
UPDATE users SET language = 'English'
  WHERE language NOT IN ('English', 'Spanish');
ALTER TABLE users
  ADD CONSTRAINT chk_users_language
  CHECK (language IN ('English', 'Spanish'));

-- ── inventory_cycle_counts.count_type ──────────────────────────────────────
ALTER TABLE inventory_cycle_counts DROP CONSTRAINT IF EXISTS chk_inv_cc_count_type;
UPDATE inventory_cycle_counts SET count_type = 'cycle'
  WHERE count_type NOT IN ('cycle', 'full', 'audit', 'reconcile');
ALTER TABLE inventory_cycle_counts
  ADD CONSTRAINT chk_inv_cc_count_type
  CHECK (count_type IN ('cycle', 'full', 'audit', 'reconcile'));
