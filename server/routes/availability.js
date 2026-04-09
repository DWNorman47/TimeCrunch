const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET /availability/mine — worker's own availability
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT day_of_week, start_time, end_time FROM worker_availability
       WHERE user_id = $1 ORDER BY day_of_week`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PUT /availability — worker replaces their full availability
router.put('/', requireAuth, async (req, res) => {
  const { availability } = req.body; // [{ day_of_week, start_time, end_time }]
  if (!Array.isArray(availability)) return res.status(400).json({ error: 'availability must be an array' });
  const userId = req.user.id;
  const companyId = req.user.company_id;
  try {
    await pool.query('DELETE FROM worker_availability WHERE user_id = $1', [userId]);
    if (availability.length > 0) {
      const values = availability.map((_, i) =>
        `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`
      ).join(', ');
      const params = availability.flatMap(a => [userId, companyId, a.day_of_week, a.start_time, a.end_time]);
      await pool.query(
        `INSERT INTO worker_availability (user_id, company_id, day_of_week, start_time, end_time) VALUES ${values}`,
        params
      );
    }
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
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
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
