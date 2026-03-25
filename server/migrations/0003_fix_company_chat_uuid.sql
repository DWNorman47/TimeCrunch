-- company_chat was missed in the companies integer→UUID migration.
-- Chat messages are ephemeral so truncating is safe.
BEGIN;
TRUNCATE TABLE company_chat;
ALTER TABLE company_chat DROP COLUMN IF EXISTS company_id;
ALTER TABLE company_chat ADD COLUMN company_id UUID NOT NULL REFERENCES companies(id);
CREATE INDEX IF NOT EXISTS idx_company_chat_company_id ON company_chat(company_id);
COMMIT;
