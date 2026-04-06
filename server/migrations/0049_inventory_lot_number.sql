-- Lot / batch tracking on transactions
ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS lot_number VARCHAR(100);
