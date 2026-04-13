-- Fix worker_availability.company_id type from INTEGER to UUID
-- The table was created with wrong type; data is invalid so we truncate and retype
TRUNCATE TABLE worker_availability;
ALTER TABLE worker_availability
  ALTER COLUMN company_id TYPE UUID USING NULL;
ALTER TABLE worker_availability
  ALTER COLUMN company_id SET NOT NULL;
