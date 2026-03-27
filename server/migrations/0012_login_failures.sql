CREATE TABLE IF NOT EXISTS login_failures (
  id SERIAL PRIMARY KEY,
  attempted_company VARCHAR(255),
  attempted_username VARCHAR(100),
  failure_reason VARCHAR(30) NOT NULL,  -- 'company_not_found', 'user_not_found', 'wrong_password'
  ip VARCHAR(45),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS login_failures_created_at_idx ON login_failures (created_at DESC);
