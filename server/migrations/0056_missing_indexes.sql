-- Fill in indexes that were missing from the baseline schema.
-- All use IF NOT EXISTS so they are safe to re-run.

-- field_report_photos: joined on every field report fetch
CREATE INDEX IF NOT EXISTS idx_field_report_photos_report ON field_report_photos(report_id);

-- punchlist_checklist_items: two correlated subqueries per punchlist row
CREATE INDEX IF NOT EXISTS idx_punchlist_checklist_punchlist ON punchlist_checklist_items(punchlist_id);

-- punchlist_items: project health counts and list queries filter by project_id
CREATE INDEX IF NOT EXISTS idx_punchlist_items_project ON punchlist_items(project_id);

-- field_reports: project_id filter on the field report feed
CREATE INDEX IF NOT EXISTS idx_field_reports_project ON field_reports(project_id);

-- rfis: project-scoped RFI list (company_id + rfi_number unique index exists, project_id does not)
CREATE INDEX IF NOT EXISTS idx_rfis_project ON rfis(project_id);

-- audit_log: paginated queries filter company_id AND order/filter by created_at;
-- composite is far better than two separate indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_company_created ON audit_log(company_id, created_at DESC);

-- daily_report_equipment / daily_report_materials: report_id fetched alongside manpower,
-- which has idx_daily_report_manpower_report, but these two did not
CREATE INDEX IF NOT EXISTS idx_daily_report_equipment_report ON daily_report_equipment(report_id);
CREATE INDEX IF NOT EXISTS idx_daily_report_materials_report ON daily_report_materials(report_id);

-- time_entries: non-partial (company_id, work_date) composite for date-bounded analytics
-- and worker-list CTE queries; the existing partial index only covers status='pending'
CREATE INDEX IF NOT EXISTS idx_time_entries_company_date ON time_entries(company_id, work_date);
