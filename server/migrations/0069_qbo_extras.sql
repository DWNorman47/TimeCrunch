-- QBO sync error log for surfacing failures in the admin UI
CREATE TABLE IF NOT EXISTS qbo_sync_errors (
  id SERIAL PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,  -- 'time_entry', 'reimbursement'
  entity_id INTEGER,
  error_message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qbo_sync_errors_company ON qbo_sync_errors(company_id, created_at DESC);

-- QBO purchase tracking on reimbursements (mirrors qbo_activity_id on time_entries)
ALTER TABLE reimbursements ADD COLUMN IF NOT EXISTS qbo_purchase_id VARCHAR(50);
ALTER TABLE reimbursements ADD COLUMN IF NOT EXISTS qbo_synced_at TIMESTAMP;

-- QBO class tracking on projects (optional job-costing via QB Classes)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS qbo_class_id VARCHAR(50);
