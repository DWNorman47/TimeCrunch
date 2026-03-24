-- =============================================================================
-- Migration: change companies.id from SERIAL integer to UUID
-- =============================================================================
-- Run once on an existing database:
--   psql $DATABASE_URL -f server/migrate_company_uuid.sql
--
-- Safe to run inside a transaction — rolls back fully on any error.
-- For fresh installs, just use schema.sql (already updated).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Step 1: Add a UUID column to companies and populate it
-- ---------------------------------------------------------------------------
ALTER TABLE companies ADD COLUMN IF NOT EXISTS new_id UUID DEFAULT gen_random_uuid();
UPDATE companies SET new_id = gen_random_uuid() WHERE new_id IS NULL;
ALTER TABLE companies ALTER COLUMN new_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Step 2: Add a UUID company column to every dependent table and populate it
--         via a join so the mapping is exact
-- ---------------------------------------------------------------------------
ALTER TABLE users             ADD COLUMN IF NOT EXISTS company_uuid UUID;
ALTER TABLE projects          ADD COLUMN IF NOT EXISTS company_uuid UUID;
ALTER TABLE settings          ADD COLUMN IF NOT EXISTS company_uuid UUID;
ALTER TABLE time_entries      ADD COLUMN IF NOT EXISTS company_uuid UUID;
ALTER TABLE active_clock      ADD COLUMN IF NOT EXISTS company_uuid UUID;
ALTER TABLE shifts             ADD COLUMN IF NOT EXISTS company_uuid UUID;
ALTER TABLE pay_periods        ADD COLUMN IF NOT EXISTS company_uuid UUID;
ALTER TABLE entry_messages    ADD COLUMN IF NOT EXISTS company_uuid UUID;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS company_uuid UUID;
ALTER TABLE audit_log         ADD COLUMN IF NOT EXISTS company_uuid UUID;
ALTER TABLE field_reports     ADD COLUMN IF NOT EXISTS company_uuid UUID;
ALTER TABLE daily_reports     ADD COLUMN IF NOT EXISTS company_uuid UUID;
ALTER TABLE punchlist_items   ADD COLUMN IF NOT EXISTS company_uuid UUID;
ALTER TABLE safety_talks      ADD COLUMN IF NOT EXISTS company_uuid UUID;
ALTER TABLE inbox             ADD COLUMN IF NOT EXISTS company_uuid UUID;

UPDATE users             u SET company_uuid = c.new_id FROM companies c WHERE u.company_id = c.id;
UPDATE projects          p SET company_uuid = c.new_id FROM companies c WHERE p.company_id = c.id;
UPDATE settings          s SET company_uuid = c.new_id FROM companies c WHERE s.company_id = c.id;
UPDATE time_entries      t SET company_uuid = c.new_id FROM companies c WHERE t.company_id = c.id;
UPDATE active_clock      a SET company_uuid = c.new_id FROM companies c WHERE a.company_id = c.id;
UPDATE shifts            s SET company_uuid = c.new_id FROM companies c WHERE s.company_id = c.id;
UPDATE pay_periods       p SET company_uuid = c.new_id FROM companies c WHERE p.company_id = c.id;
UPDATE entry_messages    e SET company_uuid = c.new_id FROM companies c WHERE e.company_id = c.id;
UPDATE push_subscriptions p SET company_uuid = c.new_id FROM companies c WHERE p.company_id = c.id;
UPDATE audit_log         a SET company_uuid = c.new_id FROM companies c WHERE a.company_id = c.id;
UPDATE field_reports     f SET company_uuid = c.new_id FROM companies c WHERE f.company_id = c.id;
UPDATE daily_reports     d SET company_uuid = c.new_id FROM companies c WHERE d.company_id = c.id;
UPDATE punchlist_items   p SET company_uuid = c.new_id FROM companies c WHERE p.company_id = c.id;
UPDATE safety_talks      s SET company_uuid = c.new_id FROM companies c WHERE s.company_id = c.id;
UPDATE inbox             i SET company_uuid = c.new_id FROM companies c WHERE i.company_id = c.id;

