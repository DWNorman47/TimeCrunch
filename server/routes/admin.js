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
      SELECT u.id, u.full_name, u.username, u.role, u.language, u.hourly_rate,
        COUNT(te.id) as total_entries,
        COALESCE(SUM(EXTRACT(EPOCH FROM (te.end_time - te.start_time)) / 3600), 0) as total_hours,
        COALESCE((SELECT SUM(LEAST(day_hours, 8)) FROM daily_regular dr WHERE dr.user_id = u.id), 0) as regular_hours,
        COALESCE((SELECT SUM(GREATEST(day_hours - 8, 0)) FROM daily_regular dr WHERE dr.user_id = u.id), 0) as overtime_hours,
        COALESCE(SUM(CASE WHEN te.wage_type = 'prevailing' THEN EXTRACT(EPOCH FROM (te.end_time - te.start_time)) / 3600 ELSE 0 END), 0) as prevailing_hours
      FROM users u
      LEFT JOIN time_entries te ON te.user_id = u.id
      WHERE u.role = 'worker'
      GROUP BY u.id, u.full_name, u.username, u.role, u.language, u.hourly_rate
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
      'SELECT id, full_name, username, hourly_rate FROM users WHERE id = $1 AND role = $2',
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
    const rate = parseFloat(userResult.rows[0].hourly_rate) || 30;
    const regularCost = regularHours * rate;
    const overtimeCost = overtimeHours * rate * 1.5;
    const prevailingCost = prevailingHours * 45;
    const totalCost = regularCost + overtimeCost + prevailingCost;

    res.json({
      worker: userResult.rows[0],
      entries,
      summary: {
        total_hours: totalHours, regular_hours: regularHours, overtime_hours: overtimeHours, prevailing_hours: prevailingHours,
        rate, regular_cost: regularCost, overtime_cost: overtimeCost, prevailing_cost: prevailingCost, total_cost: totalCost,
      },
      period: { from: from || null, to: to || null },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a worker or admin
router.post('/workers', requireAdmin, async (req, res) => {
  const { username, password, full_name, role } = req.body;
  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'username, password, and full_name required' });
  }
  const assignedRole = role === 'admin' ? 'admin' : 'worker';
  const assignedLanguage = req.body.language || 'English';
  const assignedRate = parseFloat(req.body.hourly_rate) || 30;
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, full_name, role, language, hourly_rate) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, full_name, role, language, hourly_rate',
      [username, hash, full_name, assignedRole, assignedLanguage, assignedRate]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a worker (full_name, role, language)
