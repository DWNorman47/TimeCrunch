/**
 * Certified Payroll endpoints. All routes require the addon (or an exempt/
 * trial subscription); list-style endpoints admins need for dropdowns
 * (like job classifications) are exposed a level looser so admins can
 * configure even when the addon is off.
 */

const router = require('express').Router();
const pool   = require('../db');
const logger = require('../logger');
const { requireAuth, requireAdmin, requireCertifiedPayrollAddon } = require('../middleware/auth');
const { getAdvancedSettings } = require('./admin');

// GET /api/certified-payroll/classifications — resolved list of job classes
// (default ∖ suppressed ∪ custom). Admins use this for dropdowns whether or
// not the addon is on; a company not on the addon still benefits from
// having classifications pre-tagged on workers for future use.
router.get('/classifications', requireAuth, async (req, res) => {
  try {
    const all = await getAdvancedSettings(req.user.company_id);
    const cfg = all.job_classifications;
    const active = [
      ...cfg.defaults.filter(c => !cfg.suppressed.includes(c)),
      ...cfg.custom,
    ];
    const known = [...cfg.defaults, ...cfg.custom];
    res.json({ active, known });
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

const FRINGE_CATEGORIES = ['health', 'pension', 'vacation', 'apprenticeship', 'other'];

// GET /api/certified-payroll/workers/:id/fringes — per-worker fringe rates
router.get('/workers/:id/fringes', requireAdmin, async (req, res) => {
  try {
    // Make sure the target user belongs to this company before returning PII-adjacent data.
    const ok = await pool.query('SELECT 1 FROM users WHERE id = $1 AND company_id = $2', [req.params.id, req.user.company_id]);
    if (ok.rowCount === 0) return res.status(404).json({ error: 'Worker not found' });

    const { rows } = await pool.query(
      'SELECT category, rate_per_hour, notes FROM worker_fringes WHERE user_id = $1 ORDER BY category',
      [req.params.id]
    );
    res.json({ fringes: rows });
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/certified-payroll/workers/:id/fringes — upsert the full set
router.put('/workers/:id/fringes', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const userId = req.params.id;
  const incoming = Array.isArray(req.body.fringes) ? req.body.fringes : [];

  try {
    const ok = await pool.query('SELECT 1 FROM users WHERE id = $1 AND company_id = $2', [userId, companyId]);
    if (ok.rowCount === 0) return res.status(404).json({ error: 'Worker not found' });

    // Validate: only known categories, non-negative numbers, reasonable upper bound.
    const rows = [];
    for (const f of incoming) {
      if (!FRINGE_CATEGORIES.includes(f.category)) continue;
      const rate = parseFloat(f.rate_per_hour);
      if (isNaN(rate) || rate < 0 || rate > 1000) continue;
      rows.push({ category: f.category, rate, notes: typeof f.notes === 'string' ? f.notes.slice(0, 500) : null });
    }

    // Upsert each category; delete zero-rate categories with no notes so the
    // table only carries non-trivial rows.
    for (const row of rows) {
      if (row.rate === 0 && !row.notes) {
        await pool.query('DELETE FROM worker_fringes WHERE user_id = $1 AND category = $2', [userId, row.category]);
        continue;
      }
      await pool.query(
        `INSERT INTO worker_fringes (user_id, company_id, category, rate_per_hour, notes, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id, category) DO UPDATE
           SET rate_per_hour = EXCLUDED.rate_per_hour,
               notes = EXCLUDED.notes,
               updated_at = NOW()`,
        [userId, companyId, row.category, row.rate, row.notes]
      );
    }

    const fresh = await pool.query(
      'SELECT category, rate_per_hour, notes FROM worker_fringes WHERE user_id = $1 ORDER BY category',
      [userId]
    );
    res.json({ fringes: fresh.rows });
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
module.exports.requireCertifiedPayrollAddon = requireCertifiedPayrollAddon;
