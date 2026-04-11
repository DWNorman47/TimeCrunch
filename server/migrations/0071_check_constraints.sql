-- Add CHECK constraints to status/type columns that were previously unconstrained.
-- These columns already have app-level validation; this adds DB-level enforcement
-- so that bugs or direct SQL access cannot write invalid values.

-- reimbursements.status (values used: pending, approved, rejected)
ALTER TABLE reimbursements
  ADD CONSTRAINT chk_reimbursements_status
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- time_off_requests.status (values used: pending, approved, denied)
ALTER TABLE time_off_requests
  ADD CONSTRAINT chk_time_off_status
  CHECK (status IN ('pending', 'approved', 'denied'));

-- time_off_requests.type (values used: vacation, sick, personal, other)
ALTER TABLE time_off_requests
  ADD CONSTRAINT chk_time_off_type
  CHECK (type IN ('vacation', 'sick', 'personal', 'other'));

-- users.worker_type (values used: employee, contractor, subcontractor, owner)
ALTER TABLE users
  ADD CONSTRAINT chk_users_worker_type
  CHECK (worker_type IN ('employee', 'contractor', 'subcontractor', 'owner'));

-- active_clock.clock_source and time_entries.clock_source (values used: worker, admin)
ALTER TABLE active_clock
  ADD CONSTRAINT chk_active_clock_source
  CHECK (clock_source IN ('worker', 'admin'));

ALTER TABLE time_entries
  ADD CONSTRAINT chk_time_entries_clock_source
  CHECK (clock_source IN ('worker', 'admin'));

-- field_reports.status (values used: submitted, reviewed)
ALTER TABLE field_reports
  ADD CONSTRAINT chk_field_reports_status
  CHECK (status IN ('submitted', 'reviewed'));

-- daily_reports.status (values used: draft, submitted, approved)
ALTER TABLE daily_reports
  ADD CONSTRAINT chk_daily_reports_status
  CHECK (status IN ('draft', 'submitted', 'approved'));

-- incident_reports.status (values used: open, closed)
ALTER TABLE incident_reports
  ADD CONSTRAINT chk_incident_reports_status
  CHECK (status IN ('open', 'closed'));

-- rfis.status (values used: open, answered, closed)
ALTER TABLE rfis
  ADD CONSTRAINT chk_rfis_status
  CHECK (status IN ('open', 'answered', 'closed'));

-- qbo_sync_errors.entity_type (values used: time_entry, reimbursement)
ALTER TABLE qbo_sync_errors
  ADD CONSTRAINT chk_qbo_sync_errors_entity_type
  CHECK (entity_type IN ('time_entry', 'reimbursement'));

-- project_invoices.payment_status (values used: unknown, paid, partial, unpaid)
ALTER TABLE project_invoices
  ADD CONSTRAINT chk_project_invoices_payment_status
  CHECK (payment_status IN ('unknown', 'paid', 'partial', 'unpaid'));
