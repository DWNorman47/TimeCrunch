-- Replace varchar bin columns (added in 0040) with proper FK references
ALTER TABLE inventory_stock
  DROP COLUMN IF EXISTS area,
  DROP COLUMN IF EXISTS rack,
  DROP COLUMN IF EXISTS bay,
  DROP COLUMN IF EXISTS compartment;

ALTER TABLE inventory_stock
  ADD COLUMN area_id        INT REFERENCES inventory_areas(id)        ON DELETE SET NULL,
  ADD COLUMN rack_id        INT REFERENCES inventory_racks(id)         ON DELETE SET NULL,
  ADD COLUMN bay_id         INT REFERENCES inventory_bays(id)          ON DELETE SET NULL,
  ADD COLUMN compartment_id INT REFERENCES inventory_compartments(id)  ON DELETE SET NULL;
