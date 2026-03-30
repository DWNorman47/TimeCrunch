-- Quiz questions for safety talks
CREATE TABLE IF NOT EXISTS safety_talk_questions (
  id SERIAL PRIMARY KEY,
  talk_id INTEGER NOT NULL REFERENCES safety_talks(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  correct_index INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- How many questions must be answered correctly to pass (NULL = all)
ALTER TABLE safety_talks ADD COLUMN IF NOT EXISTS pass_threshold INTEGER;

-- Track quiz result on sign-off
ALTER TABLE safety_talk_signoffs ADD COLUMN IF NOT EXISTS quiz_score INTEGER;
ALTER TABLE safety_talk_signoffs ADD COLUMN IF NOT EXISTS quiz_passed BOOLEAN;
