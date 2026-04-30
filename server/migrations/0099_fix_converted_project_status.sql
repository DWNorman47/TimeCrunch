-- Service-request → project conversion was inserting status = 'active',
-- which isn't one of the four valid project statuses (planning,
-- in_progress, on_hold, completed). The admin project-edit form
-- couldn't save changes on these projects because the status field
-- failed server-side validation.
--
-- Migrate any existing rows to 'in_progress' (the right default for a
-- recently-converted client request — the work has been accepted and
-- is active). The conversion code is fixed in the same commit so new
-- conversions land with the correct status.

UPDATE projects
SET status = 'in_progress'
WHERE status = 'active';
