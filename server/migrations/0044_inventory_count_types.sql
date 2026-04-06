-- Add count_type to cycle counts and make location optional (for full counts)
ALTER TABLE inventory_cycle_counts
  ADD COLUMN IF NOT EXISTS count_type VARCHAR(20) NOT NULL DEFAULT 'cycle'
    CHECK (count_type IN ('cycle','full','audit','reconcile')),
  ALTER COLUMN location_id DROP NOT NULL;

-- Add location_id to lines so full counts can track which location each line belongs to
ALTER TABLE inventory_cycle_count_lines
  ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES inventory_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inv_ccl_location ON inventory_cycle_count_lines(location_id);
CREATE INDEX IF NOT EXISTS idx_inv_cc_type      ON inventory_cycle_counts(company_id, count_type);
