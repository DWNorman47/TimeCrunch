CREATE TABLE IF NOT EXISTS safety_checklist_templates (
  id SERIAL PRIMARY KEY,
  company_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  -- items: [{label, type: 'check'|'text', required: boolean}]
  items JSONB NOT NULL DEFAULT '[]',
  -- scope hook for future: 'general' | 'project' | 'equipment'
  scope VARCHAR(50) NOT NULL DEFAULT 'general',
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safety_checklist_submissions (
  id SERIAL PRIMARY KEY,
  company_id UUID NOT NULL,
  template_id INTEGER REFERENCES safety_checklist_templates(id) ON DELETE SET NULL,
  template_name VARCHAR(255) NOT NULL,
  project_id INTEGER,
  submitted_by INTEGER,
  submitted_by_name VARCHAR(255),
  check_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- answers: {"0": true, "1": false, "2": "text value", ...} keyed by item index
  answers JSONB NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