router.patch('/workers/:id', requireAdmin, async (req, res) => {
  const { full_name, role, language, hourly_rate } = req.body;
  if (!full_name && !role && !language && hourly_rate === undefined) {
    return res.status(400).json({ error: 'At least one field required' });
  }
  const assignedRole = role ? (role === 'admin' ? 'admin' : 'worker') : undefined;
  try {
    const fields = [];
    const values = [];
    let idx = 1;
    if (full_name) { fields.push(`full_name = $${idx++}`); values.push(full_name); }
    if (assignedRole !== undefined) { fields.push(`role = $${idx++}`); values.push(assignedRole); }
    if (language) { fields.push(`language = $${idx++}`); values.push(language); }
    if (hourly_rate !== undefined) { fields.push(`hourly_rate = $${idx++}`); values.push(parseFloat(hourly_rate) || 30); }
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, username, full_name, role, language, hourly_rate`,
      values
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Worker not found' });
    res.json(result.rows[0]);
  } catch (err) {
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

// Get a project's entries for a date range (for bill generation)
router.get('/projects/:id/entries', requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  try {
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (projectResult.rowCount === 0) return res.status(404).json({ error: 'Project not found' });

    const entriesResult = await pool.query(
      `SELECT te.*, u.full_name as worker_name, u.username, u.hourly_rate
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       WHERE te.project_id = $1
         AND ($2::date IS NULL OR te.work_date >= $2::date)
         AND ($3::date IS NULL OR te.work_date <= $3::date)
       ORDER BY te.work_date ASC, te.start_time ASC`,
      [req.params.id, from || null, to || null]
    );

    const entries = entriesResult.rows;

    // Calculate overtime per worker per day (>8h regular)
    const workerDaily = {};
    entries.filter(e => e.wage_type === 'regular').forEach(e => {
      const key = `${e.user_id}:${e.work_date.toString().substring(0, 10)}`;
      if (!workerDaily[key]) workerDaily[key] = { hours: 0, rate: parseFloat(e.hourly_rate) || 30 };
      const start = new Date(`1970-01-01T${e.start_time}`);
      const end = new Date(`1970-01-01T${e.end_time}`);
      workerDaily[key].hours += (end - start) / 3600000;
    });

    let regularHours = 0, overtimeHours = 0, regularCost = 0, overtimeCost = 0;
    Object.values(workerDaily).forEach(({ hours, rate }) => {
      const reg = Math.min(hours, 8);
      const ot = Math.max(hours - 8, 0);
      regularHours += reg;
      overtimeHours += ot;
      regularCost += reg * rate;
      overtimeCost += ot * rate * 1.5;
    });

    let prevailingHours = 0, prevailingCost = 0;
    entries.filter(e => e.wage_type === 'prevailing').forEach(e => {
      const start = new Date(`1970-01-01T${e.start_time}`);
      const end = new Date(`1970-01-01T${e.end_time}`);
      const h = (end - start) / 3600000;
      prevailingHours += h;
      prevailingCost += h * 45;
    });

    const totalHours = regularHours + overtimeHours + prevailingHours;
    const totalCost = regularCost + overtimeCost + prevailingCost;

    res.json({
      project: projectResult.rows[0],
      entries,
      summary: { total_hours: totalHours, regular_hours: regularHours, overtime_hours: overtimeHours, prevailing_hours: prevailingHours, regular_cost: regularCost, overtime_cost: overtimeCost, prevailing_cost: prevailingCost, total_cost: totalCost },
      period: { from: from || null, to: to || null },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Project metrics report
router.get('/projects/metrics', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `WITH daily_regular AS (
        SELECT project_id, work_date,
          SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) as day_hours
        FROM time_entries
        WHERE wage_type = 'regular'
        GROUP BY project_id, work_date
      )
      SELECT p.id, p.name,
        COUNT(te.id) as total_entries,
        COUNT(DISTINCT te.user_id) as worker_count,
        COALESCE(SUM(EXTRACT(EPOCH FROM (te.end_time - te.start_time)) / 3600), 0) as total_hours,
        COALESCE((SELECT SUM(LEAST(day_hours, 8)) FROM daily_regular dr WHERE dr.project_id = p.id), 0) as regular_hours,
        COALESCE((SELECT SUM(GREATEST(day_hours - 8, 0)) FROM daily_regular dr WHERE dr.project_id = p.id), 0) as overtime_hours,
        COALESCE(SUM(CASE WHEN te.wage_type = 'prevailing' THEN EXTRACT(EPOCH FROM (te.end_time - te.start_time)) / 3600 ELSE 0 END), 0) as prevailing_hours
      FROM projects p
      LEFT JOIN time_entries te ON te.project_id = p.id
      GROUP BY p.id, p.name
      ORDER BY p.name`
    );
    res.json(result.rows);
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

// Update project wage_type
router.patch('/projects/:id', requireAdmin, async (req, res) => {
  const { wage_type } = req.body;
  if (!['regular', 'prevailing'].includes(wage_type)) {
    return res.status(400).json({ error: 'wage_type must be regular or prevailing' });
  }
  try {
    const result = await pool.query(
      'UPDATE projects SET wage_type = $1 WHERE id = $2 RETURNING *',
      [wage_type, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a project
router.post('/projects', requireAdmin, async (req, res) => {
  const { name, wage_type } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name required' });
  const wt = wage_type === 'prevailing' ? 'prevailing' : 'regular';
  try {
    const result = await pool.query(
      'INSERT INTO projects (name, wage_type) VALUES ($1, $2) RETURNING *',
      [name, wt]
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
