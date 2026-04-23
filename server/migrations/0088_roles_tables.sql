-- Phase A of the roles & permissions overhaul: schema only.
--
-- Creates the tables the new system lives in and adds users.role_id as a
-- nullable column (backfilled by 0089). No behavior change until routes
-- switch to requirePerm in a later phase.
--
-- Design choices documented in server/permissions.js:
--   - roles: per-company, built-ins are seeded and marked is_builtin.
--     parent_role is the fallback when a custom role is deleted.
--   - role_permissions: row-per-grant (not JSONB) so we can index and
--     evolve the catalog without rewriting every row.
--   - users.role_id: nullable now; Phase C drops users.role and
--     users.admin_permissions once all code reads role_id.

CREATE TABLE IF NOT EXISTS roles (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          VARCHAR(60) NOT NULL,
  description   TEXT,
  is_builtin    BOOLEAN NOT NULL DEFAULT false,
  parent_role   VARCHAR(10) NOT NULL CHECK (parent_role IN ('worker', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS roles_company_idx ON roles (company_id);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission    VARCHAR(60) NOT NULL,
  PRIMARY KEY (role_id, permission)
);

CREATE INDEX IF NOT EXISTS role_permissions_role_idx ON role_permissions (role_id);

-- users.role_id: nullable during Phase A. ON DELETE SET NULL is defensive —
-- the Phase B role-delete UI should always reassign to the built-in parent
-- before deleting, but SET NULL prevents orphaned FKs if a race slips through.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_role_id_idx ON users (role_id);
