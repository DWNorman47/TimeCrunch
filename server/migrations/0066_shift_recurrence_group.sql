ALTER TABLE shifts ADD COLUMN IF NOT EXISTS recurrence_group_id UUID;
CREATE INDEX IF NOT EXISTS idx_shifts_recurrence_group ON shifts(recurrence_group_id) WHERE recurrence_group_id IS NOT NULL;
