-- Add bin location fields to inventory_stock
ALTER TABLE inventory_stock
  ADD COLUMN area        VARCHAR(100),
  ADD COLUMN bay         VARCHAR(100),
  ADD COLUMN compartment VARCHAR(100),
  ADD COLUMN rack        VARCHAR(100);
