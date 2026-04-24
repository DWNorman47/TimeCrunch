/**
 * Phase A permissions tests — hasPerm() resolver covering the three paths:
 *   1. super_admin short-circuit
 *   2. role_id lookup against role_permissions
 *   3. legacy fallback to admin_permissions JSONB when role_id is null
 *
 * The actual backfill migration (0089) is exercised by the migrations-lint
 * CI job, which applies it against a throwaway Postgres on every push.
 */

jest.mock('../db', () => ({ query: jest.fn() }));

const pool = require('../db');
const {
  PERMISSIONS, PERMISSION_KEYS, BUILTIN_ROLES,
  WORKER_PERMISSIONS, ADMIN_PERMISSIONS, OWNER_PERMISSIONS,
  hasPerm, requirePerm,
} = require('../permissions');

describe('permission catalog', () => {
  test('every key is unique', () => {
    const keys = PERMISSIONS.map(p => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('every key has a group and label', () => {
    for (const p of PERMISSIONS) {
      expect(p.group).toBeTruthy();
      expect(p.label).toBeTruthy();
    }
  });

  test('every built-in role only references valid permissions', () => {
    for (const role of Object.values(BUILTIN_ROLES)) {
      for (const perm of role.permissions) {
        expect(PERMISSION_KEYS.has(perm)).toBe(true);
      }
    }
  });

  test('Admin is a strict superset of Worker', () => {
    for (const p of WORKER_PERMISSIONS) {
      expect(ADMIN_PERMISSIONS).toContain(p);
    }
  });

  test('Owner is a strict superset of Admin', () => {
    for (const p of ADMIN_PERMISSIONS) {
      expect(OWNER_PERMISSIONS).toContain(p);
    }
  });

  test('Owner-only perms exist: manage_billing, manage_roles, delete_company', () => {
    expect(OWNER_PERMISSIONS).toContain('manage_billing');
    expect(OWNER_PERMISSIONS).toContain('manage_roles');
    expect(OWNER_PERMISSIONS).toContain('delete_company');
    expect(ADMIN_PERMISSIONS).not.toContain('manage_billing');
    expect(ADMIN_PERMISSIONS).not.toContain('manage_roles');
    expect(ADMIN_PERMISSIONS).not.toContain('delete_company');
  });
});

describe('hasPerm — super_admin', () => {
  beforeEach(() => pool.query.mockReset());

  test('always true, even for never-granted perms', async () => {
    const user = { id: 1, role: 'super_admin', role_id: null, admin_permissions: null };
    expect(await hasPerm(user, 'manage_billing')).toBe(true);
    expect(await hasPerm(user, 'delete_company')).toBe(true);
    expect(await hasPerm(user, 'clock_in_self')).toBe(true);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('hasPerm — role_id lookup', () => {
  beforeEach(() => pool.query.mockReset());

  test('returns true when perm is in role_permissions', async () => {
    pool.query.mockResolvedValueOnce({ rows: [
      { permission: 'approve_entries' },
      { permission: 'view_reports' },
    ]});
    const user = { id: 1, role: 'admin', role_id: 42, admin_permissions: null };
    expect(await hasPerm(user, 'approve_entries')).toBe(true);
  });

  test('returns false when perm is not in role_permissions', async () => {
    pool.query.mockResolvedValueOnce({ rows: [
      { permission: 'approve_entries' },
    ]});
    const user = { id: 1, role: 'admin', role_id: 42, admin_permissions: null };
    expect(await hasPerm(user, 'manage_billing')).toBe(false);
  });
});

describe('hasPerm — legacy fallback', () => {
  beforeEach(() => pool.query.mockReset());

  test('admin with null admin_permissions and no role_id → full access for legacy keys', async () => {
    const user = { id: 1, role: 'admin', role_id: null, admin_permissions: null };
    expect(await hasPerm(user, 'approve_entries')).toBe(true);
    expect(await hasPerm(user, 'manage_workers')).toBe(true);
    expect(await hasPerm(user, 'manage_projects')).toBe(true);
    expect(await hasPerm(user, 'view_reports')).toBe(true);
    expect(await hasPerm(user, 'manage_settings')).toBe(true);
  });

  test('admin with legacy JSONB tweak respects enabled keys', async () => {
    const user = {
      id: 1, role: 'admin', role_id: null,
      admin_permissions: { approve_entries: true, manage_workers: false, view_reports: true },
    };
    expect(await hasPerm(user, 'approve_entries')).toBe(true);
    expect(await hasPerm(user, 'manage_workers')).toBe(false);
    expect(await hasPerm(user, 'view_reports')).toBe(true);
  });

  test('non-legacy perms deny when role_id is null and user is admin', async () => {
    // manage_billing is Owner-only; no legacy equivalent exists, so an admin
    // without a role_id cannot use it even with null admin_permissions.
    const user = { id: 1, role: 'admin', role_id: null, admin_permissions: null };
    expect(await hasPerm(user, 'manage_billing')).toBe(false);
    expect(await hasPerm(user, 'delete_company')).toBe(false);
  });

  test('worker with no role_id denies worker-only perms too', async () => {
    // clock_in_self isn't a legacy key, so pre-backfill workers are denied.
    // This is acceptable because the backfill runs on deploy; the window
    // between 0088 apply and 0089 apply is <1s.
    const user = { id: 1, role: 'worker', role_id: null, admin_permissions: null };
    expect(await hasPerm(user, 'clock_in_self')).toBe(false);
  });
});

describe('hasPerm — unknown key', () => {
  beforeEach(() => pool.query.mockReset());

  test('throws on unknown permission key (typo guard)', async () => {
    const user = { id: 1, role: 'admin', role_id: null };
    await expect(hasPerm(user, 'definitely_not_a_real_permission')).rejects.toThrow(/Unknown permission/);
  });
});

describe('hasPerm — per-request cache', () => {
  beforeEach(() => pool.query.mockReset());

  test('two checks on the same req hit the DB once', async () => {
    pool.query.mockResolvedValueOnce({ rows: [
      { permission: 'approve_entries' },
      { permission: 'view_reports' },
    ]});
    const req = {
      user: { id: 1, role: 'admin', role_id: 42, admin_permissions: null },
      headers: { authorization: 'Bearer x' },
    };
    await hasPerm(req, 'approve_entries');
    await hasPerm(req, 'view_reports');
    await hasPerm(req, 'manage_billing');
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});

describe('requirePerm middleware', () => {
  beforeEach(() => pool.query.mockReset());

  function makeRes() {
    const res = { statusCode: null, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
  }

  test('calls next() when permission granted', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ permission: 'approve_entries' }] });
    const req = {
      user: { id: 1, role: 'admin', role_id: 1, admin_permissions: null },
      headers: { authorization: 'Bearer x' },
    };
    const res = makeRes();
    const next = jest.fn();
    await requirePerm('approve_entries')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  test('returns 403 with required key when denied', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const req = {
      user: { id: 1, role: 'admin', role_id: 1, admin_permissions: null },
      headers: { authorization: 'Bearer x' },
    };
    const res = makeRes();
    const next = jest.fn();
    await requirePerm('manage_billing')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.required).toBe('manage_billing');
    expect(res.body.code).toBe('permission_denied');
  });

  test('returns 500 on unknown permission key', async () => {
    const req = {
      user: { id: 1, role: 'admin', role_id: 1 },
      headers: { authorization: 'Bearer x' },
    };
    const res = makeRes();
    const next = jest.fn();
    await requirePerm('not_a_real_perm')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
  });
});
