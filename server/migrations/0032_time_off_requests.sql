CREATE TABLE IF NOT EXISTS time_off_requests (
  id            SERIAL PRIMARY KEY,
  company_id    UUID          NOT NULL REFERENCES companies(id),
  user_id       INTEGER       NOT NULL REFERENCES users(id),
  type          VARCHAR(20)   NOT NULL DEFAULT 'vacation', -- vacation | sick | personal | other
  start_date    DATE          NOT NULL,
  end_date      DATE          NOT NULL,
  note          TEXT,
  status        VARCHAR(20)   NOT NULL DEFAULT 'pending',  -- pending | approved | denied
  reviewed_by   INTEGER       REFERENCES users(id),
  review_note   TEXT,
  reviewed_at   TIMESTAMP,
  created_at    TIMESTAMP     NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_time_off_company ON time_off_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_time_off_user    ON time_off_requests(user_id);
