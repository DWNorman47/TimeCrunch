-- Weekly Statement of Compliance signatures for Certified Payroll.
--
-- WH-347 requires the employer (or authorized officer) to sign a Statement
-- of Compliance every pay period attesting that the wages paid match the
-- applicable wage determination and that all required deductions are proper.
--
-- One row per (company, project, week_ending, signer). Appending is the
-- right model — signatures are immutable audit records.

CREATE TABLE IF NOT EXISTS certified_payroll_signatures (
  id             SERIAL PRIMARY KEY,
  company_id     UUID    NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id     INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  week_ending    DATE    NOT NULL,
  signer_user_id INTEGER NOT NULL REFERENCES users(id),
  signer_name    VARCHAR(200) NOT NULL,   -- snapshot at time of signing
  signer_title   VARCHAR(200),            -- "President", "Payroll Manager", etc.
  signature_data TEXT    NOT NULL,        -- typed or drawn; simple text name acceptable for WH-347
  compliance_text TEXT,                   -- snapshot of the statement text at signing time
  ip_address     VARCHAR(45),
  signed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, project_id, week_ending)  -- one active signature per weekly report
);

CREATE INDEX IF NOT EXISTS idx_cp_signatures_company ON certified_payroll_signatures(company_id);
CREATE INDEX IF NOT EXISTS idx_cp_signatures_project ON certified_payroll_signatures(project_id);
CREATE INDEX IF NOT EXISTS idx_cp_signatures_week    ON certified_payroll_signatures(week_ending);
