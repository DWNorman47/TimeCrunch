/**
 * Team directory — company-wide list of active workers and admins visible
 * to every authenticated user. The Manage surface (creating, editing,
 * deleting workers) still lives under /api/admin/workers.
 *
 * Returns only non-sensitive fields: name, role, classification, language,
 * must_change_password (so the directory can dim "not activated yet"
 * entries). No wages, SSN, email, phone, or documents.
 */

const router = require('express').Router();
const pool = require('../db');
const logger = require('../logger');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, full_name, invoice_name, username, role, language, worker_type,
              classification, must_change_password, created_at
         FROM users
        WHERE company_id = $1 AND active = true
        ORDER BY role DESC, full_name
        LIMIT 500`,
      [req.user.company_id]
    );
    res.json({ team: rows });
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
