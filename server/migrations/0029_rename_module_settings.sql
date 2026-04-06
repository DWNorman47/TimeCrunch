-- Rename module-level feature flags from feature_ to module_ prefix
UPDATE settings SET key = 'module_timeclock' WHERE key = 'feature_timeclock';
UPDATE settings SET key = 'module_field'     WHERE key = 'feature_field';
UPDATE settings SET key = 'module_projects'  WHERE key = 'feature_projects';
