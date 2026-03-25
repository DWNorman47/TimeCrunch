-- Add registration_ip to companies for trial abuse detection
ALTER TABLE companies ADD COLUMN IF NOT EXISTS registration_ip VARCHAR(45);
CREATE INDEX IF NOT EXISTS idx_companies_registration_ip ON companies (registration_ip);
