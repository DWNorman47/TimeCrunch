-- Fix concurrent-edit races identified in data integrity audit.

-- 1. RFI auto-numbering: prevent duplicate rfi_number within a company.
--    The app computes MAX(rfi_number)+1 then inserts — two simultaneous requests
--    can race and produce the same number. This constraint is the safety net;
--    the INSERT query will also be made atomic via subquery.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_rfis_company_number'
  ) AND to_regclass('uq_rfis_company_number') IS NULL THEN
    ALTER TABLE rfis
      ADD CONSTRAINT uq_rfis_company_number
      UNIQUE (company_id, rfi_number);
  END IF;
END $$;

-- 2. Safety-talk sign-offs: prevent a worker from signing the same talk twice
--    due to a check-then-insert race (double-submit from two browser tabs).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_signoff_talk_worker'
  ) AND to_regclass('uq_signoff_talk_worker') IS NULL THEN
    ALTER TABLE safety_talk_signoffs
      ADD CONSTRAINT uq_signoff_talk_worker
      UNIQUE (talk_id, worker_id);
  END IF;
END $$;
