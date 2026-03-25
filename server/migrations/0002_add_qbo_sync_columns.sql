-- QBO sync tracking on time entries (duplicate prevention)
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS qbo_activity_id VARCHAR(50);
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS qbo_synced_at   TIMESTAMP;
