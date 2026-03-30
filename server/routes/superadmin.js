const router = require('express').Router();
const pool = require('../db');
const { requireSuperAdmin } = require('../middleware/auth');

// GET /superadmin/companies — all companies with usage stats
router.get('/companies', requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.slug, c.active, c.created_at, c.plan, c.subscription_status,
              c.mrr_cents, c.affiliate_id,
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
                c.mrr_cents, c.affiliate_id, a.name
       ORDER BY c.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /superadmin/companies/:id — activate/deactivate or assign affiliate
router.patch('/companies/:id', requireSuperAdmin, async (req, res) => {
  const { active, affiliate_id } = req.body;
  if (active === undefined && affiliate_id === undefined)
    return res.status(400).json({ error: 'active or affiliate_id required' });
  try {
    const fields = [];
    const values = [];
    let idx = 1;
    if (active !== undefined) { fields.push(`active = $${idx++}`); values.push(active); }
    if (affiliate_id !== undefined) { fields.push(`affiliate_id = $${idx++}`); values.push(affiliate_id || null); }
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE companies SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, slug, active, affiliate_id`,
      values
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Company not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
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
    console.error(err);
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
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /superadmin/affiliates
router.post('/affiliates', requireSuperAdmin, async (req, res) => {
  const { name, email, phone, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  try {
    const result = await pool.query(
      `INSERT INTO affiliates (name, email, phone, notes) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name.trim(), email || null, phone || null, notes || null]
    );
    res.status(201).json({ ...result.rows[0], company_count: 0, active_mrr_cents: 0, companies: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /superadmin/affiliates/:id
router.patch('/affiliates/:id', requireSuperAdmin, async (req, res) => {
  const { name, email, phone, notes } = req.body;
  try {
    const existing = await pool.query('SELECT * FROM affiliates WHERE id = $1', [req.params.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    const a = existing.rows[0];
    const result = await pool.query(
      `UPDATE affiliates SET name=$1, email=$2, phone=$3, notes=$4 WHERE id=$5 RETURNING *`,
      [name?.trim() ?? a.name, email !== undefined ? email : a.email,
       phone !== undefined ? phone : a.phone, notes !== undefined ? notes : a.notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
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
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