-- ---------------------------------------------------------------------------
-- Step 3: Drop indexes on old integer company_id columns
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_users_company_id;
DROP INDEX IF EXISTS idx_projects_company_id;
DROP INDEX IF EXISTS idx_time_entries_company_id;
DROP INDEX IF EXISTS idx_active_clock_company_id;
DROP INDEX IF EXISTS idx_shifts_company_id;
DROP INDEX IF EXISTS idx_pay_periods_company_id;
DROP INDEX IF EXISTS idx_audit_log_company_id;
DROP INDEX IF EXISTS idx_field_reports_company_id;
DROP INDEX IF EXISTS idx_daily_reports_company_id;
DROP INDEX IF EXISTS idx_safety_talks_company_id;
DROP INDEX IF EXISTS idx_punchlist_items_company_id;
DROP INDEX IF EXISTS idx_inbox_company_id;

-- ---------------------------------------------------------------------------
-- Step 4: Drop FK/unique/PK constraints that reference the old integer column,
--         drop the old column, rename the UUID column to company_id
-- ---------------------------------------------------------------------------

-- settings — composite PK includes company_id
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_company_id_fkey;
ALTER TABLE settings DROP COLUMN company_id;
ALTER TABLE settings RENAME COLUMN company_uuid TO company_id;
ALTER TABLE settings ALTER COLUMN company_id SET NOT NULL;

-- pay_periods — has UNIQUE (company_id, period_start, period_end)
ALTER TABLE pay_periods DROP CONSTRAINT IF EXISTS pay_periods_company_id_period_start_period_end_key;
ALTER TABLE pay_periods DROP CONSTRAINT IF EXISTS pay_periods_company_id_fkey;
ALTER TABLE pay_periods DROP COLUMN company_id;
ALTER TABLE pay_periods RENAME COLUMN company_uuid TO company_id;
ALTER TABLE pay_periods ALTER COLUMN company_id SET NOT NULL;

-- daily_reports — has UNIQUE (company_id, project_id, report_date)
ALTER TABLE daily_reports DROP CONSTRAINT IF EXISTS daily_reports_company_id_project_id_report_date_key;
ALTER TABLE daily_reports DROP CONSTRAINT IF EXISTS daily_reports_company_id_fkey;
ALTER TABLE daily_reports DROP COLUMN company_id;
ALTER TABLE daily_reports RENAME COLUMN company_uuid TO company_id;
ALTER TABLE daily_reports ALTER COLUMN company_id SET NOT NULL;

-- remaining tables
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_company_id_fkey;
ALTER TABLE users DROP COLUMN company_id;
ALTER TABLE users RENAME COLUMN company_uuid TO company_id;

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_company_id_fkey;
ALTER TABLE projects DROP COLUMN company_id;
ALTER TABLE projects RENAME COLUMN company_uuid TO company_id;

ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_company_id_fkey;
ALTER TABLE time_entries DROP COLUMN company_id;
ALTER TABLE time_entries RENAME COLUMN company_uuid TO company_id;

