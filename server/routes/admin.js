const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const sgMail = require('@sendgrid/mail');
const pool = require('../db');
const { requireAdmin } = require('../middleware/auth');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function logAudit(companyId, actorId, actorName, action, entityType, entityId, entityName, details) {
  try {
    await pool.query(
      'INSERT INTO audit_log (company_id, actor_id, actor_name, action, entity_type, entity_id, entity_name, details) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [companyId, actorId, actorName, action, entityType || null, entityId || null, entityName || null, details ? JSON.stringify(details) : null]
    );
  } catch (e) { console.error('Audit log error:', e); }
}

async function getSettings(companyId) {
  const result = await pool.query('SELECT key, value FROM settings WHERE company_id = $1', [companyId]);
  const s = { prevailing_wage_rate: 45, default_hourly_rate: 30, overtime_multiplier: 1.5 };
  result.rows.forEach(r => { s[r.key] = parseFloat(r.value); });
  return s;
}

// Get settings
router.get('/settings', requireAdmin, async (req, res) => {
  try {
    const s = await getSettings(req.user.company_id);
    res.json(s);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update settings
router.patch('/settings', requireAdmin, async (req, res) => {
  const allowed = ['prevailing_wage_rate', 'default_hourly_rate', 'overtime_multiplier'];
  const companyId = req.user.company_id;
  try {
    const changed = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const val = parseFloat(req.body[key]);
        if (isNaN(val) || val <= 0) return res.status(400).json({ error: `Invalid value for ${key}` });
        await pool.query(
          'INSERT INTO settings (company_id, key, value) VALUES ($1, $2, $3) ON CONFLICT (company_id, key) DO UPDATE SET value = $3',
          [companyId, key, val]
        );
        changed[key] = val;
      }
    }
    await logAudit(companyId, req.user.id, req.user.full_name, 'settings.updated', 'settings', null, 'Settings', changed);
    const s = await getSettings(companyId);
    res.json(s);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /admin/active-clocks — currently clocked-in workers with location
router.get('/active-clocks', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `SELECT ac.user_id, ac.clock_in_time, ac.clock_in_lat, ac.clock_in_lng,
              ac.notes, u.full_name, p.name as project_name, p.wage_type
       FROM active_clock ac
       JOIN users u ON ac.user_id = u.id
       LEFT JOIN projects p ON ac.project_id = p.id
       WHERE ac.company_id = $1
       ORDER BY ac.clock_in_time ASC`,
      [companyId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// List all active workers with summary metrics (overtime = regular hours > 8/day)
router.get('/workers', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `WITH daily_regular AS (
        SELECT user_id, work_date,
          SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) as day_hours
        FROM time_entries
        WHERE wage_type = 'regular' AND company_id = $1
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
      WHERE u.role = 'worker' AND u.active = true AND u.company_id = $1
      GROUP BY u.id, u.full_name, u.username, u.role, u.language, u.hourly_rate
      ORDER BY u.full_name`,
      [companyId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// List archived (removed) workers
router.get('/workers/archived', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `SELECT id, full_name, username, role, language, hourly_rate
       FROM users WHERE active = false AND company_id = $1 ORDER BY full_name`,
      [companyId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Restore an archived worker
router.patch('/workers/:id/restore', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      'UPDATE users SET active = true WHERE id = $1 AND active = false AND company_id = $2 RETURNING id, full_name, username, role, language, hourly_rate',
      [req.params.id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Archived worker not found' });
    await logAudit(companyId, req.user.id, req.user.full_name, 'worker.restored', 'worker', result.rows[0].id, result.rows[0].full_name);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get a worker's entries for a date range (for bill generation)
router.get('/workers/:id/entries', requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  const companyId = req.user.company_id;
  try {
    const userResult = await pool.query(
      'SELECT id, full_name, username, hourly_rate FROM users WHERE id = $1 AND role = $2 AND company_id = $3',
      [req.params.id, 'worker', companyId]
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
    const settings = await getSettings(companyId);
    const rate = parseFloat(userResult.rows[0].hourly_rate) || settings.default_hourly_rate;
    const regularCost = regularHours * rate;
    const overtimeCost = overtimeHours * rate * settings.overtime_multiplier;
    const prevailingCost = prevailingHours * settings.prevailing_wage_rate;
    const totalCost = regularCost + overtimeCost + prevailingCost;

    res.json({
      worker: userResult.rows[0],
      entries,
      summary: {
        total_hours: totalHours, regular_hours: regularHours, overtime_hours: overtimeHours, prevailing_hours: prevailingHours,
        rate, regular_cost: regularCost, overtime_cost: overtimeCost, prevailing_cost: prevailingCost, total_cost: totalCost,
        overtime_multiplier: settings.overtime_multiplier, prevailing_wage_rate: settings.prevailing_wage_rate,
      },
      period: { from: from || null, to: to || null },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Invite a worker by email
router.post('/workers/invite', requireAdmin, async (req, res) => {
  const { full_name, email, role, language, hourly_rate } = req.body;
  if (!full_name || !email) return res.status(400).json({ error: 'full_name and email required' });
  const companyId = req.user.company_id;
  const assignedRole = role === 'admin' ? 'admin' : 'worker';
  const assignedLanguage = language || 'English';
  const assignedRate = parseFloat(hourly_rate) || 30;

  // Auto-generate username from name
  const parts = full_name.trim().toLowerCase().split(/\s+/);
  const base = parts.length > 1 ? parts[0][0] + parts[parts.length - 1] : parts[0];
  const baseUsername = base.replace(/[^a-z0-9]/g, '');
  let username = baseUsername;
  let suffix = 2;
  while (true) {
    const exists = await pool.query('SELECT id FROM users WHERE username = $1 AND company_id = $2', [username, companyId]);
    if (exists.rowCount === 0) break;
    username = baseUsername + suffix++;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  try {
    const result = await pool.query(
      `INSERT INTO users (company_id, username, password_hash, full_name, role, language, hourly_rate, email, invite_token, invite_token_expires, invite_pending)
       VALUES ($1, $2, '', $3, $4, $5, $6, $7, $8, $9, true)
       RETURNING id, username, full_name, role, language, hourly_rate, email`,
      [companyId, username, full_name, assignedRole, assignedLanguage, assignedRate, email, token, expires]
    );
    const inviteUrl = `${process.env.APP_URL}/accept-invite?token=${token}`;
    await sgMail.send({
      from: { name: 'Time Crunch', email: process.env.SENDGRID_FROM_EMAIL },
      to: email,
      subject: `You've been invited to Time Crunch`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="color:#1a56db;margin-bottom:8px">You're invited!</h2>
          <p style="color:#444;margin-bottom:8px">Hi ${full_name}, ${req.user.full_name} has invited you to join Time Crunch.</p>
          <p style="color:#444;margin-bottom:24px">Your username is: <strong>${username}</strong></p>
          <a href="${inviteUrl}" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">Set your password</a>
          <p style="color:#999;font-size:13px;margin-top:24px">This invite expires in 7 days.</p>
        </div>
      `,
    });
    await logAudit(companyId, req.user.id, req.user.full_name, 'worker.invited', 'worker', result.rows[0].id, full_name, { email });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a worker or admin
router.post('/workers', requireAdmin, async (req, res) => {
  const { username, password, full_name, first_name, middle_name, last_name, role } = req.body;
  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'username, password, and full_name required' });
  }
  const companyId = req.user.company_id;
  const assignedRole = role === 'admin' ? 'admin' : 'worker';
  const assignedLanguage = req.body.language || 'English';
  const assignedRate = parseFloat(req.body.hourly_rate) || 30;
  const assignedEmail = req.body.email || null;
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (company_id, username, password_hash, full_name, first_name, middle_name, last_name, role, language, hourly_rate, email, email_confirmed) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true) RETURNING id, username, full_name, first_name, middle_name, last_name, role, language, hourly_rate, email',
      [companyId, username, hash, full_name, first_name || null, middle_name || null, last_name || null, assignedRole, assignedLanguage, assignedRate, assignedEmail]
    );
    await logAudit(companyId, req.user.id, req.user.full_name, 'worker.created', 'worker', result.rows[0].id, full_name, { role: assignedRole });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      const existing = await pool.query('SELECT id, full_name, active FROM users WHERE username = $1 AND company_id = $2', [username, companyId]);
      const u = existing.rows[0];
      if (u && !u.active) {
        return res.status(409).json({ error: `Username "${username}" belongs to a removed user (${u.full_name}). Restore them instead?`, archived_id: u.id, archived_name: u.full_name });
      }
      return res.status(409).json({ error: 'Username already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a worker (full_name, first_name, middle_name, last_name, role, language, hourly_rate, email)
router.patch('/workers/:id', requireAdmin, async (req, res) => {
  const { full_name, first_name, middle_name, last_name, role, language, hourly_rate, email } = req.body;
  if (!full_name && !first_name && !last_name && !role && !language && hourly_rate === undefined && email === undefined) {
    return res.status(400).json({ error: 'At least one field required' });
  }
  const companyId = req.user.company_id;
  const assignedRole = role ? (role === 'admin' ? 'admin' : 'worker') : undefined;
  try {
    const fields = [];
    const values = [];
    let idx = 1;
    if (full_name) { fields.push(`full_name = $${idx++}`); values.push(full_name); }
    if (first_name !== undefined) { fields.push(`first_name = $${idx++}`); values.push(first_name || null); }
    if (middle_name !== undefined) { fields.push(`middle_name = $${idx++}`); values.push(middle_name || null); }
    if (last_name !== undefined) { fields.push(`last_name = $${idx++}`); values.push(last_name || null); }
    if (assignedRole !== undefined) { fields.push(`role = $${idx++}`); values.push(assignedRole); }
    if (language) { fields.push(`language = $${idx++}`); values.push(language); }
    if (hourly_rate !== undefined) { fields.push(`hourly_rate = $${idx++}`); values.push(parseFloat(hourly_rate) || 30); }
    if (email !== undefined) { fields.push(`email = $${idx++}`); values.push(email || null); }
    values.push(req.params.id);
    values.push(companyId);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} AND company_id = $${idx + 1} RETURNING id, username, full_name, role, language, hourly_rate, email`,
      values
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Worker not found' });
    await logAudit(companyId, req.user.id, req.user.full_name, 'worker.updated', 'worker', result.rows[0].id, result.rows[0].full_name);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove (soft-delete) a worker
router.delete('/workers/:id', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const worker = await pool.query('SELECT full_name FROM users WHERE id = $1 AND company_id = $2', [req.params.id, companyId]);
    const result = await pool.query(
      'UPDATE users SET active = false WHERE id = $1 AND active = true AND company_id = $2 RETURNING id',
      [req.params.id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Worker not found' });
    await logAudit(companyId, req.user.id, req.user.full_name, 'worker.deleted', 'worker', parseInt(req.params.id), worker.rows[0]?.full_name);
    res.json({ removed: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get a project's entries for a date range (for bill generation)
router.get('/projects/:id/entries', requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  const companyId = req.user.company_id;
  try {
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1 AND company_id = $2', [req.params.id, companyId]);
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

    const settings = await getSettings(companyId);
    const workerDaily = {};
    entries.filter(e => e.wage_type === 'regular').forEach(e => {
      const key = `${e.user_id}:${e.work_date.toString().substring(0, 10)}`;
      if (!workerDaily[key]) workerDaily[key] = { hours: 0, rate: parseFloat(e.hourly_rate) || settings.default_hourly_rate };
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
      overtimeCost += ot * rate * settings.overtime_multiplier;
    });

    let prevailingHours = 0, prevailingCost = 0;
    entries.filter(e => e.wage_type === 'prevailing').forEach(e => {
      const start = new Date(`1970-01-01T${e.start_time}`);
      const end = new Date(`1970-01-01T${e.end_time}`);
      const h = (end - start) / 3600000;
      prevailingHours += h;
      prevailingCost += h * settings.prevailing_wage_rate;
    });

    const totalHours = regularHours + overtimeHours + prevailingHours;
    const totalCost = regularCost + overtimeCost + prevailingCost;

    res.json({
      project: projectResult.rows[0],
      entries,
      summary: { total_hours: totalHours, regular_hours: regularHours, overtime_hours: overtimeHours, prevailing_hours: prevailingHours, regular_cost: regularCost, overtime_cost: overtimeCost, prevailing_cost: prevailingCost, total_cost: totalCost, overtime_multiplier: settings.overtime_multiplier, prevailing_wage_rate: settings.prevailing_wage_rate },
      period: { from: from || null, to: to || null },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Project metrics report (active projects only)
router.get('/projects/metrics', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `WITH daily_regular AS (
        SELECT project_id, work_date,
          SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) as day_hours
        FROM time_entries
        WHERE wage_type = 'regular' AND company_id = $1
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
      WHERE p.active = true AND p.company_id = $1
      GROUP BY p.id, p.name
      ORDER BY p.name`,
      [companyId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// List active projects
router.get('/projects', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query('SELECT * FROM projects WHERE active = true AND company_id = $1 ORDER BY name', [companyId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// List archived (removed) projects
router.get('/projects/archived', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query('SELECT * FROM projects WHERE active = false AND company_id = $1 ORDER BY name', [companyId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Restore an archived project
router.patch('/projects/:id/restore', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      'UPDATE projects SET active = true WHERE id = $1 AND active = false AND company_id = $2 RETURNING *',
      [req.params.id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Archived project not found' });
    await logAudit(companyId, req.user.id, req.user.full_name, 'project.restored', 'project', result.rows[0].id, result.rows[0].name);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update project (name and/or wage_type)
router.patch('/projects/:id', requireAdmin, async (req, res) => {
  const { wage_type, name } = req.body;
  if (wage_type !== undefined && !['regular', 'prevailing'].includes(wage_type)) {
    return res.status(400).json({ error: 'wage_type must be regular or prevailing' });
  }
  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ error: 'Project name cannot be empty' });
  }
  const companyId = req.user.company_id;
  try {
    const fields = [];
    const values = [];
    let idx = 1;
    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name.trim()); }
    if (wage_type !== undefined) { fields.push(`wage_type = $${idx++}`); values.push(wage_type); }
    if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    values.push(req.params.id);
    values.push(companyId);
    const result = await pool.query(
      `UPDATE projects SET ${fields.join(', ')} WHERE id = $${idx} AND company_id = $${idx + 1} RETURNING *`,
      values
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Project not found' });
    await logAudit(companyId, req.user.id, req.user.full_name, 'project.updated', 'project', result.rows[0].id, result.rows[0].name);
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
  const companyId = req.user.company_id;
  const wt = wage_type === 'prevailing' ? 'prevailing' : 'regular';
  try {
    const result = await pool.query(
      'INSERT INTO projects (company_id, name, wage_type) VALUES ($1, $2, $3) RETURNING *',
      [companyId, name, wt]
    );
    await logAudit(companyId, req.user.id, req.user.full_name, 'project.created', 'project', result.rows[0].id, name, { wage_type: wt });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      const existing = await pool.query('SELECT id, name, active FROM projects WHERE name = $1 AND company_id = $2', [name, companyId]);
      const p = existing.rows[0];
      if (p && !p.active) {
        return res.status(409).json({ error: `A removed project named "${name}" already exists. Restore it instead?`, archived_id: p.id, archived_name: p.name });
      }
      return res.status(409).json({ error: 'Project already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove (soft-delete) a project
router.delete('/projects/:id', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const project = await pool.query('SELECT name FROM projects WHERE id = $1 AND company_id = $2', [req.params.id, companyId]);
    const result = await pool.query(
      'UPDATE projects SET active = false WHERE id = $1 AND active = true AND company_id = $2 RETURNING id',
      [req.params.id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Project not found' });
    await logAudit(companyId, req.user.id, req.user.full_name, 'project.deleted', 'project', parseInt(req.params.id), project.rows[0]?.name);
    res.json({ removed: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Audit log
router.get('/audit-log', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  try {
    const result = await pool.query(
      `SELECT id, actor_name, action, entity_type, entity_id, entity_name, details, created_at
       FROM audit_log WHERE company_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [companyId, limit, offset]
    );
    const total = await pool.query('SELECT COUNT(*) FROM audit_log WHERE company_id = $1', [companyId]);
    res.json({ entries: result.rows, total: parseInt(total.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
