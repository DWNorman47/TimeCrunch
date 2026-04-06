CREATE TABLE IF NOT EXISTS clients (
  id            SERIAL PRIMARY KEY,
  company_id    UUID         NOT NULL,
  name          VARCHAR(255) NOT NULL,
  contact_name  VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  address       TEXT,
  notes         TEXT,
  active        BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clients_company ON clients(company_id);

CREATE TABLE IF NOT EXISTS client_documents (
  id           SERIAL PRIMARY KEY,
  company_id   UUID         NOT NULL REFERENCES companies(id),
  client_id    INTEGER      NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name         VARCHAR(500) NOT NULL,
  url          TEXT         NOT NULL,
  size_bytes   INTEGER,
  doc_type     VARCHAR(50)  NOT NULL DEFAULT 'other',
  expires_at   DATE,
  uploaded_by  INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_client_docs_client ON client_documents(client_id);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL;
