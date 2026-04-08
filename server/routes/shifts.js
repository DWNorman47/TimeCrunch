const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendPushToUser } = require('../push');

// GET /admin/shifts?from=&to= — all company shifts in range
router.get('/admin', requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `SELECT s.*, u.full_name as worker_name, p.name as project_name
       FROM shifts s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN projects p ON s.project_id = p.id
       WHERE s.company_id = $1
         AND ($2::date IS NULL OR s.shift_date >= $2::date)
         AND ($3::date IS NULL OR s.shift_date <= $3::date)
       ORDER BY s.shift_date ASC, s.start_time ASC
       LIMIT 2000`,
      [companyId, from || null, to || null]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /admin/shifts — create a shift
router.post('/admin', requireAdmin, async (req, res) => {
  const { user_id, project_id, shift_date, start_time, end_time, notes } = req.body;
  if (!user_id || !shift_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'user_id, shift_date, start_time, end_time required' });
  }
  const companyId = req.user.company_id;
  try {
    const workerCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND company_id = $2 AND active = true',
      [user_id, companyId]
    );
    if (workerCheck.rowCount === 0) return res.status(400).json({ error: 'Worker not found' });
    const full = await pool.query(
      `WITH inserted AS (
         INSERT INTO shifts (company_id, user_id, project_id, shift_date, start_time, end_time, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
       )
       SELECT s.*, u.full_name as worker_name, p.name as project_name
       FROM inserted s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN projects p ON s.project_id = p.id`,
      [companyId, user_id, project_id || null, shift_date, start_time, end_time, notes || null]
    );
    const shift = full.rows[0];
    sendPushToUser(user_id, {
      title: 'New shift assigned',
      body: `${shift.shift_date} · ${shift.start_time.substring(0, 5)}–${shift.end_time.substring(0, 5)}${shift.project_name ? ' · ' + shift.project_name : ''}`,
      url: '/dashboard',
    });
    res.status(201).json(shift);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /admin/shifts/:id — edit a shift
router.patch('/admin/:id', requireAdmin, async (req, res) => {
  const { project_id, shift_date, start_time, end_time, notes } = req.body;
  if (!shift_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'shift_date, start_time, end_time required' });
  }
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `UPDATE shifts SET project_id = $1, shift_date = $2, start_time = $3, end_time = $4, notes = $5
       WHERE id = $6 AND company_id = $7 RETURNING *`,
      [project_id || null, shift_date, start_time, end_time, notes || null, req.params.id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Shift not found' });
    const full = await pool.query(
      `SELECT s.*, u.full_name as worker_name, p.name as project_name
       FROM shifts s JOIN users u ON s.user_id = u.id LEFT JOIN projects p ON s.project_id = p.id
       WHERE s.id = $1`, [req.params.id]
    );
    const shift = full.rows[0];
    sendPushToUser(shift.user_id, {
      title: 'Shift updated',
      body: `${shift.shift_date?.toString().substring(0,10)} · ${start_time.substring(0,5)}–${end_time.substring(0,5)}`,
      url: '/dashboard',
    });
    res.json(shift);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /admin/shifts/:id
router.delete('/admin/:id', requireAdmin, async (req, res) => {
  try {
    const full = await pool.query(
      `SELECT s.*, u.full_name as worker_name, p.name as project_name
       FROM shifts s JOIN users u ON s.user_id = u.id LEFT JOIN projects p ON s.project_id = p.id
       WHERE s.id = $1 AND s.company_id = $2`,
      [req.params.id, req.user.company_id]
    );
    if (full.rowCount === 0) return res.status(404).json({ error: 'Shift not found' });
    const shift = full.rows[0];
    await pool.query('DELETE FROM shifts WHERE id = $1', [req.params.id]);
    sendPushToUser(shift.user_id, {
      title: 'Shift cancelled',
      body: `${shift.shift_date?.toString().substring(0, 10)} · ${shift.start_time.substring(0, 5)}–${shift.end_time.substring(0, 5)}${shift.project_name ? ' · ' + shift.project_name : ''}`,
      url: '/dashboard',
    });
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /shifts/mine — worker's upcoming shifts
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const co = await pool.query(
      'SELECT plan, subscription_status, trial_ends_at FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    const { plan, subscription_status, trial_ends_at } = co.rows[0] || {};
    const trialActive = subscription_status === 'trial' && (!trial_ends_at || new Date(trial_ends_at) >= new Date());
    const isFree = plan === 'free' && !trialActive;
    // Free plan: current week only (Mon–Sun). Starter+: any future shift.
    const dateClause = isFree
      ? `AND s.shift_date >= date_trunc('week', CURRENT_DATE) AND s.shift_date < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'`
      : `AND s.shift_date >= CURRENT_DATE`;

    const result = await pool.query(
      `SELECT s.*, p.name as project_name
       FROM shifts s LEFT JOIN projects p ON s.project_id = p.id
       WHERE s.user_id = $1 ${dateClause}
       ORDER BY s.shift_date ASC, s.start_time ASC
       LIMIT 14`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
