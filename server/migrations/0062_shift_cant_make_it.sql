-- Add cant_make_it flag to shifts so workers can indicate unavailability
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cant_make_it BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cant_make_it_note TEXT;
