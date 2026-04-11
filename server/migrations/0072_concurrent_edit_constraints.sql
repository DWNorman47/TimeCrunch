-- Fix concurrent-edit races identified in data integrity audit.

-- 1. RFI auto-numbering: prevent duplicate rfi_number within a company.
--    The app computes MAX(rfi_number)+1 then inserts — two simultaneous requests
--    can race and produce the same number. This constraint is the safety net;
--    the INSERT query will also be made atomic via subquery.
ALTER TABLE rfis
  ADD CONSTRAINT IF NOT EXISTS uq_rfis_company_number
  UNIQUE (company_id, rfi_number);

-- 2. Safety-talk sign-offs: prevent a worker from signing the same talk twice
--    due to a check-then-insert race (double-submit from two browser tabs).
ALTER TABLE safety_talk_signoffs
  ADD CONSTRAINT IF NOT EXISTS uq_signoff_talk_worker
  UNIQUE (talk_id, worker_id);
