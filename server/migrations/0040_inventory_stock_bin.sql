-- Add bin location fields to inventory_stock
ALTER TABLE inventory_stock
  ADD COLUMN IF NOT EXISTS area        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bay         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS compartment VARCHAR(100),
  ADD COLUMN IF NOT EXISTS rack        VARCHAR(100);
