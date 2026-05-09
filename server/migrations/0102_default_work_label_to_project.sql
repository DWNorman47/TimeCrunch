-- The app's default project label changed from "Work" to "Project".
-- Existing rows with the old untouched default should follow the new default.
UPDATE settings
SET value = 'Project'
WHERE key = 'label_work'
  AND value = 'Work';
