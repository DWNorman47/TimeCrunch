-- Composite indexes for high-cardinality inventory queries at scale.
-- All use IF NOT EXISTS so they are safe to re-run.

-- inventory_stock: filtering by company+item together (low-stock alert aggregation)
CREATE INDEX IF NOT EXISTS idx_inv_stock_company_item
  ON inventory_stock(company_id, item_id);

-- inventory_stock: filtering by company+location together (stock listing by location)
CREATE INDEX IF NOT EXISTS idx_inv_stock_company_location
  ON inventory_stock(company_id, location_id);

-- inventory_transactions: most list queries filter company AND order by created_at DESC
CREATE INDEX IF NOT EXISTS idx_inv_txn_company_created
  ON inventory_transactions(company_id, created_at DESC);

-- purchase_orders: list endpoint filters company+status, orders by created_at DESC
CREATE INDEX IF NOT EXISTS idx_po_company_status
  ON purchase_orders(company_id, status);

CREATE INDEX IF NOT EXISTS idx_po_company_created
  ON purchase_orders(company_id, created_at DESC);

-- purchase_order_lines: item_id join is common (receiving, valuation lookups)
CREATE INDEX IF NOT EXISTS idx_pol_item
  ON purchase_order_lines(item_id);

-- inventory_cycle_counts: list queries filter company+status and order by started_at DESC
CREATE INDEX IF NOT EXISTS idx_inv_cc_company_status
  ON inventory_cycle_counts(company_id, status);

CREATE INDEX IF NOT EXISTS idx_inv_cc_company_started
  ON inventory_cycle_counts(company_id, started_at DESC);

-- inventory_items: active filter is on almost every query; composite avoids re-checking company
CREATE INDEX IF NOT EXISTS idx_inv_items_company_active
  ON inventory_items(company_id, active);