ALTER TABLE active_clock DROP CONSTRAINT IF EXISTS active_clock_company_id_fkey;
ALTER TABLE active_clock DROP COLUMN company_id;
ALTER TABLE active_clock RENAME COLUMN company_uuid TO company_id;
ALTER TABLE active_clock ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_company_id_fkey;
ALTER TABLE shifts DROP COLUMN company_id;
ALTER TABLE shifts RENAME COLUMN company_uuid TO company_id;
ALTER TABLE shifts ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE entry_messages DROP CONSTRAINT IF EXISTS entry_messages_company_id_fkey;
ALTER TABLE entry_messages DROP COLUMN company_id;
ALTER TABLE entry_messages RENAME COLUMN company_uuid TO company_id;
ALTER TABLE entry_messages ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_company_id_fkey;
ALTER TABLE push_subscriptions DROP COLUMN company_id;
ALTER TABLE push_subscriptions RENAME COLUMN company_uuid TO company_id;
ALTER TABLE push_subscriptions ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_company_id_fkey;
ALTER TABLE audit_log DROP COLUMN company_id;
ALTER TABLE audit_log RENAME COLUMN company_uuid TO company_id;
ALTER TABLE audit_log ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE field_reports DROP CONSTRAINT IF EXISTS field_reports_company_id_fkey;
ALTER TABLE field_reports DROP COLUMN company_id;
ALTER TABLE field_reports RENAME COLUMN company_uuid TO company_id;
ALTER TABLE field_reports ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE punchlist_items DROP CONSTRAINT IF EXISTS punchlist_items_company_id_fkey;
ALTER TABLE punchlist_items DROP COLUMN company_id;
ALTER TABLE punchlist_items RENAME COLUMN company_uuid TO company_id;
ALTER TABLE punchlist_items ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE safety_talks DROP CONSTRAINT IF EXISTS safety_talks_company_id_fkey;
ALTER TABLE safety_talks DROP COLUMN company_id;
ALTER TABLE safety_talks RENAME COLUMN company_uuid TO company_id;
ALTER TABLE safety_talks ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE inbox DROP CONSTRAINT IF EXISTS inbox_company_id_fkey;
ALTER TABLE inbox DROP COLUMN company_id;
ALTER TABLE inbox RENAME COLUMN company_uuid TO company_id;
ALTER TABLE inbox ALTER COLUMN company_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- Step 5: Swap companies primary key to UUID
-- ---------------------------------------------------------------------------
ALTER TABLE companies DROP CONSTRAINT companies_pkey;
ALTER TABLE companies DROP COLUMN id;
ALTER TABLE companies RENAME COLUMN new_id TO id;
ALTER TABLE companies ADD PRIMARY KEY (id);

-- ---------------------------------------------------------------------------
-- Step 6: Re-add FK constraints (now pointing to UUID primary key)
-- ---------------------------------------------------------------------------
ALTER TABLE users             ADD CONSTRAINT users_company_id_fkey             FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE projects          ADD CONSTRAINT projects_company_id_fkey          FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE settings          ADD CONSTRAINT settings_company_id_fkey          FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE time_entries      ADD CONSTRAINT time_entries_company_id_fkey      FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE active_clock      ADD CONSTRAINT active_clock_company_id_fkey      FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE shifts             ADD CONSTRAINT shifts_company_id_fkey            FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE pay_periods        ADD CONSTRAINT pay_periods_company_id_fkey       FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE entry_messages    ADD CONSTRAINT entry_messages_company_id_fkey    FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE audit_log         ADD CONSTRAINT audit_log_company_id_fkey         FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE field_reports     ADD CONSTRAINT field_reports_company_id_fkey     FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE daily_reports     ADD CONSTRAINT daily_reports_company_id_fkey     FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE punchlist_items   ADD CONSTRAINT punchlist_items_company_id_fkey   FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE safety_talks      ADD CONSTRAINT safety_talks_company_id_fkey      FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE inbox             ADD CONSTRAINT inbox_company_id_fkey             FOREIGN KEY (company_id) REFERENCES companies(id);

-- ---------------------------------------------------------------------------
-- Step 7: Restore composite/unique constraints that included company_id
-- ---------------------------------------------------------------------------
ALTER TABLE settings       ADD PRIMARY KEY (company_id, key);
ALTER TABLE pay_periods    ADD CONSTRAINT pay_periods_company_id_period_start_period_end_key
                           UNIQUE (company_id, period_start, period_end);
ALTER TABLE daily_reports  ADD CONSTRAINT daily_reports_company_id_project_id_report_date_key
                           UNIQUE (company_id, project_id, report_date);

-- ---------------------------------------------------------------------------
-- Step 8: Recreate indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_company_id             ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_company_id          ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_company_id      ON time_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_active_clock_company_id      ON active_clock(company_id);
CREATE INDEX IF NOT EXISTS idx_shifts_company_id            ON shifts(company_id);
CREATE INDEX IF NOT EXISTS idx_pay_periods_company_id       ON pay_periods(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_company_id         ON audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_field_reports_company_id     ON field_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_company_id     ON daily_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_safety_talks_company_id      ON safety_talks(company_id);
CREATE INDEX IF NOT EXISTS idx_punchlist_items_company_id   ON punchlist_items(company_id);
CREATE INDEX IF NOT EXISTS idx_inbox_company_id             ON inbox(company_id);

COMMIT;
