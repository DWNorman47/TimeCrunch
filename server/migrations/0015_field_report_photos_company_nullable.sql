-- field_report_photos.company_id is redundant (report_id FK covers tenancy)
-- and the column type (INTEGER) doesn't match company UUID — make it nullable
-- so we can stop inserting it.
--
-- Defensive: schema.sql has since been cleaned up and no longer declares this
-- column at all. This migration only acts on databases where the column still
-- exists (production DBs created before the cleanup).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'field_report_photos' AND column_name = 'company_id'
  ) THEN
    EXECUTE 'ALTER TABLE field_report_photos ALTER COLUMN company_id DROP NOT NULL';
  END IF;
END $$;
