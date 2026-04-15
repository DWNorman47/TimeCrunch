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
const { encrypt, decrypt } = require('../services/encryption');
const { logAudit } = require('../auditLog');

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

// ────────────────────────────────────────────────────────────────────────────
// SSN last-4 (encrypted, write-mostly)
// ────────────────────────────────────────────────────────────────────────────
// We store only the last 4 digits, encrypted with the same AES-GCM key used
// for QBO refresh tokens. The GET endpoint returns ONLY a boolean "hasSsn"
// — we never send the value back to the client after it's been set, and
// never log it. To change the value, admins re-enter the last 4 digits.

// GET /api/certified-payroll/workers/:id/ssn — presence check only
router.get('/workers/:id/ssn', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT ssn_last4_enc FROM users WHERE id = $1 AND company_id = $2',
      [req.params.id, req.user.company_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Worker not found' });
    res.json({ hasSsn: !!rows[0].ssn_last4_enc });
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/certified-payroll/workers/:id/ssn { ssn_last4 } — set or clear
router.put('/workers/:id/ssn', requireAdmin, async (req, res) => {
  const raw = String(req.body.ssn_last4 || '').replace(/\D/g, '');
  try {
    const ok = await pool.query('SELECT id FROM users WHERE id = $1 AND company_id = $2', [req.params.id, req.user.company_id]);
    if (ok.rowCount === 0) return res.status(404).json({ error: 'Worker not found' });

    if (!raw) {
      // Clearing the value
      await pool.query('UPDATE users SET ssn_last4_enc = NULL WHERE id = $1 AND company_id = $2', [req.params.id, req.user.company_id]);
      await logAudit(req.user.company_id, req.user.id, req.user.full_name, 'worker.ssn_cleared', 'worker', req.params.id, null);
      return res.json({ hasSsn: false });
    }

    if (raw.length !== 4) return res.status(400).json({ error: 'SSN must be exactly 4 digits (last 4 only)' });

    const ciphertext = encrypt(raw);
    await pool.query(
      'UPDATE users SET ssn_last4_enc = $1 WHERE id = $2 AND company_id = $3',
      [ciphertext, req.params.id, req.user.company_id]
    );
    // Audit trail records that it was set (never the value).
    await logAudit(req.user.company_id, req.user.id, req.user.full_name, 'worker.ssn_set', 'worker', req.params.id, null);
    res.json({ hasSsn: true });
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper for the report generator — not exposed as a route.
async function loadSsnLast4(userIds) {
  if (!userIds.length) return {};
  const { rows } = await pool.query(
    'SELECT id, ssn_last4_enc FROM users WHERE id = ANY($1::int[])',
    [userIds]
  );
  const out = {};
  for (const r of rows) {
    if (r.ssn_last4_enc) {
      try { out[r.id] = decrypt(r.ssn_last4_enc); }
      catch (e) { logger.warn({ user_id: r.id, err: e.message }, 'ssn_decrypt_failed'); }
    }
  }
  return out;
}

module.exports = router;
module.exports.requireCertifiedPayrollAddon = requireCertifiedPayrollAddon;
module.exports.loadSsnLast4 = loadSsnLast4;
