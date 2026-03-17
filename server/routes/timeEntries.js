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

// Delete an entry (own entries only)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
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
