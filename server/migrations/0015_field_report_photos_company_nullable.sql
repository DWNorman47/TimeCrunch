-- field_report_photos.company_id is redundant (report_id FK covers tenancy)
-- and the column type (INTEGER) doesn't match company UUID — make it nullable
-- so we can stop inserting it.

ALTER TABLE field_report_photos ALTER COLUMN company_id DROP NOT NULL;
