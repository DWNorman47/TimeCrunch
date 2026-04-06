ALTER TABLE client_documents
  ADD COLUMN IF NOT EXISTS direction VARCHAR(20) NOT NULL DEFAULT 'from_client'
    CHECK (direction IN ('from_client', 'from_company'));
