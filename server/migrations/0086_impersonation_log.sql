-- Record every super_admin "Login as" action so we have a forensic trail
-- when a customer asks "did someone log in as me?" Tokens issued without
-- this log row were effectively silent — bad for audit, bad for trust.

CREATE TABLE IF NOT EXISTS impersonation_log (
  id               SERIAL PRIMARY KEY,
  super_admin_id   INTEGER       NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  super_admin_name VARCHAR(255),
  target_user_id   INTEGER       NOT NULL,
  target_user_name VARCHAR(255),
  target_role      VARCHAR(20),
  company_id       UUID          NOT NULL,
  company_name     VARCHAR(255),
  ip               VARCHAR(64),
  user_agent       TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_impersonation_log_created ON impersonation_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_impersonation_log_target ON impersonation_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_log_company ON impersonation_log(company_id);
