-- 0078_reimbursements_desc_nullable.sql
-- Description was created NOT NULL in 0053, but both the client and server have
-- always treated it as optional (default null). Mileage entries in particular
-- are self-describing (miles × rate) and don't need a description. Drop the
-- constraint so those submissions stop failing.

ALTER TABLE reimbursements ALTER COLUMN description DROP NOT NULL;
