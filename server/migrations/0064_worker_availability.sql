CREATE TABLE IF NOT EXISTS worker_availability (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  UNIQUE (user_id, day_of_week)
);
CREATE INDEX IF NOT EXISTS idx_worker_availability_company ON worker_availability(company_id, user_id);
