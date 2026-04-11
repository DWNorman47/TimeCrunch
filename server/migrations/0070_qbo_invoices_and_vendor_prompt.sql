-- Track QBO invoices pushed from ProjectsPage
CREATE TABLE IF NOT EXISTS project_invoices (
  id            SERIAL PRIMARY KEY,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id    INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  qbo_invoice_id VARCHAR(50) NOT NULL,
  doc_number    VARCHAR(100),
  amount        NUMERIC(12,2),
  txn_date      DATE,
  balance       NUMERIC(12,2),
  payment_status VARCHAR(20) DEFAULT 'unknown',
  created_at    TIMESTAMP DEFAULT NOW(),
  last_checked_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_invoices_company ON project_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_project_invoices_project ON project_invoices(project_id);
