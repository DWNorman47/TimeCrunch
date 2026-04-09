CREATE TABLE IF NOT EXISTS worker_documents (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  size_bytes INTEGER,
  mime_type VARCHAR(100),
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_worker_documents_user ON worker_documents(user_id, company_id);
