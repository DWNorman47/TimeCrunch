const router = require('express').Router();
const pool = require('../db');
const { requireSuperAdmin } = require('../middleware/auth');

// GET /superadmin/companies — all companies with usage stats
router.get('/companies', requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.slug, c.active, c.created_at,
              COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'worker' AND u.active = true) as worker_count,
              COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'admin' AND u.active = true) as admin_count,
              COUNT(DISTINCT te.id) as entry_count,
              MAX(te.created_at) as last_entry_at
       FROM companies c
       LEFT JOIN users u ON u.company_id = c.id
       LEFT JOIN time_entries te ON te.company_id = c.id
       GROUP BY c.id, c.name, c.slug, c.active, c.created_at
       ORDER BY c.created_at DESC`,
      []
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /superadmin/companies/:id — activate or deactivate
router.patch('/companies/:id', requireSuperAdmin, async (req, res) => {
  const { active } = req.body;
  if (typeof active !== 'boolean') return res.status(400).json({ error: 'active (boolean) required' });
  try {
    const result = await pool.query(
      'UPDATE companies SET active = $1 WHERE id = $2 RETURNING id, name, slug, active, created_at',
      [active, req.params.id]
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

module.exports = router;
