-- Equipment registry and hours log
CREATE TABLE IF NOT EXISTS equipment_items (
  id                        SERIAL PRIMARY KEY,
  company_id                UUID         NOT NULL,  -- no FK: companies.id may be INTEGER on some environments
  name                      VARCHAR(255) NOT NULL,
  type                      VARCHAR(100),
  unit_number               VARCHAR(100),
  maintenance_interval_hours INTEGER,
  notes                     TEXT,
  active                    BOOLEAN      NOT NULL DEFAULT true,
  created_at                TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_equipment_items_company_id ON equipment_items (company_id);

CREATE TABLE IF NOT EXISTS equipment_hours (
  id            SERIAL PRIMARY KEY,
  equipment_id  INTEGER      NOT NULL REFERENCES equipment_items(id) ON DELETE CASCADE,
  company_id    UUID         NOT NULL,  -- no FK: same reason
  project_id    INTEGER      REFERENCES projects(id) ON DELETE SET NULL,
  log_date      DATE         NOT NULL,
  hours         DECIMAL(6,2) NOT NULL,
  operator_name VARCHAR(255),
  notes         TEXT,
  created_by    INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_equipment_hours_equipment_id ON equipment_hours (equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_hours_company_id  ON equipment_hours (company_id);

-- RFI (Request for Information) tracking
CREATE TABLE IF NOT EXISTS rfis (
  id            SERIAL PRIMARY KEY,
  company_id    UUID         NOT NULL,  -- no FK: same reason
  project_id    INTEGER      REFERENCES projects(id) ON DELETE SET NULL,
  rfi_number    INTEGER      NOT NULL,
  subject       VARCHAR(500) NOT NULL,
  description   TEXT,
  directed_to   VARCHAR(255),
  submitted_by  VARCHAR(255),
  date_submitted DATE        NOT NULL,
  date_due      DATE,
  response      TEXT,
  status        VARCHAR(20)  NOT NULL DEFAULT 'open',  -- open | answered | closed
  created_by    INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rfis_company_number ON rfis (company_id, rfi_number);
CREATE INDEX IF NOT EXISTS idx_rfis_company_id ON rfis (company_id);
