CREATE TABLE IF NOT EXISTS inventory_locations (
  id          SERIAL        PRIMARY KEY,
  company_id  UUID          NOT NULL,
  name        VARCHAR(255)  NOT NULL,
  type        VARCHAR(50)   NOT NULL DEFAULT 'warehouse',
  project_id  INTEGER       REFERENCES projects(id) ON DELETE SET NULL,
  notes       TEXT,
  active      BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_locations_company ON inventory_locations(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_locations_project ON inventory_locations(project_id);
