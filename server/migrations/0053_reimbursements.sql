CREATE TABLE IF NOT EXISTS reimbursements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount        DECIMAL(10,2) NOT NULL,
  description   TEXT NOT NULL,
  category      VARCHAR(100),
  expense_date  DATE NOT NULL,
  receipt_url   TEXT,
  receipt_size_bytes BIGINT,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, approved, rejected
  admin_notes   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reimbursements_company ON reimbursements(company_id);
CREATE INDEX IF NOT EXISTS idx_reimbursements_user ON reimbursements(user_id);
CREATE INDEX IF NOT EXISTS idx_reimbursements_status ON reimbursements(company_id, status);
