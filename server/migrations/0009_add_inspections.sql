-- Inspection checklist templates
CREATE TABLE IF NOT EXISTS inspection_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL,  -- no FK: companies.id may be INTEGER on some environments
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  items       JSONB NOT NULL DEFAULT '[]',  -- array of { id, label, type: 'pass_fail'|'text'|'number' }
  created_by  UUID,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- Completed inspection records
CREATE TABLE IF NOT EXISTS inspections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL,  -- no FK: companies.id may be INTEGER on some environments
  template_id  UUID REFERENCES inspection_templates(id) ON DELETE SET NULL,
  project_id   UUID,           -- no FK: projects.id type may vary
  name         VARCHAR(255) NOT NULL,  -- snapshot of template name at time of inspection
  inspector    VARCHAR(255),
  location     VARCHAR(255),
  notes        TEXT,
  results      JSONB NOT NULL DEFAULT '{}',  -- { [itemId]: { value, note } }
  status       VARCHAR(20) NOT NULL DEFAULT 'pass' CHECK (status IN ('pass','fail','pending')),
  inspected_at DATE NOT NULL,
  created_by   UUID,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inspections_company ON inspections(company_id);
CREATE INDEX IF NOT EXISTS idx_inspections_project ON inspections(project_id);
CREATE INDEX IF NOT EXISTS idx_inspection_templates_company ON inspection_templates(company_id);
