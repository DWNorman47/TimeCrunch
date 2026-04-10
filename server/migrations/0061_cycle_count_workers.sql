-- Workers assigned to a cycle count and their roles
CREATE TABLE IF NOT EXISTS inventory_count_workers (
  id             SERIAL    PRIMARY KEY,
  cycle_count_id INTEGER   NOT NULL REFERENCES inventory_cycle_counts(id) ON DELETE CASCADE,
  user_id        INTEGER   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  roles          TEXT[]    NOT NULL DEFAULT '{}',  -- ['counter','auditor','reconciler']
  assigned_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_count_id, user_id)
);

-- Per-line role assignments (one row per role per line)
CREATE TABLE IF NOT EXISTS inventory_count_assignments (
  id             SERIAL        PRIMARY KEY,
  line_id        INTEGER       NOT NULL REFERENCES inventory_cycle_count_lines(id) ON DELETE CASCADE,
  cycle_count_id INTEGER       NOT NULL REFERENCES inventory_cycle_counts(id) ON DELETE CASCADE,
  user_id        INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role           VARCHAR(20)   NOT NULL CHECK (role IN ('counter','auditor','reconciler')),
  status         VARCHAR(20)   NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted')),
  counted_qty    DECIMAL(12,4),
  counted_uom_id INTEGER       REFERENCES inventory_item_uoms(id),
  notes          TEXT,
  submitted_at   TIMESTAMP,
  UNIQUE (line_id, role)
);

-- Add line-level workflow state and reconcile threshold to count lines
ALTER TABLE inventory_cycle_count_lines
  ADD COLUMN IF NOT EXISTS line_status              VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reconcile_threshold      DECIMAL(12,4),
  ADD COLUMN IF NOT EXISTS reconcile_threshold_type VARCHAR(10) NOT NULL DEFAULT 'units';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inv_cw_count    ON inventory_count_workers(cycle_count_id);
CREATE INDEX IF NOT EXISTS idx_inv_cw_user     ON inventory_count_workers(user_id);
CREATE INDEX IF NOT EXISTS idx_inv_ca_line     ON inventory_count_assignments(line_id);
CREATE INDEX IF NOT EXISTS idx_inv_ca_user     ON inventory_count_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_inv_ca_count    ON inventory_count_assignments(cycle_count_id);
CREATE INDEX IF NOT EXISTS idx_inv_ccl_lstatus ON inventory_cycle_count_lines(cycle_count_id, line_status);
