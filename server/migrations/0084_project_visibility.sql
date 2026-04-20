-- Per-project worker visibility.
--
-- NULL or empty array = visible to everyone in the company (the default; no
-- restriction). Non-empty array = only those user IDs can see the project
-- in their Time Clock project dropdown.
--
-- Mirrors the shape of users.worker_access_ids, which uses the same
-- NULL-means-unrestricted convention for admin-side filtering.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS visible_to_user_ids INTEGER[];

-- GIN index supports @> / && array-containment queries for filtering by user
CREATE INDEX IF NOT EXISTS idx_projects_visible_to_user_ids
  ON projects USING gin(visible_to_user_ids);
