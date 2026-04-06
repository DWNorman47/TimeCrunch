-- Add unit_spec to items (display annotation for the item's primary unit)
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS unit_spec VARCHAR(100);

-- UOM definitions per item
-- factor = how many base-unit qty equals 1 of this UOM
-- e.g. base=each/factor=1, bag/"10 ct"/factor=10, box/"50 ct"/factor=50
CREATE TABLE IF NOT EXISTS inventory_item_uoms (
  id          SERIAL          PRIMARY KEY,
  company_id  UUID            NOT NULL,
  item_id     INTEGER         NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  unit        VARCHAR(50)     NOT NULL,
  unit_spec   VARCHAR(100),
  factor      DECIMAL(14,6)   NOT NULL DEFAULT 1 CHECK (factor > 0),
  is_base     BOOLEAN         NOT NULL DEFAULT false,
  active      BOOLEAN         NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inv_uoms_company ON inventory_item_uoms(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_uoms_item    ON inventory_item_uoms(item_id);
-- No two active UOMs with same unit+spec for the same item
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_uoms_item_unit_spec
  ON inventory_item_uoms(item_id, unit, COALESCE(unit_spec, ''))
  WHERE active = true;
-- At most one base UOM per item
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_uoms_one_base
  ON inventory_item_uoms(item_id)
  WHERE is_base = true AND active = true;

-- Add uom_id to stock (nullable — NULL = item's primary unit, no UOM row)
ALTER TABLE inventory_stock
  ADD COLUMN IF NOT EXISTS uom_id INTEGER REFERENCES inventory_item_uoms(id) ON DELETE RESTRICT;

-- Replace 2-column unique constraint with expression index that includes uom_id
-- COALESCE(uom_id, 0) makes NULL rows comparable (0 is never a real UOM id)
ALTER TABLE inventory_stock DROP CONSTRAINT IF EXISTS inventory_stock_item_id_location_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_stock_item_loc_uom
  ON inventory_stock(item_id, location_id, (COALESCE(uom_id, 0)));

-- Extend transactions: add UOM tracking and convert type
ALTER TABLE inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_type_check;
ALTER TABLE inventory_transactions
  ADD CONSTRAINT inventory_transactions_type_check
    CHECK (type IN ('receive','issue','transfer','adjust','convert'));

ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS uom_id      INTEGER REFERENCES inventory_item_uoms(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS to_uom_id   INTEGER REFERENCES inventory_item_uoms(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS to_quantity DECIMAL(12,4);

CREATE INDEX IF NOT EXISTS idx_inv_txn_uom    ON inventory_transactions(uom_id);
CREATE INDEX IF NOT EXISTS idx_inv_txn_to_uom ON inventory_transactions(to_uom_id);
