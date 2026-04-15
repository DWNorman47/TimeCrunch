-- Fringe benefits per worker per category.
--
-- WH-347 requires itemizing fringe benefits (health insurance, pension,
-- vacation, apprenticeship, other) as a per-hour rate. Most contractors
-- have one standard fringe set per worker that rarely changes, so a row
-- per (user, category) is enough; we don't version by week.
--
-- If a specific workweek has a different fringe rate (e.g. a project-
-- specific wage determination), an admin can override on the report.

CREATE TABLE IF NOT EXISTS worker_fringes (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id  UUID    NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category    VARCHAR(40) NOT NULL,  -- 'health' | 'pension' | 'vacation' | 'apprenticeship' | 'other'
  rate_per_hour NUMERIC(10,4) NOT NULL DEFAULT 0,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_worker_fringes_company ON worker_fringes(company_id);
CREATE INDEX IF NOT EXISTS idx_worker_fringes_user    ON worker_fringes(user_id);
