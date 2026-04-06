CREATE TABLE IF NOT EXISTS project_documents (
  id           SERIAL PRIMARY KEY,
  company_id   UUID         NOT NULL REFERENCES companies(id),
  project_id   INTEGER      NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         VARCHAR(500) NOT NULL,
  url          TEXT         NOT NULL,
  size_bytes   INTEGER,
  uploaded_by  INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_docs_project ON project_documents(project_id);
