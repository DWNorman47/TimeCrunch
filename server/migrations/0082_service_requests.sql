-- Client-submitted service requests ("job orders" / "support tickets").
--
-- Public intake: unauthenticated POSTs from opsfloa.com/r/<company-slug>.
-- Admins review, convert to Projects, or decline. Spam protection is
-- handled at the route level (honeypot + rate limit + CAPTCHA-optional).
--
-- Forward-compatible with a future magic-link client portal: client_id
-- is nullable today and filled in during admin conversion if the
-- requester matches an existing client record.

CREATE TABLE IF NOT EXISTS service_requests (
  id                    SERIAL       PRIMARY KEY,
  company_id            UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id             INTEGER      REFERENCES clients(id) ON DELETE SET NULL,
  requester_name        VARCHAR(200) NOT NULL,
  requester_email       VARCHAR(200),
  requester_phone       VARCHAR(40),
  requester_address     TEXT,
  category              VARCHAR(40)  NOT NULL DEFAULT 'new_work',
  description           TEXT         NOT NULL,
  photo_urls            JSONB        NOT NULL DEFAULT '[]'::jsonb,
  status                VARCHAR(20)  NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_review', 'converted', 'declined', 'spam')),
  admin_notes           TEXT,
  converted_project_id  INTEGER      REFERENCES projects(id) ON DELETE SET NULL,
  reviewed_by           INTEGER      REFERENCES users(id)    ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  submitter_ip          VARCHAR(45),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_requests_company_status ON service_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_service_requests_created        ON service_requests(company_id, created_at DESC);

-- Per-company flag: whether the public /r/<slug> intake form is accepting
-- submissions. Defaults to false so companies opt in explicitly.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS accepts_service_requests BOOLEAN NOT NULL DEFAULT false;

-- Pro tier placeholder: a company's "Notify me when Client Portal Pro is
-- available" signal. Flipped true when the admin clicks the notify button
-- in billing. Used only for demand measurement; does not gate any feature.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS client_portal_pro_interest BOOLEAN NOT NULL DEFAULT false;
