CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'worker',
  full_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  company_id INTEGER NOT NULL REFERENCES companies(id),
  key VARCHAR(50) NOT NULL,
  value NUMERIC(10,4) NOT NULL,
  PRIMARY KEY (company_id, key)
);

CREATE TABLE IF NOT EXISTS time_entries (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  work_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  wage_type VARCHAR(20) NOT NULL CHECK (wage_type IN ('regular', 'prevailing')),
  rate DECIMAL(10,2),
  notes TEXT,
  locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Field reports (photos + notes from the field)
CREATE TABLE IF NOT EXISTS field_reports (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  worker_id INTEGER NOT NULL REFERENCES users(id),
  title VARCHAR(255),
  notes TEXT,
  lat DECIMAL(10,7),
  lng DECIMAL(10,7),
  status VARCHAR(20) NOT NULL DEFAULT 'submitted',
  reported_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS field_report_photos (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES field_reports(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption VARCHAR(500)
);

-- Daily site reports (replaces Raken)
CREATE TABLE IF NOT EXISTS daily_reports (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  report_date DATE NOT NULL,
  superintendent VARCHAR(255),
  weather_condition VARCHAR(50),
  weather_temp INTEGER,
  work_performed TEXT,
  delays_issues TEXT,
  visitor_log TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (company_id, project_id, report_date)
);

CREATE TABLE IF NOT EXISTS daily_report_manpower (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  trade VARCHAR(255),
  worker_count INTEGER NOT NULL DEFAULT 1,
  hours DECIMAL(5,2),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS daily_report_equipment (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  hours DECIMAL(5,2)
);

CREATE TABLE IF NOT EXISTS daily_report_materials (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  description VARCHAR(500) NOT NULL,
  quantity VARCHAR(100)
);

-- Punchlist (items to fix before project closeout)
CREATE TABLE IF NOT EXISTS punchlist_items (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  location VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  priority VARCHAR(10) NOT NULL DEFAULT 'normal',
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Safety / Toolbox Talks with worker sign-offs
CREATE TABLE IF NOT EXISTS safety_talks (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  given_by VARCHAR(255),
  talk_date DATE NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safety_talk_signoffs (
  id SERIAL PRIMARY KEY,
  talk_id INTEGER NOT NULL REFERENCES safety_talks(id) ON DELETE CASCADE,
  worker_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  worker_name VARCHAR(255),
  signed_at TIMESTAMP DEFAULT NOW()
);
