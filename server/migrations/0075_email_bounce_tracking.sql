-- Track emails that have bounced / been marked as spam / been dropped
-- (reported via SendGrid event webhook). The primary use is visibility:
-- admins can see which worker emails are broken, and we can skip sending
-- to known-bad addresses without waiting for another bounce.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_bounced_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS email_bounce_reason VARCHAR(255);

-- Fast lookup by email for the webhook (matches arrive by address, not user_id).
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email)) WHERE email IS NOT NULL;
