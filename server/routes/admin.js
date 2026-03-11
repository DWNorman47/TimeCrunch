const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

// List all workers with summary metrics (overtime = regular hours > 8/day)
router.get('/workers', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `WITH daily_regular AS (
        SELECT user_id, work_date,
          SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) as day_hours
        FROM time_entries
        WHERE wage_type = 'regular'
        GROUP BY user_id, work_date
      )
      SELECT u.id, u.full_name, u.username,
        COUNT(te.id) as total_entries,
        COALESCE(SUM(EXTRACT(EPOCH FROM (te.end_time - te.start_time)) / 3600), 0) as total_hours,
        COALESCE((SELECT SUM(LEAST(day_hours, 8)) FROM daily_regular dr WHERE dr.user_id = u.id), 0) as regular_hours,
        COALESCE((SELECT SUM(GREATEST(day_hours - 8, 0)) FROM daily_regular dr WHERE dr.user_id = u.id), 0) as overtime_hours,
        COALESCE(SUM(CASE WHEN te.wage_type = 'prevailing' THEN EXTRACT(EPOCH FROM (te.end_time - te.start_time)) / 3600 ELSE 0 END), 0) as prevailing_hours
      FROM users u
      LEFT JOIN time_entries te ON te.user_id = u.id
      WHERE u.role = 'worker'
      GROUP BY u.id, u.full_name, u.username
      ORDER BY u.full_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get a worker's entries for a date range (for bill generation)
router.get('/workers/:id/entries', requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  try {
    const userResult = await pool.query(
      'SELECT id, full_name, username FROM users WHERE id = $1 AND role = $2',
      [req.params.id, 'worker']
    );
    if (userResult.rowCount === 0) return res.status(404).json({ error: 'Worker not found' });

    const entriesResult = await pool.query(
      `SELECT te.*, p.name as project_name
       FROM time_entries te
       LEFT JOIN projects p ON te.project_id = p.id
       WHERE te.user_id = $1
         AND ($2::date IS NULL OR te.work_date >= $2::date)
         AND ($3::date IS NULL OR te.work_date <= $3::date)
       ORDER BY te.work_date ASC, te.start_time ASC`,
      [req.params.id, from || null, to || null]
    );

    const entries = entriesResult.rows;

    // Calculate daily regular hours to determine overtime (>8h/day)
    const dailyRegular = {};
    entries.filter(e => e.wage_type === 'regular').forEach(e => {
      const date = e.work_date.toString().substring(0, 10);
      if (!dailyRegular[date]) dailyRegular[date] = 0;
      const start = new Date(`1970-01-01T${e.start_time}`);
      const end = new Date(`1970-01-01T${e.end_time}`);
      dailyRegular[date] += (end - start) / 3600000;
    });
    const regularHours = Object.values(dailyRegular).reduce((sum, h) => sum + Math.min(h, 8), 0);
    const overtimeHours = Object.values(dailyRegular).reduce((sum, h) => sum + Math.max(h - 8, 0), 0);
    const prevailingHours = entries.filter(e => e.wage_type === 'prevailing').reduce((sum, e) => {
      const start = new Date(`1970-01-01T${e.start_time}`);
      const end = new Date(`1970-01-01T${e.end_time}`);
      return sum + (end - start) / 3600000;
    }, 0);
    const totalHours = regularHours + overtimeHours + prevailingHours;

    res.json({
      worker: userResult.rows[0],
      entries,
      summary: { total_hours: totalHours, regular_hours: regularHours, overtime_hours: overtimeHours, prevailing_hours: prevailingHours },
      period: { from: from || null, to: to || null },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a worker
router.post('/workers', requireAdmin, async (req, res) => {
  const { username, password, full_name } = req.body;
  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'username, password, and full_name required' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES ($1, $2, $3, $4) RETURNING id, username, full_name, role',
      [username, hash, full_name, 'worker']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a worker
router.delete('/workers/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 AND role = $2 RETURNING id',
      [req.params.id, 'worker']
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Worker not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// List projects
router.get('/projects', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM projects ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a project
router.post('/projects', requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name required' });
  try {
    const result = await pool.query(
      'INSERT INTO projects (name) VALUES ($1) RETURNING *',
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Project already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a project
router.delete('/projects/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Project not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
