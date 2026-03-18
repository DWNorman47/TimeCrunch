const router = require('express').Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendPushToUser, sendPushToCompanyAdmins } = require('../push');

// Get current user's entries
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT te.*, p.name as project_name
       FROM time_entries te
       LEFT JOIN projects p ON te.project_id = p.id
       WHERE te.user_id = $1
       ORDER BY te.work_date DESC, te.start_time DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Submit a time entry (wage_type inherited from project)
router.post('/', requireAuth, async (req, res) => {
  const { project_id, work_date, start_time, end_time, notes, break_minutes, mileage } = req.body;
  if (!project_id || !work_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'project_id, work_date, start_time, and end_time are required' });
  }
  const companyId = req.user.company_id;
  try {
    const projectResult = await pool.query(
      'SELECT wage_type FROM projects WHERE id = $1 AND company_id = $2',
      [project_id, companyId]
    );
    if (projectResult.rowCount === 0) return res.status(400).json({ error: 'Project not found' });
    const wage_type = projectResult.rows[0].wage_type;

    const result = await pool.query(
      `INSERT INTO time_entries (company_id, user_id, project_id, work_date, start_time, end_time, wage_type, notes, break_minutes, mileage)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [companyId, req.user.id, project_id, work_date, start_time, end_time, wage_type, notes || null,
       parseInt(break_minutes) || 0, mileage != null ? parseFloat(mileage) : null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Edit an entry (own entries only, within 7 days)
router.patch('/:id', requireAuth, async (req, res) => {
  const { start_time, end_time, notes, break_minutes, mileage } = req.body;
  if (!start_time || !end_time) return res.status(400).json({ error: 'start_time and end_time required' });
  if (start_time >= end_time) return res.status(400).json({ error: 'End time must be after start time' });
  try {
    const existing = await pool.query(
      'SELECT * FROM time_entries WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    const entry = existing.rows[0];
    const entryDate = new Date(entry.work_date);
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
    if (entryDate < cutoff) return res.status(403).json({ error: 'Entries older than 7 days cannot be edited' });
    const locked = await pool.query(
      'SELECT id FROM pay_periods WHERE company_id = $1 AND period_start <= $2 AND period_end >= $2',
      [req.user.company_id, entry.work_date]
    );
    if (locked.rowCount > 0) return res.status(403).json({ error: 'This entry is in a locked pay period' });
    const result = await pool.query(
      `UPDATE time_entries SET start_time = $1, end_time = $2, notes = $3, break_minutes = $4, mileage = $5,
       status = 'pending', approval_note = NULL WHERE id = $6 RETURNING *`,
      [start_time, end_time, notes || null, parseInt(break_minutes) || 0,
       mileage != null ? parseFloat(mileage) : null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /time-entries/:id/messages
router.get('/:id/messages', requireAuth, async (req, res) => {
  try {
    const entry = await pool.query('SELECT id FROM time_entries WHERE id = $1 AND company_id = $2', [req.params.id, req.user.company_id]);
    if (entry.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    const result = await pool.query(
      `SELECT m.*, u.full_name as sender_name FROM entry_messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.time_entry_id = $1 ORDER BY m.created_at ASC`,
      [req.params.id]
    );
    // Mark unread messages as read for this user
    await pool.query(
      `UPDATE entry_messages SET read_at = NOW()
       WHERE time_entry_id = $1 AND sender_id != $2 AND read_at IS NULL`,
      [req.params.id, req.user.id]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /time-entries/:id/messages
router.post('/:id/messages', requireAuth, async (req, res) => {
  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Message body required' });
  try {
    const entry = await pool.query('SELECT id FROM time_entries WHERE id = $1 AND company_id = $2', [req.params.id, req.user.company_id]);
    if (entry.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    const result = await pool.query(
      `INSERT INTO entry_messages (time_entry_id, company_id, sender_id, body)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, req.user.company_id, req.user.id, body.trim()]
    );
    const msg = { ...result.rows[0], sender_name: req.user.full_name };
    const entryOwner = await pool.query('SELECT user_id FROM time_entries WHERE id = $1', [req.params.id]);
    const ownerId = entryOwner.rows[0]?.user_id;
    const isWorker = req.user.role === 'worker';
    if (isWorker) {
      // Worker commented — notify all company admins
      sendPushToCompanyAdmins(req.user.company_id, {
        title: `Comment from ${req.user.full_name}`,
        body: body.trim().substring(0, 100),
        url: '/admin#approvals',
      });
    } else if (ownerId && ownerId !== req.user.id) {
      // Admin commented — notify the entry's worker
      sendPushToUser(ownerId, {
        title: `Comment from ${req.user.full_name}`,
        body: body.trim().substring(0, 100),
        url: '/dashboard',
      });
    }
    res.status(201).json(msg);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET unread message count for current user
