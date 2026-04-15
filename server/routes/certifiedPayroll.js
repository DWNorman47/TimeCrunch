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

module.exports = router;
module.exports.requireCertifiedPayrollAddon = requireCertifiedPayrollAddon;
