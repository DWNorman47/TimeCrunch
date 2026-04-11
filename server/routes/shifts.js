const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendPushToUser, sendPushToCompanyAdmins } = require('../push');
const { createInboxItem, createInboxItemBatch } = require('./inbox');

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
       LIMIT 200`,
      [companyId, from || null, to || null]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /admin/shifts — create a shift
router.post('/admin', requireAdmin, async (req, res) => {
  const { user_id, project_id, shift_date, start_time, end_time, recurrence_group_id } = req.body;
  const notes = req.body.notes?.trim() || null;
  if (!user_id || !shift_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'user_id, shift_date, start_time, end_time required' });
  }
  if (notes && notes.length > 500) return res.status(400).json({ error: 'notes too long (max 500 characters)' });
  const companyId = req.user.company_id;
  try {
    const workerCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND company_id = $2 AND active = true',
      [user_id, companyId]
    );
    if (workerCheck.rowCount === 0) return res.status(400).json({ error: 'Worker not found' });
    const full = await pool.query(
      `WITH inserted AS (
         INSERT INTO shifts (company_id, user_id, project_id, shift_date, start_time, end_time, notes, recurrence_group_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
       )
       SELECT s.*, u.full_name as worker_name, p.name as project_name
       FROM inserted s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN projects p ON s.project_id = p.id`,
      [companyId, user_id, project_id || null, shift_date, start_time, end_time, notes, recurrence_group_id || null]
    );
    const shift = full.rows[0];
    const shiftBody = `${shift.shift_date} · ${shift.start_time.substring(0, 5)}–${shift.end_time.substring(0, 5)}${shift.project_name ? ' · ' + shift.project_name : ''}`;
    sendPushToUser(user_id, { title: 'New shift assigned', body: shiftBody, url: '/dashboard' });
    createInboxItem(user_id, companyId, 'shift_assigned', 'New shift assigned', shiftBody, '/dashboard#schedule');
    res.status(201).json(shift);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /admin/shifts/:id — edit a shift
router.patch('/admin/:id', requireAdmin, async (req, res) => {
  const { project_id, shift_date, start_time, end_time } = req.body;
  const notes = req.body.notes?.trim() || null;
  if (!shift_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'shift_date, start_time, end_time required' });
  }
  if (notes && notes.length > 500) return res.status(400).json({ error: 'notes too long (max 500 characters)' });
  const clientUpdatedAt = req.body.updated_at || null;
  const companyId = req.user.company_id;
  try {
    if (clientUpdatedAt) {
      const cur = await pool.query('SELECT updated_at FROM shifts WHERE id=$1 AND company_id=$2', [req.params.id, companyId]);
      if (!cur.rows.length) return res.status(404).json({ error: 'Shift not found' });
      if (new Date(cur.rows[0].updated_at).getTime() !== new Date(clientUpdatedAt).getTime()) {
        return res.status(409).json({ error: 'conflict' });
      }
    }
    const result = await pool.query(
      `UPDATE shifts SET project_id = $1, shift_date = $2, start_time = $3, end_time = $4, notes = $5, updated_at = NOW()
       WHERE id = $6 AND company_id = $7 RETURNING *`,
      [project_id || null, shift_date, start_time, end_time, notes, req.params.id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Shift not found' });
    const full = await pool.query(
      `SELECT s.*, u.full_name as worker_name, p.name as project_name
       FROM shifts s JOIN users u ON s.user_id = u.id LEFT JOIN projects p ON s.project_id = p.id
       WHERE s.id = $1`, [req.params.id]
    );
    const shift = full.rows[0];
    const updBody = `${shift.shift_date?.toString().substring(0,10)} · ${start_time.substring(0,5)}–${end_time.substring(0,5)}`;
    sendPushToUser(shift.user_id, { title: 'Shift updated', body: updBody, url: '/dashboard' });
    createInboxItem(shift.user_id, req.user.company_id, 'shift_updated', 'Shift updated', updBody, '/dashboard#schedule');
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
    const cancelBody = `${shift.shift_date?.toString().substring(0, 10)} · ${shift.start_time.substring(0, 5)}–${shift.end_time.substring(0, 5)}${shift.project_name ? ' · ' + shift.project_name : ''}`;
    sendPushToUser(shift.user_id, { title: 'Shift cancelled', body: cancelBody, url: '/dashboard' });
    createInboxItem(shift.user_id, req.user.company_id, 'shift_cancelled', 'Shift cancelled', cancelBody, '/dashboard#schedule');
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /shifts/:id/cant-make-it — worker flags they can't attend
router.patch('/:id/cant-make-it', requireAuth, async (req, res) => {
  const { cant_make_it, note } = req.body;
  try {
    const result = await pool.query(
      `UPDATE shifts SET cant_make_it = $1, cant_make_it_note = $2
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [!!cant_make_it, note?.trim() || null, req.params.id, req.user.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Shift not found' });
    const shift = result.rows[0];
    if (cant_make_it) {
      const dateStr = shift.shift_date?.toString().substring(0, 10) || '';
      const timeStr = shift.start_time?.substring(0, 5) || '';
      const cantBody = `${req.user.full_name} can't make their shift on ${dateStr} · ${timeStr}`;
      sendPushToCompanyAdmins(req.user.company_id, {
        title: `${req.user.full_name} can't make their shift`,
        body: `${dateStr} · ${timeStr}`,
        url: '/timeclock#manage',
      });
      const adminIds = await pool.query(
        `SELECT id FROM users WHERE company_id = $1 AND role = 'admin' AND active = true`,
        [req.user.company_id]
      );
      createInboxItemBatch(adminIds.rows.map(a => a.id), req.user.company_id, 'shift_cantmake',
        'Worker unavailable for shift', cantBody, '/timeclock#manage');
    }
    res.json(shift);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /admin/shifts/series/:groupId — cancel all future shifts in a recurrence group
router.delete('/admin/series/:groupId', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const { groupId } = req.params;
  try {
    // Only delete today-and-future shifts so past records are preserved
    const result = await pool.query(
      `DELETE FROM shifts
       WHERE recurrence_group_id = $1 AND company_id = $2 AND shift_date >= CURRENT_DATE
       RETURNING id, user_id, shift_date, start_time, end_time`,
      [groupId, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'No upcoming shifts found in this series' });
    // Notify each affected worker once
    const notified = new Set();
    for (const shift of result.rows) {
      if (notified.has(shift.user_id)) continue;
      notified.add(shift.user_id);
      sendPushToUser(shift.user_id, { title: 'Recurring shifts cancelled', body: 'A series of your scheduled shifts has been cancelled.', url: '/dashboard' });
      createInboxItemBatch([shift.user_id], companyId, 'shift_cancelled', 'Recurring shifts cancelled',
        'A series of your scheduled shifts has been cancelled.', '/dashboard#schedule');
    }
    res.json({ deleted: result.rowCount });
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
