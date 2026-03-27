-- Subcontractor daily reports (logged by GC admin on behalf of subs)
CREATE TABLE IF NOT EXISTS sub_reports (
  id           SERIAL PRIMARY KEY,
  company_id   UUID         NOT NULL,  -- no FK: companies.id may be INTEGER on some environments
  project_id   INTEGER      REFERENCES projects(id) ON DELETE SET NULL,
  report_date  DATE         NOT NULL,
  sub_company  VARCHAR(255) NOT NULL,
  foreman_name VARCHAR(255),
  headcount    INTEGER,
  work_performed TEXT,
  notes        TEXT,
  created_by   INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sub_reports_company_id  ON sub_reports (company_id);
CREATE INDEX IF NOT EXISTS idx_sub_reports_report_date ON sub_reports (report_date);
CREATE INDEX IF NOT EXISTS idx_sub_reports_project_id  ON sub_reports (project_id);
