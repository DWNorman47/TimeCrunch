const router = require('express').Router();
const pool = require('../db');
const logger = require('../logger');
const jwt = require('jsonwebtoken');
const { requireSuperAdmin } = require('../middleware/auth');

// GET /superadmin/client-errors — browser-reported errors, newest first
router.get('/client-errors', requireSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const since = req.query.since; // ISO date string, optional
    const params = [];
    let where = '';
    if (since) {
      params.push(since);
      where = `WHERE ce.created_at >= $${params.length}`;
    }
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT ce.id, ce.created_at, ce.company_id, ce.user_id, ce.kind, ce.message,
              ce.stack, ce.url, ce.user_agent, ce.app_version, ce.ip,
              u.full_name AS user_name, c.name AS company_name
       FROM client_errors ce
       LEFT JOIN users u ON u.id = ce.user_id
       LEFT JOIN companies c ON c.id = ce.company_id
       ${where}
       ORDER BY ce.created_at DESC
       LIMIT $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /superadmin/companies — all companies with usage stats
router.get('/companies', requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.slug, c.active, c.created_at, c.plan, c.subscription_status,
              c.trial_ends_at, c.mrr_cents, c.affiliate_id, c.addon_qbo, c.addon_certified_payroll,
              a.name AS affiliate_name,
              COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'worker' AND u.active = true) AS worker_count,
              COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'admin' AND u.active = true) AS admin_count,
              COUNT(DISTINCT te.id) AS entry_count,
              MAX(te.created_at) AS last_entry_at
       FROM companies c
       LEFT JOIN users u ON u.company_id = c.id
       LEFT JOIN time_entries te ON te.company_id = c.id
       LEFT JOIN affiliates a ON c.affiliate_id = a.id
       GROUP BY c.id, c.name, c.slug, c.active, c.created_at, c.plan, c.subscription_status,
                c.trial_ends_at, c.mrr_cents, c.affiliate_id, c.addon_qbo, c.addon_certified_payroll, a.name
       ORDER BY c.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /superadmin/companies/:id — update any combination of fields
