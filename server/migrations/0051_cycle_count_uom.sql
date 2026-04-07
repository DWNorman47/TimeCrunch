-- Add UOM tracking to cycle count lines.
-- stock_uom_id  = the UOM the stock is held in (snapshotted at count creation)
-- counted_uom_id = the UOM the counter chose when entering their physical count
-- variance is always stored in stock_uom units so the complete step can apply it directly.
ALTER TABLE inventory_cycle_count_lines
  ADD COLUMN IF NOT EXISTS stock_uom_id  INTEGER REFERENCES inventory_item_uoms(id),
  ADD COLUMN IF NOT EXISTS counted_uom_id INTEGER REFERENCES inventory_item_uoms(id);
