-- Replace varchar bin columns (added in 0040) with proper FK references
ALTER TABLE inventory_stock
  DROP COLUMN IF EXISTS area,
  DROP COLUMN IF EXISTS rack,
  DROP COLUMN IF EXISTS bay,
  DROP COLUMN IF EXISTS compartment;

ALTER TABLE inventory_stock
  ADD COLUMN IF NOT EXISTS area_id        INT REFERENCES inventory_areas(id)        ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rack_id        INT REFERENCES inventory_racks(id)         ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bay_id         INT REFERENCES inventory_bays(id)          ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS compartment_id INT REFERENCES inventory_compartments(id)  ON DELETE SET NULL;
