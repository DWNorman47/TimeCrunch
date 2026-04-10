-- Add mileage tracking columns to reimbursements
ALTER TABLE reimbursements
  ADD COLUMN IF NOT EXISTS miles DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS mileage_rate DECIMAL(6,4);
