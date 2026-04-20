-- worker_documents.company_id was declared INTEGER in migration 0065, but
-- companies.id is UUID. Every INSERT and SELECT against this table throws a
-- type-mismatch error, so the table has never successfully held data. Safe
-- to drop and recreate with the correct type.

DO $$
DECLARE
  coltype TEXT;
  rowcount BIGINT;
BEGIN
  SELECT data_type INTO coltype
    FROM information_schema.columns
    WHERE table_name = 'worker_documents' AND column_name = 'company_id';

  IF coltype = 'integer' THEN
    -- Sanity check. If there are rows somehow, keep them nullable and backfill.
    SELECT COUNT(*) INTO rowcount FROM worker_documents;
    IF rowcount = 0 THEN
      DROP TABLE worker_documents;
    ELSE
      ALTER TABLE worker_documents ALTER COLUMN company_id DROP NOT NULL;
      UPDATE worker_documents SET company_id = NULL;
      ALTER TABLE worker_documents ALTER COLUMN company_id TYPE UUID USING NULL;
      UPDATE worker_documents d
         SET company_id = u.company_id
        FROM users u
        WHERE d.user_id = u.id AND d.company_id IS NULL;
      ALTER TABLE worker_documents ALTER COLUMN company_id SET NOT NULL;
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS worker_documents (
  id SERIAL PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  size_bytes INTEGER,
  mime_type VARCHAR(100),
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_worker_documents_user ON worker_documents(user_id, company_id);

-- Add FK if the table already existed but lacked it (safe either way)
DO $$
BEGIN
  ALTER TABLE worker_documents
    ADD CONSTRAINT worker_documents_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  -- already present
END $$;
