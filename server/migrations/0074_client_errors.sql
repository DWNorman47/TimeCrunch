-- Client-side error reports from React ErrorBoundary and global handlers.
-- Unauthenticated submissions are allowed (errors can happen before/during auth),
-- so company_id and user_id are nullable.

CREATE TABLE IF NOT EXISTS client_errors (
  id           BIGSERIAL PRIMARY KEY,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  company_id   UUID,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind         VARCHAR(32) NOT NULL,        -- 'render', 'unhandled', 'rejection', 'console'
  message      TEXT NOT NULL,
  stack        TEXT,
  url          TEXT,                        -- window.location.href at time of error
  user_agent   TEXT,
  app_version  VARCHAR(64),
  ip           INET
);

-- Fast "what blew up in the last 24h" queries.
CREATE INDEX IF NOT EXISTS idx_client_errors_created_at ON client_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_company_created ON client_errors (company_id, created_at DESC);
