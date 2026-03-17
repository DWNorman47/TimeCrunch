const router = require('express').Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

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
    res.status(201).json({ ...result.rows[0], sender_name: req.user.full_name });
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

module.exports = router;
