-- Certified Payroll add-on foundation.
--
-- Adds the addon flag, per-worker and per-entry classification, and an
-- encrypted SSN last-4 column. Fringe benefits live in their own table
-- (added in a follow-up migration) to keep the user row lean.
--
-- All new columns default to nothing / unused, so existing companies see
-- zero behavior change until they purchase the addon and start filling
-- data in.

-- 1. Addon flag on companies (parallel to addon_qbo)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS addon_certified_payroll BOOLEAN NOT NULL DEFAULT false;

-- 2. Per-worker job classification (Carpenter, Electrician, Laborer, …).
--    Stored as a free-form string — wage determinations vary by jurisdiction
--    so we don't try to enforce a controlled vocabulary at the DB level.
ALTER TABLE users ADD COLUMN IF NOT EXISTS classification VARCHAR(100);

-- 3. Per-entry classification override (default is the worker's current value,
--    but a worker can occasionally work under a different classification on a
--    specific job — e.g. a journeyman apprentice day).
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS classification VARCHAR(100);

-- 4. Encrypted SSN last-4 (four digits, encrypted with the same AES-GCM key
--    the QBO refresh tokens use). Never stored in plaintext, never logged.
--    Stored as TEXT because the ciphertext format (iv:tag:data hex) is
--    variable length.
ALTER TABLE users ADD COLUMN IF NOT EXISTS ssn_last4_enc TEXT;

CREATE INDEX IF NOT EXISTS idx_users_classification ON users(company_id, classification) WHERE classification IS NOT NULL;
