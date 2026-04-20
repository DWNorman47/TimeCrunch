-- Service-request configuration:
-- (a) categories are now admin-configurable (advanced_settings.service_request_categories)
--     so the column stores the full display label; widen to VARCHAR(100).
-- (b) per-admin notify toggle; default true for admins/super_admins, false for workers.

-- (a) Widen the category column. Also upgrade any legacy key-style rows to
-- the default labels so they match the new configured list.
ALTER TABLE service_requests
  ALTER COLUMN category TYPE VARCHAR(100);

UPDATE service_requests SET category = 'New work / project inquiry'  WHERE category = 'new_work';
UPDATE service_requests SET category = 'Service call / repair'       WHERE category = 'service_call';
UPDATE service_requests SET category = 'Request a quote'             WHERE category = 'quote';
UPDATE service_requests SET category = 'Other'                       WHERE category = 'other';

-- (b) Per-admin notification preference. Existing admins are opted in; workers
-- are opted out (they wouldn't see the Requests tab anyway, so it's moot).
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_service_requests BOOLEAN;

UPDATE users
  SET notify_service_requests = CASE WHEN role IN ('admin', 'super_admin') THEN true ELSE false END
  WHERE notify_service_requests IS NULL;

ALTER TABLE users ALTER COLUMN notify_service_requests SET DEFAULT false;
ALTER TABLE users ALTER COLUMN notify_service_requests SET NOT NULL;
