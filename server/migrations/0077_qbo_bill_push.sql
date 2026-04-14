-- 0077_qbo_bill_push.sql
-- Tracks which time entries and reimbursements were pushed to QBO as part of a
-- contractor Bill. Separate from qbo_activity_id / qbo_purchase_id so we can tell
-- which push mechanism the row went through.

ALTER TABLE time_entries   ADD COLUMN IF NOT EXISTS qbo_bill_id VARCHAR(50);
ALTER TABLE reimbursements ADD COLUMN IF NOT EXISTS qbo_bill_id VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_time_entries_qbo_bill_id   ON time_entries(qbo_bill_id)   WHERE qbo_bill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reimbursements_qbo_bill_id ON reimbursements(qbo_bill_id) WHERE qbo_bill_id IS NOT NULL;
