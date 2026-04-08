-- safety_talk_questions: joined by talk_id in every talk fetch
CREATE INDEX IF NOT EXISTS idx_safety_talk_questions_talk ON safety_talk_questions(talk_id);

-- safety_checklist_templates: all queries filter by company_id
CREATE INDEX IF NOT EXISTS idx_safety_checklist_templates_company ON safety_checklist_templates(company_id);

-- safety_checklist_submissions: all queries filter by company_id
CREATE INDEX IF NOT EXISTS idx_safety_checklist_submissions_company ON safety_checklist_submissions(company_id);

-- field_reports: admin GET filters on (company_id, status)
CREATE INDEX IF NOT EXISTS idx_field_reports_company_status ON field_reports(company_id, status);

-- daily_report sub-tables: fetched by report_id on every report load
CREATE INDEX IF NOT EXISTS idx_daily_report_equipment_report ON daily_report_equipment(report_id);
CREATE INDEX IF NOT EXISTS idx_daily_report_materials_report ON daily_report_materials(report_id);
