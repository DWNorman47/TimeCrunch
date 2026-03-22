const router = require('express').Router();
const pool = require('../db');
const crypto = require('crypto');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const qbo = require('../services/qbo');
const { encrypt } = require('../services/encryption');

// GET /api/qbo/status — connection status for this company
router.get('/status', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT qbo_realm_id, qbo_connected_at, qbo_token_expires_at, qbo_disconnected FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    const row = result.rows[0];
    res.json({
      connected: !!row?.qbo_realm_id,
      disconnected: row?.qbo_disconnected || false,
      connected_at: row?.qbo_connected_at || null,
      token_expires_at: row?.qbo_token_expires_at || null,
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
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// GET /api/qbo/customers — list QBO customers (for mapping UI)
router.get('/customers', requireAdmin, async (req, res) => {
  try {
    const customers = await qbo.listCustomers(req.user.company_id);
    res.json(customers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// PATCH /api/qbo/workers/:id/mapping — save QBO employee ID for a worker
router.patch('/workers/:id/mapping', requireAdmin, async (req, res) => {
  const { qbo_employee_id } = req.body;
  try {
    await pool.query(
      'UPDATE users SET qbo_employee_id = $1 WHERE id = $2 AND company_id = $3',
      [qbo_employee_id || null, req.params.id, req.user.company_id]
    );
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
router.post('/push', requireAdmin, async (req, res) => {
  const { from, to } = req.body;
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `SELECT te.*, u.qbo_employee_id, p.qbo_customer_id,
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

    for (const entry of entries) {
      if (!entry.qbo_employee_id) {
        skipped.push({ entry_id: entry.id, reason: `Worker "${entry.worker_name}" has no QBO mapping` });
        continue;
      }
      if (!entry.qbo_customer_id) {
        skipped.push({ entry_id: entry.id, reason: `Project "${entry.project_name || 'unknown'}" has no QBO mapping` });
        continue;
      }
      const start = new Date(`1970-01-01T${entry.start_time}`);
      const end = new Date(`1970-01-01T${entry.end_time}`);
      const hours = (end - start) / 3600000;
      const workDate = entry.work_date.toISOString().substring(0, 10);

      try {
        await qbo.pushTimeActivity(companyId, {
          employeeId: entry.qbo_employee_id,
          customerId: entry.qbo_customer_id,
          workDate,
          hours,
          description: entry.notes || '',
        });
        pushed.push(entry.id);
      } catch (pushErr) {
        skipped.push({ entry_id: entry.id, reason: pushErr.message });
      }
    }

    res.json({ pushed: pushed.length, skipped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
module.exports.oauthCallback = oauthCallback;
