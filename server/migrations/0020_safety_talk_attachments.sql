CREATE TABLE IF NOT EXISTS safety_talk_attachments (
  id SERIAL PRIMARY KEY,
  talk_id INTEGER NOT NULL REFERENCES safety_talks(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  content_type VARCHAR(100),
  size_bytes INTEGER,
  uploaded_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
