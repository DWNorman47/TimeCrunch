CREATE TABLE IF NOT EXISTS inventory_stock (
  id          SERIAL         PRIMARY KEY,
  company_id  UUID           NOT NULL,
  item_id     INTEGER        NOT NULL REFERENCES inventory_items(id)     ON DELETE CASCADE,
  location_id INTEGER        NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  quantity    DECIMAL(12,4)  NOT NULL DEFAULT 0,
  updated_at  TIMESTAMP      NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_stock_company  ON inventory_stock(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_item     ON inventory_stock(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_location ON inventory_stock(location_id);
