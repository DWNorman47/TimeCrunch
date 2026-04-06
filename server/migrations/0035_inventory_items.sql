CREATE TABLE IF NOT EXISTS inventory_items (
  id             SERIAL        PRIMARY KEY,
  company_id     UUID          NOT NULL,
  name           VARCHAR(255)  NOT NULL,
  sku            VARCHAR(100),
  description    TEXT,
  category       VARCHAR(100),
  unit           VARCHAR(50)   NOT NULL DEFAULT 'each',
  unit_cost      DECIMAL(12,4),
  reorder_point  INTEGER       NOT NULL DEFAULT 0,
  reorder_qty    INTEGER       NOT NULL DEFAULT 0,
  active         BOOLEAN       NOT NULL DEFAULT true,
  created_by     INTEGER       REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_items_company ON inventory_items(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_items_sku ON inventory_items(company_id, sku)
  WHERE sku IS NOT NULL AND sku <> '';
