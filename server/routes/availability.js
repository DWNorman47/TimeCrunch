const router = require('express').Router();
const pool = require('../db');
const rateLimit = require('express-rate-limit');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Availability changes rarely — 30/hour is orders of magnitude above any
// legitimate user pattern. Mostly guards against scripted churn of the table.
const availWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: req => String(req.user?.id || req.ip),
  message: { error: 'Too many availability updates. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /availability/mine — worker's own availability
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT day_of_week, start_time, end_time FROM worker_availability
       WHERE user_id = $1 ORDER BY day_of_week`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { req.log.error({ err }, 'route error'); res.status(500).json({ error: 'Server error' }); }
});

// PUT /availability — worker replaces their full availability
router.put('/', requireAuth, availWriteLimiter, async (req, res) => {
  const { availability } = req.body; // [{ day_of_week, start_time, end_time }]
  if (!Array.isArray(availability)) return res.status(400).json({ error: 'availability must be an array' });
  if (availability.length > 7) return res.status(400).json({ error: 'Maximum 7 availability entries (one per day)' });

  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const a of availability) {
    const dow = parseInt(a.day_of_week);
    if (isNaN(dow) || dow < 0 || dow > 6) return res.status(400).json({ error: 'day_of_week must be 0–6' });
    if (!TIME_RE.test(a.start_time)) return res.status(400).json({ error: 'start_time must be HH:MM' });
    if (!TIME_RE.test(a.end_time)) return res.status(400).json({ error: 'end_time must be HH:MM' });
    if (a.start_time >= a.end_time) return res.status(400).json({ error: 'start_time must be before end_time' });
  }
  // Deduplicate by day_of_week (last one wins) to avoid UNIQUE constraint errors
  const seen = new Map();
  for (const a of availability) seen.set(parseInt(a.day_of_week), a);
  const deduped = [...seen.values()];

  const userId = req.user.id;
  const companyId = req.user.company_id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM worker_availability WHERE user_id = $1 AND company_id = $2', [userId, companyId]);
    if (deduped.length > 0) {
      const values = deduped.map((_, i) =>
        `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`
      ).join(', ');
      const params = deduped.flatMap(a => [userId, companyId, parseInt(a.day_of_week), a.start_time, a.end_time]);
      await client.query(
        `INSERT INTO worker_availability (user_id, company_id, day_of_week, start_time, end_time) VALUES ${values}`,
        params
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    req.log.error({ err }, 'route error');
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// GET /availability/admin — all workers' availability for this company
router.get('/admin', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT user_id, day_of_week, start_time, end_time
       FROM worker_availability WHERE company_id = $1`,
      [req.user.company_id]
    );
    res.json(result.rows);
  } catch (err) { req.log.error({ err }, 'route error'); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
