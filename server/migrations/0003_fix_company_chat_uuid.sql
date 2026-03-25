-- company_chat was missed in the companies integer→UUID migration.
-- Chat messages are ephemeral (short retention) so dropping and recreating is safe.
-- No FK on company_id to avoid type-mismatch failures on environments where
-- companies.id may still be INTEGER from before the UUID migration.
DROP TABLE IF EXISTS company_chat;
CREATE TABLE company_chat (
  id         SERIAL PRIMARY KEY,
  company_id UUID         NOT NULL,
  sender_id  INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  worker_id  INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT         NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_company_chat_company_id ON company_chat(company_id);
