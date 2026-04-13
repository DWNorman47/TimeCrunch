-- Session invalidation on password change.
-- Every auth'd request compares the token's tv claim to this column; on
-- password change / reset we bump the column, which instantly invalidates
-- every outstanding JWT for that user without waiting for them to expire.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
