-- Add CHECK constraints to status/type columns that were previously unconstrained.
-- These columns already have app-level validation; this adds DB-level enforcement
-- so that bugs or direct SQL access cannot write invalid values.
--
-- Each block is idempotent: DROP … IF EXISTS before re-adding, so a partial
-- previous run (where some statements committed before a later one failed) does
-- not cause "constraint already exists" errors on retry.
-- Data normalisation UPDATEs run first so no existing row violates the constraint.

-- reimbursements.status
ALTER TABLE reimbursements DROP CONSTRAINT IF EXISTS chk_reimbursements_status;
UPDATE reimbursements SET status = 'pending' WHERE status NOT IN ('pending', 'approved', 'rejected');
ALTER TABLE reimbursements
  ADD CONSTRAINT chk_reimbursements_status
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- time_off_requests.status
ALTER TABLE time_off_requests DROP CONSTRAINT IF EXISTS chk_time_off_status;
UPDATE time_off_requests SET status = 'pending' WHERE status NOT IN ('pending', 'approved', 'denied');
ALTER TABLE time_off_requests
  ADD CONSTRAINT chk_time_off_status
  CHECK (status IN ('pending', 'approved', 'denied'));

-- time_off_requests.type
ALTER TABLE time_off_requests DROP CONSTRAINT IF EXISTS chk_time_off_type;
UPDATE time_off_requests SET type = 'other' WHERE type NOT IN ('vacation', 'sick', 'personal', 'other');
ALTER TABLE time_off_requests
  ADD CONSTRAINT chk_time_off_type
  CHECK (type IN ('vacation', 'sick', 'personal', 'other'));

-- users.worker_type
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_worker_type;
UPDATE users SET worker_type = 'employee' WHERE worker_type IS NOT NULL AND worker_type NOT IN ('employee', 'contractor', 'subcontractor', 'owner');
ALTER TABLE users
  ADD CONSTRAINT chk_users_worker_type
  CHECK (worker_type IN ('employee', 'contractor', 'subcontractor', 'owner'));

-- active_clock.clock_source
ALTER TABLE active_clock DROP CONSTRAINT IF EXISTS chk_active_clock_source;
UPDATE active_clock SET clock_source = 'worker' WHERE clock_source NOT IN ('worker', 'admin');
ALTER TABLE active_clock
  ADD CONSTRAINT chk_active_clock_source
  CHECK (clock_source IN ('worker', 'admin'));

-- time_entries.clock_source
ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS chk_time_entries_clock_source;
UPDATE time_entries SET clock_source = 'worker' WHERE clock_source NOT IN ('worker', 'admin');
ALTER TABLE time_entries
  ADD CONSTRAINT chk_time_entries_clock_source
  CHECK (clock_source IN ('worker', 'admin'));

-- field_reports.status
ALTER TABLE field_reports DROP CONSTRAINT IF EXISTS chk_field_reports_status;
UPDATE field_reports SET status = 'submitted' WHERE status NOT IN ('submitted', 'reviewed');
ALTER TABLE field_reports
  ADD CONSTRAINT chk_field_reports_status
  CHECK (status IN ('submitted', 'reviewed'));

-- daily_reports.status
ALTER TABLE daily_reports DROP CONSTRAINT IF EXISTS chk_daily_reports_status;
UPDATE daily_reports SET status = 'draft' WHERE status NOT IN ('draft', 'submitted', 'approved');
ALTER TABLE daily_reports
  ADD CONSTRAINT chk_daily_reports_status
  CHECK (status IN ('draft', 'submitted', 'approved'));

-- incident_reports.status
ALTER TABLE incident_reports DROP CONSTRAINT IF EXISTS chk_incident_reports_status;
UPDATE incident_reports SET status = 'open' WHERE status NOT IN ('open', 'closed');
ALTER TABLE incident_reports
  ADD CONSTRAINT chk_incident_reports_status
  CHECK (status IN ('open', 'closed'));

-- rfis.status
ALTER TABLE rfis DROP CONSTRAINT IF EXISTS chk_rfis_status;
UPDATE rfis SET status = 'open' WHERE status NOT IN ('open', 'answered', 'closed');
ALTER TABLE rfis
  ADD CONSTRAINT chk_rfis_status
  CHECK (status IN ('open', 'answered', 'closed'));

-- qbo_sync_errors.entity_type
ALTER TABLE qbo_sync_errors DROP CONSTRAINT IF EXISTS chk_qbo_sync_errors_entity_type;
UPDATE qbo_sync_errors SET entity_type = 'time_entry' WHERE entity_type NOT IN ('time_entry', 'reimbursement');
ALTER TABLE qbo_sync_errors
  ADD CONSTRAINT chk_qbo_sync_errors_entity_type
  CHECK (entity_type IN ('time_entry', 'reimbursement'));

-- project_invoices.payment_status
ALTER TABLE project_invoices DROP CONSTRAINT IF EXISTS chk_project_invoices_payment_status;
UPDATE project_invoices SET payment_status = 'unknown' WHERE payment_status NOT IN ('unknown', 'paid', 'partial', 'unpaid');
ALTER TABLE project_invoices
  ADD CONSTRAINT chk_project_invoices_payment_status
  CHECK (payment_status IN ('unknown', 'paid', 'partial', 'unpaid'));
