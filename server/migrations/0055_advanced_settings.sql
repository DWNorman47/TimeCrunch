CREATE TABLE IF NOT EXISTS advanced_settings (
  company_id UUID NOT NULL,
  key        VARCHAR(100) NOT NULL,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, key)
);
