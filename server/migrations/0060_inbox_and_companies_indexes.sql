-- inbox: unread query filters on user_id WHERE read_at IS NULL
CREATE INDEX IF NOT EXISTS idx_inbox_user_unread ON inbox(user_id, read_at) WHERE read_at IS NULL;

-- companies: trial-abuse detection filters on registration_ip + created_at
CREATE INDEX IF NOT EXISTS idx_companies_registration_ip ON companies(registration_ip, created_at DESC);
