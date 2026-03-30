-- Fix: company_id columns were created as INTEGER but companies.id is UUID
ALTER TABLE safety_checklist_templates
  ALTER COLUMN company_id TYPE UUID USING company_id::text::uuid;

ALTER TABLE safety_checklist_submissions
  ALTER COLUMN company_id TYPE UUID USING company_id::text::uuid;
