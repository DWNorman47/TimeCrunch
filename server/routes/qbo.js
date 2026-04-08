const router = require('express').Router();
const pool = require('../db');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const qbo = require('../services/qbo');
const { encrypt } = require('../services/encryption');
const { applySettingsRows, ADMIN_SETTINGS_DEFAULTS } = require('../settingsDefaults');

// GET /api/qbo/status — connection status for this company
router.get('/status', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT qbo_realm_id, qbo_connected_at, qbo_token_expires_at, qbo_disconnected FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    const row = result.rows[0];
    const connected = !!row?.qbo_realm_id;

    let qbo_company_name = null;
    if (connected && !row?.qbo_disconnected) {
      try {
        const info = await qbo.getCompanyInfo(req.user.company_id);
        qbo_company_name = info?.CompanyName || null;
      } catch {
        // Non-fatal — connection display still works without the name
      }
    }

    res.json({
      connected,
      disconnected: row?.qbo_disconnected || false,
      connected_at: row?.qbo_connected_at || null,
      token_expires_at: row?.qbo_token_expires_at || null,
      qbo_company_name,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/qbo/connect — returns the Intuit OAuth URL to redirect the user to
router.get('/connect', requireAdmin, async (req, res) => {
  if (!process.env.QBO_CLIENT_ID || !process.env.QBO_REDIRECT_URI) {
    return res.status(503).json({ error: 'QuickBooks integration not configured' });
  }
  // Generate a CSRF nonce, store it, encode it in state
  const nonce = crypto.randomBytes(16).toString('hex');
  await pool.query('UPDATE companies SET qbo_oauth_nonce = $1 WHERE id = $2', [nonce, req.user.company_id]);
  const state = Buffer.from(JSON.stringify({ company_id: req.user.company_id, nonce })).toString('base64');
  res.json({ url: qbo.getAuthUrl(state) });
});

// GET /api/qbo/callback — Intuit redirects here after user authorizes
// This handler is exported and registered WITHOUT auth middleware in index.js
async function oauthCallback(req, res) {
  const { code, state, realmId } = req.query;
  if (!code || !state || !realmId) {
    return res.redirect(`${process.env.APP_URL}/administration#qbo?error=missing_params`);
  }
  try {
    const { company_id, nonce } = JSON.parse(Buffer.from(state, 'base64').toString());

    // CSRF check — verify nonce matches what we stored
    const nonceResult = await pool.query('SELECT qbo_oauth_nonce FROM companies WHERE id = $1', [company_id]);
    const storedNonce = nonceResult.rows[0]?.qbo_oauth_nonce;
    if (!nonce || !storedNonce || nonce !== storedNonce) {
      return res.redirect(`${process.env.APP_URL}/administration#qbo?error=invalid_state`);
    }

    const tokens = await qbo.exchangeCode(code);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await pool.query(
      `UPDATE companies
       SET qbo_realm_id = $1, qbo_access_token = $2, qbo_refresh_token = $3,
           qbo_token_expires_at = $4, qbo_connected_at = NOW(),
           qbo_oauth_nonce = NULL, qbo_disconnected = false
       WHERE id = $5`,
      [encrypt(realmId), encrypt(tokens.access_token), encrypt(tokens.refresh_token), expiresAt, company_id]
    );
    res.redirect(`${process.env.APP_URL}/administration#integrations`);
  } catch (err) {
    console.error(err);
    res.redirect(`${process.env.APP_URL}/administration#integrations?error=auth_failed`);
  }
}
router.get('/callback', oauthCallback);

// DELETE /api/qbo/disconnect
router.delete('/disconnect', requireAdmin, async (req, res) => {
  try {
    await pool.query(
      `UPDATE companies
       SET qbo_realm_id = NULL, qbo_access_token = NULL, qbo_refresh_token = NULL,
           qbo_token_expires_at = NULL, qbo_connected_at = NULL, qbo_disconnected = false
       WHERE id = $1`,
      [req.user.company_id]
    );
    res.json({ disconnected: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/qbo/employees — list QBO employees (for mapping UI)
router.get('/employees', requireAdmin, async (req, res) => {
  try {
    const employees = await qbo.listEmployees(req.user.company_id);
    res.json(employees);
  } catch (err) {
    console.error(err);
    const status = err.code === 'qbo_auth_expired' ? 401 : 500;
    res.status(status).json({ error: err.code === 'qbo_auth_expired' ? err.message : 'Server error', code: err.code });
  }
});

// GET /api/qbo/customers — list QBO customers (for mapping UI)
router.get('/customers', requireAdmin, async (req, res) => {
  try {
    const customers = await qbo.listCustomers(req.user.company_id);
    res.json(customers);
  } catch (err) {
    console.error(err);
    const status = err.code === 'qbo_auth_expired' ? 401 : 500;
    res.status(status).json({ error: err.code === 'qbo_auth_expired' ? err.message : 'Server error', code: err.code });
  }
});

// GET /api/qbo/vendors — list QBO vendors (for contractor/subcontractor mapping)
router.get('/vendors', requireAdmin, async (req, res) => {
  try {
    const vendors = await qbo.listVendors(req.user.company_id);
    res.json(vendors);
  } catch (err) {
    console.error(err);
    const status = err.code === 'qbo_auth_expired' ? 401 : 500;
    res.status(status).json({ error: err.code === 'qbo_auth_expired' ? err.message : 'Server error', code: err.code });
  }
});

// PATCH /api/qbo/workers/:id/mapping — save QBO employee or vendor ID for a worker
router.patch('/workers/:id/mapping', requireAdmin, async (req, res) => {
  const { qbo_employee_id, qbo_vendor_id } = req.body;
  try {
    if (qbo_vendor_id !== undefined) {
      await pool.query(
        'UPDATE users SET qbo_vendor_id = $1 WHERE id = $2 AND company_id = $3',
        [qbo_vendor_id || null, req.params.id, req.user.company_id]
      );
    } else {
      await pool.query(
        'UPDATE users SET qbo_employee_id = $1 WHERE id = $2 AND company_id = $3',
        [qbo_employee_id || null, req.params.id, req.user.company_id]
      );
    }
    res.json({ saved: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/qbo/projects/:id/mapping — save QBO customer ID for a project
router.patch('/projects/:id/mapping', requireAdmin, async (req, res) => {
  const { qbo_customer_id } = req.body;
  try {
    await pool.query(
      'UPDATE projects SET qbo_customer_id = $1 WHERE id = $2 AND company_id = $3',
      [qbo_customer_id || null, req.params.id, req.user.company_id]
    );
    res.json({ saved: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/qbo/push — push time entries to QBO for a date range
// Body: { from, to, force } — force=true re-pushes already-synced entries
router.post('/push', requireAdmin, async (req, res) => {
  const { from, to, force } = req.body;
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `SELECT te.*, u.qbo_employee_id, u.qbo_vendor_id, u.worker_type, p.qbo_customer_id,
              u.full_name as worker_name, p.name as project_name
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       LEFT JOIN projects p ON te.project_id = p.id
       WHERE te.company_id = $1
         AND ($2::date IS NULL OR te.work_date >= $2::date)
         AND ($3::date IS NULL OR te.work_date <= $3::date)`,
      [companyId, from || null, to || null]
    );

    const entries = result.rows;
    const skipped = [];
    const pushed = [];
    let alreadySynced = 0;

    for (const entry of entries) {
      // Skip already-synced entries unless force re-push requested
      if (entry.qbo_activity_id && !force) {
        alreadySynced++;
        continue;
      }
      const usesVendor = entry.worker_type === 'contractor' || entry.worker_type === 'subcontractor';
      const mappedId = usesVendor ? entry.qbo_vendor_id : entry.qbo_employee_id;
      if (!mappedId) {
        skipped.push({ entry_id: entry.id, reason: `Worker "${entry.worker_name}" has no QBO mapping` });
        continue;
      }
      if (!entry.qbo_customer_id) {
        skipped.push({ entry_id: entry.id, reason: `Project "${entry.project_name || 'unknown'}" has no QBO mapping` });
        continue;
      }

      // Correct hours: handle midnight-crossing and subtract break minutes
      let ms = new Date(`1970-01-01T${entry.end_time}`) - new Date(`1970-01-01T${entry.start_time}`);
      if (ms < 0) ms += 86400000;
      const hours = Math.max(0, ms / 3600000 - (entry.break_minutes || 0) / 60);
      const workDate = entry.work_date.toISOString().substring(0, 10);

      try {
        const activity = await qbo.pushTimeActivity(companyId, {
          ...(usesVendor ? { vendorId: entry.qbo_vendor_id } : { employeeId: entry.qbo_employee_id }),
          customerId: entry.qbo_customer_id,
          workDate,
          hours,
          description: entry.notes || '',
        });
        // Record the QB activity ID to prevent future duplicates
        await pool.query(
          'UPDATE time_entries SET qbo_activity_id = $1, qbo_synced_at = NOW() WHERE id = $2',
          [activity?.Id || 'synced', entry.id]
        );
        pushed.push(entry.id);
      } catch (pushErr) {
        skipped.push({ entry_id: entry.id, reason: pushErr.message });
      }
    }

    res.json({ pushed: pushed.length, skipped, already_synced: alreadySynced });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/qbo/import/workers — create OpsFloa workers from QB employees/vendors
router.post('/import/workers', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const { workers } = req.body; // [{ display_name, email, qbo_employee_id, qbo_vendor_id, worker_type }]
  if (!Array.isArray(workers) || workers.length === 0) return res.status(400).json({ error: 'workers array required' });

  // Get company default temp password from settings
  const settingsRows = await pool.query('SELECT key, value FROM settings WHERE company_id = $1', [companyId]);
  const settings = applySettingsRows(settingsRows.rows, ADMIN_SETTINGS_DEFAULTS);
  const tempPassword = settings.default_temp_password || crypto.randomBytes(5).toString('hex');
  const hash = await bcrypt.hash(tempPassword, 10);

  const VALID_WORKER_TYPES = ['employee', 'contractor', 'subcontractor', 'owner'];
  const imported = [];
  const skipped = [];

  for (const w of workers) {
    const displayName = (w.display_name || '').trim();
    if (!displayName) { skipped.push({ display_name: displayName, reason: 'Missing name' }); continue; }

    const workerType = VALID_WORKER_TYPES.includes(w.worker_type) ? w.worker_type : 'employee';
    const email = w.email?.trim() || null;

    // Generate username from display name
    const parts = displayName.split(/\s+/);
    const base = ((parts[0]?.[0] || '') + (parts[parts.length - 1] || '')).toLowerCase().replace(/[^a-z0-9]/g, '') || 'worker';
    let username = base;
    let suffix = 2;
    while (true) {
      const conflict = await pool.query('SELECT id FROM users WHERE username = $1 AND company_id = $2', [username, companyId]);
      if (conflict.rowCount === 0) break;
      username = `${base}${suffix++}`;
    }

    try {
      const result = await pool.query(
        `INSERT INTO users (company_id, username, password_hash, full_name, role, language, email, email_confirmed, must_change_password, worker_type, qbo_employee_id, qbo_vendor_id)
         VALUES ($1, $2, $3, $4, 'worker', 'English', $5, true, true, $6, $7, $8)
         RETURNING id, username, full_name, worker_type`,
        [companyId, username, hash, displayName, email, workerType,
         w.qbo_employee_id || null, w.qbo_vendor_id || null]
      );
      imported.push({ ...result.rows[0], temp_password: tempPassword });
    } catch (err) {
      skipped.push({ display_name: displayName, reason: err.message });
    }
  }

  res.json({ imported, skipped, temp_password: tempPassword });
});

// POST /api/qbo/import/projects — create OpsFloa projects from QB customers
router.post('/import/projects', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const { projects } = req.body; // [{ name, qbo_customer_id }]
  if (!Array.isArray(projects) || projects.length === 0) return res.status(400).json({ error: 'projects array required' });

  const imported = [];
  const skipped = [];

  for (const p of projects) {
    const name = (p.name || '').trim();
    if (!name) { skipped.push({ name, reason: 'Missing name' }); continue; }
    try {
      const result = await pool.query(
        `INSERT INTO projects (company_id, name, wage_type, qbo_customer_id)
         VALUES ($1, $2, 'regular', $3)
         RETURNING id, name, qbo_customer_id`,
        [companyId, name, p.qbo_customer_id || null]
      );
      imported.push(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') skipped.push({ name, reason: 'Project with this name already exists' });
      else skipped.push({ name, reason: err.message });
    }
  }

  res.json({ imported, skipped });
});

module.exports = router;
module.exports.oauthCallback = oauthCallback;
