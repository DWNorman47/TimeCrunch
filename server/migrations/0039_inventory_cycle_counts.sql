CREATE TABLE IF NOT EXISTS inventory_cycle_counts (
  id           SERIAL      PRIMARY KEY,
  company_id   UUID        NOT NULL,
  location_id  INTEGER     NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
  status       VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_progress','completed')),
  started_by   INTEGER     NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  completed_by INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  started_at   TIMESTAMP   NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  notes        TEXT
);

CREATE INDEX IF NOT EXISTS idx_inv_cc_company  ON inventory_cycle_counts(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_cc_location ON inventory_cycle_counts(location_id);

CREATE TABLE IF NOT EXISTS inventory_cycle_count_lines (
  id             SERIAL         PRIMARY KEY,
  cycle_count_id INTEGER        NOT NULL REFERENCES inventory_cycle_counts(id) ON DELETE CASCADE,
  item_id        INTEGER        NOT NULL REFERENCES inventory_items(id)         ON DELETE RESTRICT,
  expected_qty   DECIMAL(12,4)  NOT NULL,
  counted_qty    DECIMAL(12,4),
  variance       DECIMAL(12,4)  GENERATED ALWAYS AS (counted_qty - expected_qty) STORED,
  counted_by     INTEGER        REFERENCES users(id) ON DELETE SET NULL,
  counted_at     TIMESTAMP,
  notes          TEXT
);

CREATE INDEX IF NOT EXISTS idx_inv_ccl_count ON inventory_cycle_count_lines(cycle_count_id);
CREATE INDEX IF NOT EXISTS idx_inv_ccl_item  ON inventory_cycle_count_lines(item_id);