router.get('/messages/unread-count', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) FROM entry_messages m
       JOIN time_entries te ON m.time_entry_id = te.id
       WHERE te.company_id = $1 AND m.sender_id != $2 AND m.read_at IS NULL
         AND (te.user_id = $2 OR $3 = 'admin' OR $3 = 'super_admin')`,
      [req.user.company_id, req.user.id, req.user.role]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Delete an entry (own entries only)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await pool.query('SELECT work_date FROM time_entries WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    const locked = await pool.query(
      'SELECT id FROM pay_periods WHERE company_id = $1 AND period_start <= $2 AND period_end >= $2',
      [req.user.company_id, existing.rows[0].work_date]
    );
    if (locked.rowCount > 0) return res.status(403).json({ error: 'This entry is in a locked pay period' });
    const result = await pool.query(
      'DELETE FROM time_entries WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /time-entries/pay-stubs — worker's pay periods with aggregated hours
router.get('/pay-stubs', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const companyId = req.user.company_id;
  try {
    const periods = await pool.query(
      'SELECT * FROM pay_periods WHERE company_id = $1 ORDER BY period_start DESC',
      [companyId]
    );

    const result = [];
    for (const period of periods.rows) {
      const entries = await pool.query(
        `SELECT te.*, p.name as project_name,
                to_char(te.work_date, 'YYYY-MM-DD') as work_date_str
         FROM time_entries te LEFT JOIN projects p ON te.project_id = p.id
         WHERE te.user_id = $1 AND te.work_date >= $2 AND te.work_date <= $3
         ORDER BY te.work_date, te.start_time`,
        [userId, period.period_start, period.period_end]
      );
      if (entries.rowCount === 0) continue;

      let regularHours = 0, overtimeHours = 0, prevailingHours = 0, totalMileage = 0;
      for (const e of entries.rows) {
        const gross = (new Date(`1970-01-01T${e.end_time}`) - new Date(`1970-01-01T${e.start_time}`)) / 3600000 - (e.break_minutes || 0) / 60;
        if (e.wage_type === 'prevailing') prevailingHours += gross;
        else regularHours += gross;
        if (e.mileage) totalMileage += parseFloat(e.mileage);
      }

      result.push({
        id: period.id,
        period_start: period.period_start,
        period_end: period.period_end,
        label: period.label,
        entries: entries.rows,
        summary: {
          regular_hours: +regularHours.toFixed(2),
          overtime_hours: +overtimeHours.toFixed(2),
          prevailing_hours: +prevailingHours.toFixed(2),
          total_mileage: +totalMileage.toFixed(1),
        },
      });
    }
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /time-entries/sign-off — worker signs off on their entries for a date range
router.post('/sign-off', requireAuth, async (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  try {
    const result = await pool.query(
      `UPDATE time_entries SET worker_signed_at = NOW()
       WHERE user_id = $1 AND work_date >= $2 AND work_date <= $3
         AND status = 'pending' AND worker_signed_at IS NULL
       RETURNING id`,
      [req.user.id, from, to]
    );
    // Notify admin that worker signed off
    const admin = await pool.query(
      `SELECT u.id FROM users u WHERE u.company_id = $1 AND u.role = 'admin' AND u.active = true LIMIT 1`,
      [req.user.company_id]
    );
    if (admin.rowCount > 0) {
      sendPushToUser(admin.rows[0].id, {
        title: `${req.user.full_name} signed their timesheet`,
        body: `${result.rowCount} entr${result.rowCount === 1 ? 'y' : 'ies'} ready for review`,
        url: '/admin#approvals',
      });
    }
    res.json({ signed: result.rowCount });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
