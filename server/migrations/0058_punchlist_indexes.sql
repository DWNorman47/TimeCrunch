-- Composite indexes for punchlist_items list queries.
-- All use IF NOT EXISTS so they are safe to re-run.

-- punchlist_items: list queries filter company_id + status (Open/In Progress/Resolved)
CREATE INDEX IF NOT EXISTS idx_punchlist_items_company_status
  ON punchlist_items(company_id, status);

-- punchlist_items: list queries filter company_id + priority (Critical/High/Medium/Low)
CREATE INDEX IF NOT EXISTS idx_punchlist_items_company_priority
  ON punchlist_items(company_id, priority);

-- punchlist_items: project-scoped listing already has idx_punchlist_items_project (project_id only);
-- this composite avoids the extra company_id predicate scan on multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_punchlist_items_company_project
  ON punchlist_items(company_id, project_id);
