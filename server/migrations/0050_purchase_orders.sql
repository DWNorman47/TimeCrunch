-- Purchase orders header
CREATE TABLE IF NOT EXISTS purchase_orders (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  po_number       VARCHAR(50) NOT NULL,
  supplier_id     INTEGER REFERENCES inventory_suppliers(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'draft'
    CONSTRAINT po_status_check CHECK (status IN ('draft', 'submitted', 'partial', 'received', 'cancelled')),
  order_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date   DATE,
  to_location_id  INTEGER REFERENCES inventory_locations(id),
  notes           TEXT,
  reference_no    VARCHAR(100),
  created_by      INTEGER NOT NULL REFERENCES users(id),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  submitted_at    TIMESTAMP,
  received_at     TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_po_company ON purchase_orders(company_id);

-- Purchase order line items
CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id              SERIAL PRIMARY KEY,
  po_id           INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id         INTEGER NOT NULL REFERENCES inventory_items(id),
  qty_ordered     DECIMAL(12,4) NOT NULL,
  qty_received    DECIMAL(12,4) NOT NULL DEFAULT 0,
  unit_cost       DECIMAL(12,4),
  uom_id          INTEGER REFERENCES inventory_item_uoms(id),
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_pol_po ON purchase_order_lines(po_id);
