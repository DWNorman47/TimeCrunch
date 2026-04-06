CREATE TABLE IF NOT EXISTS inventory_transactions (
  id               SERIAL         PRIMARY KEY,
  company_id       UUID           NOT NULL,
  type             VARCHAR(20)    NOT NULL CHECK (type IN ('receive','issue','transfer','adjust')),
  item_id          INTEGER        NOT NULL REFERENCES inventory_items(id)      ON DELETE RESTRICT,
  quantity         DECIMAL(12,4)  NOT NULL,
  from_location_id INTEGER        REFERENCES inventory_locations(id) ON DELETE RESTRICT,
  to_location_id   INTEGER        REFERENCES inventory_locations(id) ON DELETE RESTRICT,
  project_id       INTEGER        REFERENCES projects(id)            ON DELETE SET NULL,
  performed_by     INTEGER        NOT NULL REFERENCES users(id)      ON DELETE RESTRICT,
  notes            TEXT,
  reference_no     VARCHAR(100),
  unit_cost        DECIMAL(12,4),
  created_at       TIMESTAMP      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_txn_company  ON inventory_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_txn_item     ON inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_txn_from_loc ON inventory_transactions(from_location_id);
CREATE INDEX IF NOT EXISTS idx_inv_txn_to_loc   ON inventory_transactions(to_location_id);
CREATE INDEX IF NOT EXISTS idx_inv_txn_project  ON inventory_transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_inv_txn_created  ON inventory_transactions(created_at DESC);
