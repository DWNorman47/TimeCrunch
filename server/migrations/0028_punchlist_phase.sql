-- Add phase/milestone field to punchlist items
ALTER TABLE punchlist_items
  ADD COLUMN IF NOT EXISTS phase VARCHAR(100);