router.patch('/companies/:id', requireSuperAdmin, async (req, res) => {
  const { active, affiliate_id, subscription_status, plan, name, trial_ends_at, addon_qbo, addon_certified_payroll } = req.body;
  if (
    active === undefined && affiliate_id === undefined &&
    subscription_status === undefined && plan === undefined &&
    name === undefined && trial_ends_at === undefined &&
    addon_qbo === undefined && addon_certified_payroll === undefined
  ) return res.status(400).json({ error: 'No fields to update' });

  const VALID_STATUSES = ['trial', 'active', 'past_due', 'canceled', 'trial_expired', 'exempt'];
  const VALID_PLANS = ['free', 'starter', 'business'];
  if (subscription_status !== undefined && !VALID_STATUSES.includes(subscription_status))
    return res.status(400).json({ error: 'Invalid subscription_status' });
  if (plan !== undefined && !VALID_PLANS.includes(plan))
    return res.status(400).json({ error: 'Invalid plan' });
  if (name !== undefined && !name?.trim())
    return res.status(400).json({ error: 'Name cannot be empty' });

  try {
    const fields = [];
    const values = [];
    let idx = 1;
    if (active !== undefined)              { fields.push(`active = $${idx++}`);               values.push(active); }
    if (affiliate_id !== undefined)        { fields.push(`affiliate_id = $${idx++}`);         values.push(affiliate_id || null); }
    if (subscription_status !== undefined) { fields.push(`subscription_status = $${idx++}`);  values.push(subscription_status); }
    if (plan !== undefined)                { fields.push(`plan = $${idx++}`);                 values.push(plan); }
    if (name !== undefined)                { fields.push(`name = $${idx++}`);                 values.push(name.trim()); }
    if (trial_ends_at !== undefined)       { fields.push(`trial_ends_at = $${idx++}`);        values.push(trial_ends_at || null); }
    if (addon_qbo !== undefined)           { fields.push(`addon_qbo = $${idx++}`);            values.push(!!addon_qbo); }
    if (addon_certified_payroll !== undefined) { fields.push(`addon_certified_payroll = $${idx++}`); values.push(!!addon_certified_payroll); }
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE companies SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, name, slug, active, affiliate_id, subscription_status, plan, trial_ends_at, addon_qbo, addon_certified_payroll`,
      values
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Company not found' });
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /superadmin/companies/:id — hard delete all company data in a transaction
router.delete('/companies/:id', requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const check = await pool.query('SELECT name FROM companies WHERE id = $1', [id]);
  if (check.rowCount === 0) return res.status(404).json({ error: 'Company not found' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Delete leaf tables first (those with FKs pointing to other company tables)
    await client.query(`DELETE FROM field_report_photos WHERE field_report_id IN (SELECT id FROM field_reports WHERE company_id = $1)`, [id]);
    await client.query(`DELETE FROM time_entry_comments  WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM equipment_hours      WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM company_chat         WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM incident_reports     WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM sub_reports          WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM rfis                 WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM inspections          WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM inspection_templates WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM safety_checklist_submissions WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM safety_checklist_templates   WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM field_reports    WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM daily_reports    WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM punchlist_items  WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM safety_talks     WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM audit_log        WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM shifts           WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM time_entries     WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM active_clock     WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM pay_periods      WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM inbox            WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM push_subscriptions WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM equipment_items  WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM projects         WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM settings         WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM users            WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM companies        WHERE id = $1`, [id]);
    await client.query('COMMIT');
    res.json({ deleted: true, name: check.rows[0].name });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// POST /superadmin/companies/:id/impersonate — return a short-lived JWT for an admin of this company
router.post('/companies/:id/impersonate', requireSuperAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT u.*, c.name AS company_name
       FROM users u
       JOIN companies c ON c.id = u.company_id
       WHERE u.company_id = $1 AND u.role IN ('admin','super_admin') AND u.active = true
       ORDER BY u.created_at ASC LIMIT 1`,
      [req.params.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'No active admin found for this company' });
    const user = r.rows[0];
    const token = jwt.sign(
      {
        id: user.id, username: user.username, role: user.role,
        full_name: user.full_name, invoice_name: user.invoice_name || null,
        language: user.language, company_id: user.company_id,
        company_name: user.company_name,
        admin_permissions: user.admin_permissions || null,
        worker_access_ids: null,
      },
      process.env.JWT_SECRET,
      { expiresIn: '4h' }
    );
    res.json({ token, full_name: user.full_name, company_name: user.company_name });
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /superadmin/companies/:id/users — all users for a company
router.get('/companies/:id/users', requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, full_name, email, role, active, created_at
       FROM users WHERE company_id = $1 ORDER BY role, full_name`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Affiliates ──────────────────────────────────────────────────────────────

// GET /superadmin/affiliates — list with commission summary
router.get('/affiliates', requireSuperAdmin, async (req, res) => {
  try {
    const [affiliateRows, companyRows] = await Promise.all([
      pool.query(`
        SELECT a.*,
               COUNT(c.id) AS company_count,
               COALESCE(SUM(c.mrr_cents) FILTER (WHERE c.subscription_status = 'active'), 0) AS active_mrr_cents
        FROM affiliates a
        LEFT JOIN companies c ON c.affiliate_id = a.id
        GROUP BY a.id
        ORDER BY a.name
      `),
      pool.query(`
        SELECT c.id, c.name, c.slug, c.plan, c.subscription_status, c.mrr_cents, c.affiliate_id, c.created_at
        FROM companies c
        WHERE c.affiliate_id IS NOT NULL
        ORDER BY c.created_at DESC
      `),
    ]);
    const companiesByAffiliate = {};
    companyRows.rows.forEach(c => {
      if (!companiesByAffiliate[c.affiliate_id]) companiesByAffiliate[c.affiliate_id] = [];
      companiesByAffiliate[c.affiliate_id].push(c);
    });
    const affiliates = affiliateRows.rows.map(a => ({
      ...a,
      companies: companiesByAffiliate[a.id] || [],
    }));
    res.json(affiliates);
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /superadmin/affiliates
router.post('/affiliates', requireSuperAdmin, async (req, res) => {
  const name  = req.body.name?.trim();
  const email = req.body.email?.trim() || null;
  const phone = req.body.phone?.trim() || null;
  const notes = req.body.notes?.trim() || null;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const result = await pool.query(
      `INSERT INTO affiliates (name, email, phone, notes) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, email, phone, notes]
    );
    res.status(201).json({ ...result.rows[0], company_count: 0, active_mrr_cents: 0, companies: [] });
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /superadmin/affiliates/:id
router.patch('/affiliates/:id', requireSuperAdmin, async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM affiliates WHERE id = $1', [req.params.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    const a = existing.rows[0];
    const result = await pool.query(
      `UPDATE affiliates SET name=$1, email=$2, phone=$3, notes=$4 WHERE id=$5 RETURNING *`,
      [
        req.body.name !== undefined ? (req.body.name?.trim() || a.name) : a.name,
        req.body.email !== undefined ? (req.body.email?.trim() || null) : a.email,
        req.body.phone !== undefined ? (req.body.phone?.trim() || null) : a.phone,
        req.body.notes !== undefined ? (req.body.notes?.trim() || null) : a.notes,
        req.params.id,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /superadmin/affiliates/:id
router.delete('/affiliates/:id', requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM affiliates WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;