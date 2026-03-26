-- Incident / near-miss reporting
CREATE TABLE IF NOT EXISTS incident_reports (
  id SERIAL PRIMARY KEY,
  company_id UUID NOT NULL,  -- no FK: companies.id may be INTEGER on some environments (see 0003)
  user_id INTEGER NOT NULL REFERENCES users(id),
  project_id INTEGER REFERENCES projects(id),
  incident_date DATE NOT NULL,
  incident_time TIME,
  type VARCHAR(50) NOT NULL DEFAULT 'other',
  injured_name VARCHAR(255),
  body_part VARCHAR(255),
  treatment VARCHAR(50),
  work_stopped BOOLEAN NOT NULL DEFAULT false,
  description TEXT NOT NULL,
  witnesses TEXT,
  corrective_action TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_incident_reports_company_id ON incident_reports (company_id);
CREATE INDEX IF NOT EXISTS idx_incident_reports_user_id ON incident_reports (user_id);
CREATE INDEX IF NOT EXISTS idx_incident_reports_incident_date ON incident_reports (incident_date);
