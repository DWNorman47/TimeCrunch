-- Supplier / vendor directory
CREATE TABLE IF NOT EXISTS inventory_suppliers (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          VARCHAR(200) NOT NULL,
  contact_name  VARCHAR(200),
  phone         VARCHAR(50),
  email         VARCHAR(200),
  website       VARCHAR(500),
  notes         TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inv_suppliers_company ON inventory_suppliers(company_id);

-- Link transactions to a supplier (receive transactions primarily)
ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES inventory_suppliers(id);
