const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const sgMail = require('@sendgrid/mail');
const pool = require('../db');
const { requireAdmin, requirePlan, requireProAddon, requirePermission } = require('../middleware/auth');
const { sendPushToUser, sendPushToAllWorkers } = require('../push');
const { sendEmail } = require('../email');
const { hoursWorked, computeOT, computeDailyPayCosts } = require('../utils/payCalculations');
const { createInboxItem, createInboxItemBatch } = require('./inbox');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Worker limits per plan (null = unlimited). Trial always gets unlimited.
const WORKER_LIMITS = { free: 3, starter: 10, business: null };

async function checkWorkerLimit(companyId) {
  const company = await pool.query(
    'SELECT plan, subscription_status, trial_ends_at FROM companies WHERE id = $1', [companyId]
  );
  const { plan, subscription_status, trial_ends_at } = company.rows[0] || {};
  const trialActive = subscription_status === 'trial' && (!trial_ends_at || new Date(trial_ends_at) >= new Date());
  if (trialActive) return null; // active trial = unlimited
  const limit = WORKER_LIMITS[plan || 'free'];
  if (limit === null) return null; // business = unlimited
  const count = await pool.query(
    `SELECT COUNT(*) FROM users WHERE company_id = $1 AND role = 'worker' AND active = true`,
    [companyId]
  );
  const current = parseInt(count.rows[0].count, 10);
  return current >= limit ? { limit, current, plan: plan || 'free' } : null;
}

async function logAudit(companyId, actorId, actorName, action, entityType, entityId, entityName, details) {
  try {
    await pool.query(
      'INSERT INTO audit_log (company_id, actor_id, actor_name, action, entity_type, entity_id, entity_name, details) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [companyId, actorId, actorName, action, entityType || null, entityId || null, entityName || null, details ? JSON.stringify(details) : null]
    );
  } catch (e) { console.error('Audit log error:', e); }
}

const { FEATURE_KEYS, ADMIN_SETTINGS_DEFAULTS, applySettingsRows } = require('../settingsDefaults');

async function getSettings(companyId) {
  const result = await pool.query('SELECT key, value FROM settings WHERE company_id = $1', [companyId]);
  return applySettingsRows(result.rows, ADMIN_SETTINGS_DEFAULTS);
}


// GET /admin/kpis — live summary cards for the Live tab
router.get('/kpis', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const [pending, clockedIn, weekHours, settings] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM time_entries WHERE company_id = $1 AND status = 'pending'`, [companyId]),
      pool.query(`SELECT COUNT(*) FROM active_clock WHERE company_id = $1`, [companyId]),
      pool.query(
        `SELECT COALESCE(SUM(
           EXTRACT(EPOCH FROM (
             CASE WHEN end_time < start_time
               THEN (end_time + INTERVAL '1 day') - start_time
               ELSE end_time - start_time
             END
           )) / 3600 - (break_minutes::float / 60)
         ), 0) as hours
         FROM time_entries
         WHERE company_id = $1
           AND work_date >= date_trunc('week', CURRENT_DATE)
           AND work_date <= CURRENT_DATE
           AND status != 'rejected'`,
        [companyId]
      ),
      getSettings(companyId),
    ]);

    // Workers who've exceeded the OT threshold this week
    const { overtime_rule, overtime_threshold } = settings;
    let otWorkers = 0;
    if (overtime_rule === 'weekly') {
      const r = await pool.query(
        `SELECT COUNT(*) FROM (
           SELECT user_id, SUM(
             EXTRACT(EPOCH FROM (
               CASE WHEN end_time < start_time THEN (end_time + INTERVAL '1 day') - start_time ELSE end_time - start_time END
             )) / 3600 - (break_minutes::float / 60)
           ) as total_hours
           FROM time_entries
           WHERE company_id = $1 AND work_date >= date_trunc('week', CURRENT_DATE)
             AND wage_type = 'regular' AND status != 'rejected'
           GROUP BY user_id
           HAVING SUM(
             EXTRACT(EPOCH FROM (
               CASE WHEN end_time < start_time THEN (end_time + INTERVAL '1 day') - start_time ELSE end_time - start_time END
             )) / 3600 - (break_minutes::float / 60)
           ) > $2
         ) sub`,
        [companyId, overtime_threshold]
      );
      otWorkers = parseInt(r.rows[0].count);
    } else {
      // daily: any worker with a single day > threshold this week
      const r = await pool.query(
        `SELECT COUNT(DISTINCT user_id) FROM (
           SELECT user_id, work_date, SUM(
             EXTRACT(EPOCH FROM (
               CASE WHEN end_time < start_time THEN (end_time + INTERVAL '1 day') - start_time ELSE end_time - start_time END
             )) / 3600 - (break_minutes::float / 60)
           ) as day_hours
           FROM time_entries
           WHERE company_id = $1 AND work_date >= date_trunc('week', CURRENT_DATE)
             AND wage_type = 'regular' AND status != 'rejected'
           GROUP BY user_id, work_date
           HAVING SUM(
             EXTRACT(EPOCH FROM (
               CASE WHEN end_time < start_time THEN (end_time + INTERVAL '1 day') - start_time ELSE end_time - start_time END
             )) / 3600 - (break_minutes::float / 60)
           ) > $2
         ) sub`,
        [companyId, overtime_threshold]
      );
      otWorkers = parseInt(r.rows[0].count);
    }

    res.json({
      pending_approvals: parseInt(pending.rows[0].count),
      clocked_in_count: parseInt(clockedIn.rows[0].count),
      company_hours_this_week: +parseFloat(weekHours.rows[0].hours).toFixed(1),
      overtime_workers_this_week: otWorkers,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

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
router.patch('/settings', requireAdmin, requirePermission('manage_settings'), async (req, res) => {
  const rateKeys = ['prevailing_wage_rate', 'default_hourly_rate', 'overtime_multiplier'];
  const notifKeys = ['notification_inactive_days', 'notification_start_hour', 'notification_end_hour', 'chat_retention_days'];
  const numericKeys = [...rateKeys, ...notifKeys, 'overtime_threshold', 'media_retention_days'];
  const stringKeys = ['overtime_rule', 'currency', 'company_timezone', 'invoice_signature', 'default_temp_password', 'global_required_checklist_template_id'];
  const allowed = [...numericKeys, ...stringKeys, ...FEATURE_KEYS];
  const companyId = req.user.company_id;
  try {
    const current = await getSettings(companyId);
    const changed = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (FEATURE_KEYS.includes(key)) {
          const val = req.body[key] ? '1' : '0';
          await pool.query(
            'INSERT INTO settings (company_id, key, value) VALUES ($1, $2, $3) ON CONFLICT (company_id, key) DO UPDATE SET value = $3',
            [companyId, key, val]
          );
          const newVal = val === '1';
          if (current[key] !== newVal) changed[key] = newVal;
        } else if (stringKeys.includes(key)) {
          const val = req.body[key];
          if (key === 'overtime_rule' && !['daily', 'weekly'].includes(val))
            return res.status(400).json({ error: 'overtime_rule must be daily or weekly' });
          if (key === 'currency' && !/^[A-Z]{3}$/.test(val))
            return res.status(400).json({ error: 'currency must be a valid 3-letter ISO code' });
          if (key === 'company_timezone' && val !== '' && !/^[A-Za-z_]+\/[A-Za-z_\/]+$/.test(val))
            return res.status(400).json({ error: 'Invalid timezone' });
          if (key === 'invoice_signature' && !['none', 'optional', 'required'].includes(val))
            return res.status(400).json({ error: 'invoice_signature must be none, optional, or required' });
          if (key === 'global_required_checklist_template_id' && val !== '') {
            const id = parseInt(val);
            if (isNaN(id)) return res.status(400).json({ error: 'Invalid checklist template ID' });
            const tmpl = await pool.query('SELECT id FROM safety_checklist_templates WHERE id=$1 AND company_id=$2', [id, companyId]);
            if (tmpl.rowCount === 0) return res.status(400).json({ error: 'Checklist template not found' });
          }
          await pool.query(
            'INSERT INTO settings (company_id, key, value) VALUES ($1, $2, $3) ON CONFLICT (company_id, key) DO UPDATE SET value = $3',
            [companyId, key, val]
          );
          if (current[key] !== val) changed[key] = val;
        } else {
          const val = parseFloat(req.body[key]);
          if (isNaN(val)) return res.status(400).json({ error: `Invalid value for ${key}` });
          const allowZero = ['prevailing_wage_rate', 'overtime_multiplier'];
          if (rateKeys.includes(key) && (allowZero.includes(key) ? val < 0 : val <= 0)) return res.status(400).json({ error: `Invalid value for ${key}` });
          if ([...notifKeys, 'overtime_threshold'].includes(key) && val < 0) return res.status(400).json({ error: `Invalid value for ${key}` });
          await pool.query(
            'INSERT INTO settings (company_id, key, value) VALUES ($1, $2, $3) ON CONFLICT (company_id, key) DO UPDATE SET value = $3',
            [companyId, key, val]
          );
          if (current[key] !== val) changed[key] = val;
        }
      }
    }
    if (Object.keys(changed).length === 0) { const s = await getSettings(companyId); return res.json(s); }
    await logAudit(companyId, req.user.id, req.user.full_name, 'settings.updated', 'settings', null, 'Settings', changed);
    const s = await getSettings(companyId);
    res.json(s);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Notifications — inactive workers
router.get('/notifications', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const s = await getSettings(companyId);
    const days = s.notification_inactive_days || 3;
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, MAX(te.work_date) as last_entry_date
       FROM users u
       LEFT JOIN time_entries te ON te.user_id = u.id AND te.company_id = $1
       WHERE u.company_id = $1 AND u.active = true AND u.role = 'worker'
         AND NOT EXISTS (SELECT 1 FROM active_clock ac WHERE ac.user_id = u.id AND ac.company_id = $1)
       GROUP BY u.id, u.full_name, u.email
       HAVING MAX(te.work_date) IS NULL OR MAX(te.work_date) < CURRENT_DATE - $2::integer
       ORDER BY last_entry_date ASC NULLS FIRST`,
      [companyId, days]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /admin/clock-in — admin clocks in a worker on their behalf
router.post('/clock-in', requireAdmin, requirePermission('manage_workers'), async (req, res) => {
  const companyId = req.user.company_id;
  const { user_id, project_id, notes } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  try {
    // Verify worker belongs to this company
    const workerRow = await pool.query(
      'SELECT id, full_name FROM users WHERE id = $1 AND company_id = $2 AND active = true',
      [user_id, companyId]
    );
    if (workerRow.rowCount === 0) return res.status(404).json({ error: 'Worker not found' });

    const result = await pool.query(
      `INSERT INTO active_clock (user_id, company_id, project_id, clock_in_time, work_date, notes, clock_source, clocked_in_by)
       VALUES ($1, $2, $3, NOW(), CURRENT_DATE, $4, 'admin', $5)
       ON CONFLICT (user_id) DO UPDATE
         SET project_id = EXCLUDED.project_id,
             clock_in_time = EXCLUDED.clock_in_time,
             work_date = EXCLUDED.work_date,
             notes = EXCLUDED.notes,
             clock_source = EXCLUDED.clock_source,
             clocked_in_by = EXCLUDED.clocked_in_by
       RETURNING *`,
      [user_id, companyId, project_id || null, notes || null, req.user.id]
    );
    const projName = project_id
      ? await pool.query('SELECT name FROM projects WHERE id = $1', [project_id])
      : { rows: [{ name: null }] };
    await logAudit(companyId, req.user.id, req.user.full_name, 'worker.clocked_in_by_admin', 'user', parseInt(user_id), workerRow.rows[0].full_name);
    res.status(201).json({ ...result.rows[0], project_name: projName.rows[0]?.name, clocked_in_by_name: req.user.full_name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /admin/clock-out/:user_id — admin clocks out a worker
router.post('/clock-out/:user_id', requireAdmin, requirePermission('manage_workers'), async (req, res) => {
  const companyId = req.user.company_id;
  const { break_minutes, mileage } = req.body;
  try {
    const clockResult = await pool.query(
      `SELECT ac.*, p.wage_type, p.name AS project_name
       FROM active_clock ac
       LEFT JOIN projects p ON ac.project_id = p.id
       WHERE ac.user_id = $1 AND ac.company_id = $2`,
      [req.params.user_id, companyId]
    );
    if (clockResult.rowCount === 0) return res.status(400).json({ error: 'Worker is not clocked in' });
    const clock = clockResult.rows[0];

    const clockInTime = new Date(clock.clock_in_time);
    const clockOutTime = new Date();
    const pad = n => String(n).padStart(2, '0');
    const start_time = `${pad(clockInTime.getUTCHours())}:${pad(clockInTime.getUTCMinutes())}:${pad(clockInTime.getUTCSeconds())}`;
    const end_time = `${pad(clockOutTime.getUTCHours())}:${pad(clockOutTime.getUTCMinutes())}:${pad(clockOutTime.getUTCSeconds())}`;

    const entryResult = await pool.query(
      `INSERT INTO time_entries
         (company_id, user_id, project_id, work_date, start_time, end_time, wage_type, notes,
          clock_in_lat, clock_in_lng, break_minutes, mileage, timezone, clock_source, clocked_in_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        companyId, clock.user_id, clock.project_id, clock.work_date,
        start_time, end_time, clock.wage_type || 'regular', clock.notes || null,
        clock.clock_in_lat, clock.clock_in_lng,
        parseInt(break_minutes) || 0, mileage != null ? parseFloat(mileage) : null,
        clock.timezone || null,
        clock.clock_source, clock.clocked_in_by,
      ]
    );

    await pool.query('DELETE FROM active_clock WHERE user_id = $1', [clock.user_id]);
    await logAudit(companyId, req.user.id, req.user.full_name, 'worker.clocked_out_by_admin', 'user', parseInt(req.params.user_id), null);
    res.json(entryResult.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /admin/active-clock/:user_id — admin edits the clock-in time of a running clock
router.patch('/active-clock/:user_id', requireAdmin, requirePermission('manage_workers'), async (req, res) => {
  const companyId = req.user.company_id;
  const { clock_in_time } = req.body;
  if (!clock_in_time) return res.status(400).json({ error: 'clock_in_time required' });
  try {
    const result = await pool.query(
      `UPDATE active_clock SET clock_in_time = $1
       WHERE user_id = $2 AND company_id = $3
       RETURNING *`,
      [clock_in_time, req.params.user_id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Active clock not found' });
    await logAudit(companyId, req.user.id, req.user.full_name, 'worker.clock_in_time_edited', 'user', parseInt(req.params.user_id), null);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /admin/entries/:id/times — admin edits start/end times (kept for backwards compat)
router.patch('/entries/:id/times', requireAdmin, requirePermission('manage_workers'), async (req, res) => {
  const companyId = req.user.company_id;
  const { start_time, end_time } = req.body;
  if (!start_time || !end_time) return res.status(400).json({ error: 'start_time and end_time required' });
  try {
    const result = await pool.query(
      `UPDATE time_entries SET start_time = $1, end_time = $2
       WHERE id = $3 AND company_id = $4
       RETURNING *`,
      [start_time, end_time, req.params.id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    await logAudit(companyId, req.user.id, req.user.full_name, 'entry.times_edited', 'time_entry', parseInt(req.params.id), null);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /admin/entries/:id/edit — admin edits times + project on a pending entry
router.patch('/entries/:id/edit', requireAdmin, requirePermission('approve_entries'), async (req, res) => {
  const companyId = req.user.company_id;
  const { start_time, end_time, project_id } = req.body;
  if (!start_time || !end_time) return res.status(400).json({ error: 'start_time and end_time required' });
  try {
    // Derive wage_type from new project if provided
    let wage_type = 'regular';
    if (project_id) {
      const proj = await pool.query('SELECT wage_type FROM projects WHERE id=$1 AND company_id=$2', [project_id, companyId]);
      if (proj.rowCount === 0) return res.status(400).json({ error: 'Project not found' });
      wage_type = proj.rows[0].wage_type;
    }
    const result = await pool.query(
      `UPDATE time_entries SET start_time=$1, end_time=$2, project_id=$3, wage_type=$4
       WHERE id=$5 AND company_id=$6 RETURNING *`,
      [start_time, end_time, project_id || null, wage_type, req.params.id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    // Return with project name joined
    const full = await pool.query(
      `SELECT te.*, COALESCE(u.invoice_name, u.full_name) as worker_name, p.name as project_name
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       LEFT JOIN projects p ON te.project_id = p.id
       WHERE te.id=$1`,
      [req.params.id]
    );
    await logAudit(companyId, req.user.id, req.user.full_name, 'entry.edited', 'time_entry', parseInt(req.params.id), null);
    res.json(full.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /admin/entries/:id/split — split a pending entry into multiple project segments
router.post('/entries/:id/split', requireAdmin, requirePermission('approve_entries'), async (req, res) => {
  const companyId = req.user.company_id;
  const { segments } = req.body; // [{ project_id, start_time, end_time }, ...]
  if (!Array.isArray(segments) || segments.length < 2) {
    return res.status(400).json({ error: 'At least 2 segments required' });
  }
  for (const seg of segments) {
    if (!seg.start_time || !seg.end_time) return res.status(400).json({ error: 'Each segment needs start_time and end_time' });
  }
  try {
    const orig = await pool.query(
      'SELECT * FROM time_entries WHERE id=$1 AND company_id=$2',
      [req.params.id, companyId]
    );
    if (orig.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    const o = orig.rows[0];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete original
      await client.query('DELETE FROM time_entries WHERE id=$1', [req.params.id]);

      // Insert new segments
      const created = [];
      for (const seg of segments) {
        let wage_type = 'regular';
        if (seg.project_id) {
          const proj = await client.query('SELECT wage_type FROM projects WHERE id=$1 AND company_id=$2', [seg.project_id, companyId]);
          if (proj.rowCount > 0) wage_type = proj.rows[0].wage_type;
        }
        const r = await client.query(
          `INSERT INTO time_entries
             (company_id, user_id, project_id, work_date, start_time, end_time, wage_type,
              notes, break_minutes, mileage, clock_source, clocked_in_by, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending') RETURNING *`,
          [
            companyId, o.user_id, seg.project_id || null, o.work_date,
            seg.start_time, seg.end_time, wage_type,
            o.notes, o.break_minutes || 0, o.mileage,
            'admin', req.user.id,
          ]
        );
        created.push(r.rows[0]);
      }

      await client.query('COMMIT');
      await logAudit(companyId, req.user.id, req.user.full_name, 'entry.split', 'time_entry', parseInt(req.params.id), null);
      res.status(201).json({ created });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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
              ac.current_lat, ac.current_lng, ac.location_updated_at,
              ac.notes, u.full_name, p.name as project_name, p.wage_type,
              ac.clock_source, ac.clocked_in_by, admin_u.full_name AS clocked_in_by_name
       FROM active_clock ac
       JOIN users u ON ac.user_id = u.id
       LEFT JOIN projects p ON ac.project_id = p.id
       LEFT JOIN users admin_u ON ac.clocked_in_by = admin_u.id
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
  const allRoles = req.query.all_roles === 'true';
  const roleFilter = allRoles ? `u.role IN ('worker', 'admin')` : `u.role = 'worker'`;
  const accessIds = req.user.worker_access_ids;
  const accessFilter = accessIds && accessIds.length ? `AND (u.role != 'worker' OR u.id = ANY($3))` : '';
  try {
    const settings = await getSettings(companyId);
    const threshold = parseFloat(settings.overtime_threshold) || 8;
    const queryParams = accessIds && accessIds.length ? [companyId, threshold, accessIds] : [companyId, threshold];
    const result = await pool.query(
      `WITH daily_regular AS (
        SELECT user_id, work_date,
          SUM(EXTRACT(EPOCH FROM (CASE WHEN end_time < start_time THEN end_time + INTERVAL '1 day' - start_time ELSE end_time - start_time END)) / 3600) as day_hours
        FROM time_entries
        WHERE wage_type = 'regular' AND company_id = $1
        GROUP BY user_id, work_date
      ),
      weekly_regular AS (
        SELECT user_id,
          date_trunc('week', work_date) as week_start,
          SUM(day_hours) as week_hours
        FROM daily_regular
        GROUP BY user_id, date_trunc('week', work_date)
      )
      SELECT u.id, u.full_name, u.invoice_name, u.username, u.role, u.language, u.hourly_rate, u.rate_type, u.overtime_rule, u.email, u.admin_permissions, u.worker_access_ids, u.worker_type, u.must_change_password,
        COUNT(te.id) as total_entries,
        COALESCE(SUM(EXTRACT(EPOCH FROM (CASE WHEN te.end_time < te.start_time THEN te.end_time + INTERVAL '1 day' - te.start_time ELSE te.end_time - te.start_time END)) / 3600), 0) as total_hours,
        COALESCE(
          CASE WHEN u.overtime_rule = 'weekly' THEN
            (SELECT SUM(LEAST(week_hours, $2)) FROM weekly_regular wr WHERE wr.user_id = u.id)
          ELSE
            (SELECT SUM(LEAST(day_hours, $2)) FROM daily_regular dr WHERE dr.user_id = u.id)
          END
        , 0) as regular_hours,
        COALESCE(
          CASE WHEN u.overtime_rule = 'none' THEN 0
               WHEN u.overtime_rule = 'weekly' THEN
                 (SELECT SUM(GREATEST(week_hours - $2, 0)) FROM weekly_regular wr WHERE wr.user_id = u.id)
               ELSE
                 (SELECT SUM(GREATEST(day_hours - $2, 0)) FROM daily_regular dr WHERE dr.user_id = u.id)
               END
        , 0) as overtime_hours,
        COALESCE(SUM(CASE WHEN te.wage_type = 'prevailing' THEN EXTRACT(EPOCH FROM (CASE WHEN te.end_time < te.start_time THEN te.end_time + INTERVAL '1 day' - te.start_time ELSE te.end_time - te.start_time END)) / 3600 ELSE 0 END), 0) as prevailing_hours
      FROM users u
      LEFT JOIN time_entries te ON te.user_id = u.id
      WHERE ${roleFilter} AND u.active = true AND u.company_id = $1 ${accessFilter}
      GROUP BY u.id, u.full_name, u.invoice_name, u.username, u.role, u.language, u.hourly_rate, u.rate_type, u.overtime_rule, u.email, u.admin_permissions, u.worker_access_ids, u.worker_type, u.must_change_password
      ORDER BY u.role DESC, u.full_name
      LIMIT 500`,
      queryParams
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
router.post('/workers/:id/entries', requireAdmin, requirePermission('manage_workers'), async (req, res) => {
  const companyId = req.user.company_id;
  const { work_date, start_time, end_time, project_id, notes, break_minutes, mileage } = req.body;
  if (!work_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'work_date, start_time, and end_time are required' });
  }
  try {
    const workerRow = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND company_id = $2 AND active = true',
      [req.params.id, companyId]
    );
    if (workerRow.rowCount === 0) return res.status(404).json({ error: 'Worker not found' });

    let wage_type = 'regular';
    if (project_id) {
      const proj = await pool.query('SELECT wage_type FROM projects WHERE id = $1 AND company_id = $2', [project_id, companyId]);
      if (proj.rowCount === 0) return res.status(400).json({ error: 'Project not found' });
      wage_type = proj.rows[0].wage_type;
    }

    const result = await pool.query(
      `INSERT INTO time_entries
         (company_id, user_id, project_id, work_date, start_time, end_time, wage_type, notes,
          break_minutes, mileage, clock_source, clocked_in_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'log_entry', $11)
       RETURNING *`,
      [
        companyId, req.params.id, project_id || null, work_date,
        start_time, end_time, wage_type, notes || null,
        parseInt(break_minutes) || 0, mileage != null ? parseFloat(mileage) : null,
        req.user.id,
      ]
    );
    await logAudit(companyId, req.user.id, req.user.full_name, 'entry.admin_added', 'time_entry', result.rows[0].id, null);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/workers/:id/entries', requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  const companyId = req.user.company_id;
  try {
    const userResult = await pool.query(
      'SELECT id, full_name, invoice_name, username, email, hourly_rate, rate_type, overtime_rule, guaranteed_weekly_hours FROM users WHERE id = $1 AND role = $2 AND company_id = $3',
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
    const settings = await getSettings(companyId);
    const worker = userResult.rows[0];
    const workerOTRule = worker.overtime_rule || 'daily';
    const { regularHours, overtimeHours } = computeOT(entries, workerOTRule, settings.overtime_threshold);
    const prevailingHours = entries.filter(e => e.wage_type === 'prevailing').reduce((sum, e) => {
      const h = hoursWorked(e.start_time, e.end_time) - (e.break_minutes || 0) / 60;
      return sum + h;
    }, 0);
    const totalHours = regularHours + overtimeHours + prevailingHours;
    const rate = parseFloat(worker.hourly_rate) || settings.default_hourly_rate;
    let regularCost, overtimeCost;
    if (worker.rate_type === 'daily') {
      const dc = computeDailyPayCosts(entries, workerOTRule, settings.overtime_threshold, rate, settings.overtime_multiplier);
      regularCost = dc.regularCost;
      overtimeCost = dc.overtimeCost;
    } else {
      regularCost = regularHours * rate;
      overtimeCost = overtimeHours * rate * settings.overtime_multiplier;
    }
    const prevailingCost = prevailingHours * settings.prevailing_wage_rate;
    const { shortfall: guaranteeShortfall, minHours: guaranteeMinHours, weeks: guaranteeWeeks } =
      computeGuaranteeShortfall(totalHours, worker.guaranteed_weekly_hours, from, to);
    const guaranteeCost = guaranteeShortfall * rate;
    const totalCost = regularCost + overtimeCost + prevailingCost + guaranteeCost;

    res.json({
      worker,
      entries,
      summary: {
        total_hours: totalHours, regular_hours: regularHours, overtime_hours: overtimeHours, prevailing_hours: prevailingHours,
        rate, regular_cost: regularCost, overtime_cost: overtimeCost, prevailing_cost: prevailingCost,
        guarantee_shortfall_hours: guaranteeShortfall, guarantee_min_hours: guaranteeMinHours,
        guarantee_weeks: guaranteeWeeks, guarantee_cost: guaranteeCost,
        total_cost: totalCost,
        overtime_multiplier: settings.overtime_multiplier, prevailing_wage_rate: settings.prevailing_wage_rate,
      },
      period: { from: from || null, to: to || null },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /admin/workers/check-username — check if a username is already taken
router.get('/workers/check-username', requireAdmin, async (req, res) => {
  const { username, exclude_id } = req.query;
  if (!username) return res.json({ taken: false });
  try {
    const companyId = req.user.company_id;
    const result = exclude_id
      ? await pool.query('SELECT id FROM users WHERE username = $1 AND company_id = $2 AND id != $3', [username.toLowerCase().trim(), companyId, exclude_id])
      : await pool.query('SELECT id FROM users WHERE username = $1 AND company_id = $2', [username.toLowerCase().trim(), companyId]);
    res.json({ taken: result.rowCount > 0 });
  } catch (err) {
    res.json({ taken: false });
  }
});

// Invite a worker by email
router.post('/workers/invite', requireAdmin, requirePermission('manage_workers'), async (req, res) => {
  const { full_name, email, role, language, hourly_rate } = req.body;
  if (!full_name || !email) return res.status(400).json({ error: 'full_name and email required' });
  if (full_name.length > 100) return res.status(400).json({ error: 'Full name must be 100 characters or fewer' });
  const companyId = req.user.company_id;
  const assignedRole = role === 'admin' ? 'admin' : 'worker';
  const assignedLanguage = language || 'English';
  const rateVal = parseFloat(hourly_rate);
  if (hourly_rate !== undefined && (isNaN(rateVal) || rateVal < 0)) {
    return res.status(400).json({ error: 'hourly_rate must be a non-negative number' });
  }
  const assignedRate = (!isNaN(rateVal) && rateVal >= 0) ? rateVal : 30;

  // Enforce worker count limit (admins don't count against the limit)
  if (assignedRole === 'worker') {
    const overLimit = await checkWorkerLimit(companyId);
    if (overLimit) {
      const planName = overLimit.plan.charAt(0).toUpperCase() + overLimit.plan.slice(1);
      return res.status(403).json({
        error: `Worker limit reached. Your ${planName} plan allows up to ${overLimit.limit} workers (you have ${overLimit.current}). Upgrade to add more.`,
        code: 'worker_limit_reached',
        limit: overLimit.limit,
        current: overLimit.current,
      });
    }
  }

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
    await logAudit(companyId, req.user.id, req.user.full_name, 'worker.invited', 'worker', result.rows[0].id, full_name, { email });
    const inviteUrl = `${process.env.APP_URL}/accept-invite?token=${token}`;
    let emailSent = true;
    try {
      await sgMail.send({
        from: { name: 'OpsFloA', email: process.env.SENDGRID_FROM_EMAIL },
        to: email,
        subject: `You've been invited to OpsFloA`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <h2 style="color:#1a56db;margin-bottom:8px">You're invited!</h2>
            <p style="color:#444;margin-bottom:8px">Hi ${full_name}, ${req.user.full_name} has invited you to join OpsFloA.</p>
            <p style="color:#444;margin-bottom:24px">Your username is: <strong>${username}</strong></p>
            <a href="${inviteUrl}" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">Set your password</a>
            <p style="color:#999;font-size:13px;margin-top:24px">This invite expires in 7 days.</p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error('Invite email failed:', emailErr?.response?.body || emailErr.message);
      emailSent = false;
    }
    res.status(201).json({ ...result.rows[0], email_sent: emailSent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send invite email to an existing worker who hasn't signed in yet
router.post('/workers/:id/send-invite', requireAdmin, requirePermission('manage_workers'), async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      'SELECT id, full_name, username, email, must_change_password FROM users WHERE id = $1 AND company_id = $2 AND active = true',
      [req.params.id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Worker not found' });
    const worker = result.rows[0];
    if (!worker.email) return res.status(400).json({ error: 'Worker has no email address' });
    if (!worker.must_change_password) return res.status(400).json({ error: 'Worker has already signed in' });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await pool.query(
      'UPDATE users SET invite_token = $1, invite_token_expires = $2, invite_pending = true WHERE id = $3',
      [token, expires, worker.id]
    );
    const inviteUrl = `${process.env.APP_URL}/accept-invite?token=${token}`;
    let emailSent = true;
    try {
      await sgMail.send({
        from: { name: 'OpsFloA', email: process.env.SENDGRID_FROM_EMAIL },
        to: worker.email,
        subject: `You've been invited to OpsFloA`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <h2 style="color:#1a56db;margin-bottom:8px">You're invited!</h2>
            <p style="color:#444;margin-bottom:8px">Hi ${worker.full_name}, ${req.user.full_name} has invited you to join OpsFloA.</p>
            <p style="color:#444;margin-bottom:24px">Your username is: <strong>${worker.username}</strong></p>
            <a href="${inviteUrl}" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">Set your password</a>
            <p style="color:#999;font-size:13px;margin-top:24px">This invite expires in 7 days.</p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error('Send invite email failed:', emailErr?.response?.body || emailErr.message);
      emailSent = false;
    }
    res.json({ email_sent: emailSent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a worker or admin
router.post('/workers', requireAdmin, requirePermission('manage_workers'), async (req, res) => {
  const { password, role } = req.body;
  const username = req.body.username?.trim();
  const full_name = req.body.full_name?.trim();
  const first_name = req.body.first_name?.trim() || null;
  const middle_name = req.body.middle_name?.trim() || null;
  const last_name = req.body.last_name?.trim() || null;
  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'username, password, and full_name required' });
  }
  const companyId = req.user.company_id;
  const assignedRole = role === 'admin' ? 'admin' : 'worker';
  const assignedLanguage = req.body.language || 'English';
  const rateVal = parseFloat(req.body.hourly_rate);
  if (req.body.hourly_rate !== undefined && (isNaN(rateVal) || rateVal < 0)) {
    return res.status(400).json({ error: 'hourly_rate must be a non-negative number' });
  }
  const assignedRate = (!isNaN(rateVal) && rateVal >= 0) ? rateVal : 30;
  const assignedEmail = req.body.email?.trim() || null;
  const VALID_OT_RULES = ['daily', 'weekly', 'none'];
  const assignedRateType = ['hourly', 'daily'].includes(req.body.rate_type) ? req.body.rate_type : 'hourly';
  const assignedOTRule = VALID_OT_RULES.includes(req.body.overtime_rule) ? req.body.overtime_rule : 'daily';
  const VALID_WORKER_TYPES = ['employee', 'contractor', 'subcontractor', 'owner'];
  const assignedWorkerType = VALID_WORKER_TYPES.includes(req.body.worker_type) ? req.body.worker_type : 'employee';

  // Enforce worker count limit (admins don't count against the limit)
  if (assignedRole === 'worker') {
    const overLimit = await checkWorkerLimit(companyId);
    if (overLimit) {
      const planName = overLimit.plan.charAt(0).toUpperCase() + overLimit.plan.slice(1);
      return res.status(403).json({
        error: `Worker limit reached. Your ${planName} plan allows up to ${overLimit.limit} workers (you have ${overLimit.current}). Upgrade to add more.`,
        code: 'worker_limit_reached',
        limit: overLimit.limit,
        current: overLimit.current,
      });
    }
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (company_id, username, password_hash, full_name, first_name, middle_name, last_name, role, language, hourly_rate, rate_type, overtime_rule, email, email_confirmed, must_change_password, worker_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, true, $14) RETURNING id, username, full_name, first_name, middle_name, last_name, role, language, hourly_rate, rate_type, overtime_rule, email, worker_type',
      [companyId, username, hash, full_name, first_name || null, middle_name || null, last_name || null, assignedRole, assignedLanguage, assignedRate, assignedRateType, assignedOTRule, assignedEmail, assignedWorkerType]
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

// Helper: compute how many hours short of the weekly guarantee a period is
function computeGuaranteeShortfall(totalHours, guaranteedWeeklyHours, fromDate, toDate) {
  if (!guaranteedWeeklyHours || parseFloat(guaranteedWeeklyHours) <= 0) return { shortfall: 0, minHours: 0, weeks: 0 };
  let weeks = 1;
  if (fromDate && toDate) {
    const f = new Date(String(fromDate).substring(0, 10) + 'T00:00:00');
    const t = new Date(String(toDate).substring(0, 10) + 'T00:00:00');
    const days = Math.round((t - f) / (1000 * 60 * 60 * 24)) + 1;
    weeks = Math.max(1, Math.round(days / 7));
  }
  const minHours = parseFloat(guaranteedWeeklyHours) * weeks;
  const shortfall = Math.max(0, minHours - totalHours);
  return { shortfall: +shortfall.toFixed(2), minHours: +minHours.toFixed(2), weeks };
}

// Update a worker (full_name, first_name, middle_name, last_name, username, role, language, hourly_rate, rate_type, email, worker_type)
router.patch('/workers/:id', requireAdmin, requirePermission('manage_workers'), async (req, res) => {
  const { full_name, first_name, middle_name, last_name, username, role, language, hourly_rate, rate_type, overtime_rule, email, worker_type } = req.body;
  const hasGuarantee = 'guaranteed_weekly_hours' in req.body;
  if (!full_name && !first_name && !last_name && !username && !role && !language && hourly_rate === undefined && rate_type === undefined && overtime_rule === undefined && email === undefined && worker_type === undefined && !hasGuarantee) {
    return res.status(400).json({ error: 'At least one field required' });
  }
  const companyId = req.user.company_id;
  const assignedRole = role ? (role === 'admin' ? 'admin' : 'worker') : undefined;
  const VALID_RATE_TYPES = ['hourly', 'daily'];
  const VALID_OT_RULES = ['daily', 'weekly', 'none'];
  const VALID_WORKER_TYPES = ['employee', 'contractor', 'subcontractor', 'owner'];
  try {
    if (username) {
      const clean = username.toLowerCase().trim();
      const conflict = await pool.query('SELECT id FROM users WHERE username = $1 AND id != $2', [clean, req.params.id]);
      if (conflict.rowCount > 0) return res.status(409).json({ error: 'Username already taken' });
    }
    if (rate_type !== undefined && !VALID_RATE_TYPES.includes(rate_type)) {
      return res.status(400).json({ error: 'Invalid rate_type' });
    }
    if (overtime_rule !== undefined && !VALID_OT_RULES.includes(overtime_rule)) {
      return res.status(400).json({ error: 'Invalid overtime_rule' });
    }
    if (worker_type !== undefined && !VALID_WORKER_TYPES.includes(worker_type)) {
      return res.status(400).json({ error: 'Invalid worker_type' });
    }
    const fields = [];
    const values = [];
    let idx = 1;
    if (full_name) { fields.push(`full_name = $${idx++}`); values.push(full_name); }
    if (first_name !== undefined) { fields.push(`first_name = $${idx++}`); values.push(first_name || null); }
    if (middle_name !== undefined) { fields.push(`middle_name = $${idx++}`); values.push(middle_name || null); }
    if (last_name !== undefined) { fields.push(`last_name = $${idx++}`); values.push(last_name || null); }
    if (username) { fields.push(`username = $${idx++}`); values.push(username.toLowerCase().trim()); }
    if (assignedRole !== undefined) { fields.push(`role = $${idx++}`); values.push(assignedRole); }
    if (language) { fields.push(`language = $${idx++}`); values.push(language); }
    if (hourly_rate !== undefined) {
      const rv = parseFloat(hourly_rate);
      if (isNaN(rv) || rv < 0) return res.status(400).json({ error: 'hourly_rate must be a non-negative number' });
      fields.push(`hourly_rate = $${idx++}`); values.push(rv);
    }
    if (rate_type !== undefined) { fields.push(`rate_type = $${idx++}`); values.push(rate_type); }
    if (overtime_rule !== undefined) { fields.push(`overtime_rule = $${idx++}`); values.push(overtime_rule); }
    if (email !== undefined) { fields.push(`email = $${idx++}`); values.push(email || null); }
    if (worker_type !== undefined) { fields.push(`worker_type = $${idx++}`); values.push(worker_type); }
    if (req.body.invoice_name !== undefined) { fields.push(`invoice_name = $${idx++}`); values.push(req.body.invoice_name?.trim() || null); }
    if (hasGuarantee) {
      const gv = req.body.guaranteed_weekly_hours;
      if (gv === null || gv === '' || gv === undefined) {
        fields.push(`guaranteed_weekly_hours = $${idx++}`); values.push(null);
      } else {
        const gn = parseFloat(gv);
        if (isNaN(gn) || gn < 0) return res.status(400).json({ error: 'guaranteed_weekly_hours must be a non-negative number' });
        fields.push(`guaranteed_weekly_hours = $${idx++}`); values.push(gn);
      }
    }
    values.push(req.params.id);
    values.push(companyId);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} AND company_id = $${idx + 1} RETURNING id, username, full_name, invoice_name, role, language, hourly_rate, rate_type, overtime_rule, email, worker_type, guaranteed_weekly_hours`,
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

// Update admin permissions for another admin (full-access admins only)
router.patch('/workers/:id/permissions', requireAdmin, async (req, res) => {
  // Only admins with null admin_permissions (full access) may manage others' permissions
  if (req.user.admin_permissions != null) {
    return res.status(403).json({ error: 'Only full-access admins can manage permissions' });
  }
  if (String(req.params.id) === String(req.user.id)) {
    return res.status(400).json({ error: 'You cannot change your own permissions' });
  }
  const VALID_KEYS = ['approve_entries', 'manage_workers', 'manage_projects', 'view_reports', 'manage_settings'];
  const { admin_permissions } = req.body;
  let perms = null;
  if (admin_permissions !== null && admin_permissions !== undefined) {
    perms = {};
    for (const key of VALID_KEYS) perms[key] = admin_permissions[key] === true;
  }
  try {
    const result = await pool.query(
      `UPDATE users SET admin_permissions = $1
       WHERE id = $2 AND company_id = $3 AND role = 'admin' RETURNING id, full_name, admin_permissions`,
      [perms ? JSON.stringify(perms) : null, req.params.id, req.user.company_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Admin not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /admin/workers/:id/worker-access — set which workers a partial admin can access (full-access admins only)
router.patch('/workers/:id/worker-access', requireAdmin, async (req, res) => {
  if (req.user.admin_permissions != null) {
    return res.status(403).json({ error: 'Only full-access admins can manage worker access' });
  }
  if (String(req.params.id) === String(req.user.id)) {
    return res.status(400).json({ error: 'You cannot change your own worker access' });
  }
  const { worker_access_ids } = req.body;
  let ids = null;
  if (Array.isArray(worker_access_ids) && worker_access_ids.length > 0) {
    ids = worker_access_ids.map(Number).filter(n => !isNaN(n));
  }
  try {
    const result = await pool.query(
      `UPDATE users SET worker_access_ids = $1 WHERE id = $2 AND company_id = $3 AND role = 'admin' RETURNING id, full_name, worker_access_ids`,
      [ids, req.params.id, req.user.company_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Admin not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove (soft-delete) a worker
router.delete('/workers/:id', requireAdmin, requirePermission('manage_workers'), async (req, res) => {
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
      `SELECT te.*, COALESCE(u.invoice_name, u.full_name) as worker_name, u.username, u.hourly_rate, u.rate_type, u.overtime_rule
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

    // Per-worker OT using each worker's own rule
    const workerEntries = {};
    entries.filter(e => e.wage_type === 'regular').forEach(e => {
      if (!workerEntries[e.user_id]) workerEntries[e.user_id] = { items: [], rate: parseFloat(e.hourly_rate) || settings.default_hourly_rate, rate_type: e.rate_type, overtime_rule: e.overtime_rule || 'daily' };
      workerEntries[e.user_id].items.push(e);
    });
    let regularHours = 0, overtimeHours = 0, regularCost = 0, overtimeCost = 0;
    Object.values(workerEntries).forEach(({ items, rate, rate_type, overtime_rule }) => {
      const { regularHours: reg, overtimeHours: ot } = computeOT(items, overtime_rule, settings.overtime_threshold);
      regularHours += reg; overtimeHours += ot;
      if (rate_type === 'daily') {
        const dc = computeDailyPayCosts(items, overtime_rule, settings.overtime_threshold, rate, settings.overtime_multiplier);
        regularCost += dc.regularCost;
        overtimeCost += dc.overtimeCost;
      } else {
        regularCost += reg * rate;
        overtimeCost += ot * rate * settings.overtime_multiplier;
      }
    });

    const effectivePrevRate = parseFloat(projectResult.rows[0].prevailing_wage_rate) || settings.prevailing_wage_rate;
    let prevailingHours = 0, prevailingCost = 0;
    entries.filter(e => e.wage_type === 'prevailing').forEach(e => {
      const h = hoursWorked(e.start_time, e.end_time) - (e.break_minutes || 0) / 60;
      prevailingHours += h;
      prevailingCost += h * effectivePrevRate;
    });

    const totalHours = regularHours + overtimeHours + prevailingHours;
    const totalCost = regularCost + overtimeCost + prevailingCost;

    res.json({
      project: projectResult.rows[0],
      entries,
      summary: { total_hours: totalHours, regular_hours: regularHours, overtime_hours: overtimeHours, prevailing_hours: prevailingHours, regular_cost: regularCost, overtime_cost: overtimeCost, prevailing_cost: prevailingCost, total_cost: totalCost, overtime_multiplier: settings.overtime_multiplier, prevailing_wage_rate: effectivePrevRate },
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
          SUM(EXTRACT(EPOCH FROM (CASE WHEN end_time < start_time THEN end_time + INTERVAL '1 day' - start_time ELSE end_time - start_time END)) / 3600) as day_hours
        FROM time_entries
        WHERE wage_type = 'regular' AND company_id = $1
        GROUP BY project_id, work_date
      )
      SELECT p.id, p.name, p.budget_hours, p.budget_dollars,
        COUNT(te.id) as total_entries,
        COUNT(DISTINCT te.user_id) as worker_count,
        COALESCE(SUM(EXTRACT(EPOCH FROM (CASE WHEN te.end_time < te.start_time THEN te.end_time + INTERVAL '1 day' - te.start_time ELSE te.end_time - te.start_time END)) / 3600), 0) as total_hours,
        COALESCE((SELECT SUM(LEAST(day_hours, 8)) FROM daily_regular dr WHERE dr.project_id = p.id), 0) as regular_hours,
        COALESCE((SELECT SUM(GREATEST(day_hours - 8, 0)) FROM daily_regular dr WHERE dr.project_id = p.id), 0) as overtime_hours,
        COALESCE(SUM(CASE WHEN te.wage_type = 'prevailing' THEN EXTRACT(EPOCH FROM (CASE WHEN te.end_time < te.start_time THEN te.end_time + INTERVAL '1 day' - te.start_time ELSE te.end_time - te.start_time END)) / 3600 ELSE 0 END), 0) as prevailing_hours
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
    const result = await pool.query(
      `SELECT id, company_id, name, wage_type, prevailing_wage_rate, geo_lat, geo_lng, geo_radius_ft,
              budget_hours, budget_dollars, active, created_at,
              client_name, job_number, address, start_date, end_date, description, status,
              required_checklist_template_id, progress_pct
       FROM projects WHERE (active = true OR $2 = true) AND company_id = $1 ORDER BY active DESC, name LIMIT 500`,
      [companyId, req.query.include_archived === 'true']
    );
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

// Update project (name and/or wage_type and/or geofence)
router.patch('/projects/:id', requireAdmin, requirePermission('manage_projects'), async (req, res) => {
  const { wage_type, name, geo_lat, geo_lng, geo_radius_ft, clear_geofence, budget_hours, budget_dollars, prevailing_wage_rate, required_checklist_template_id,
          client_name, job_number, address, start_date, end_date, description, status, progress_pct, active } = req.body;
  const VALID_STATUSES = ['planning', 'in_progress', 'on_hold', 'completed'];
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }
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
    if (clear_geofence) {
      fields.push(`geo_lat = NULL`, `geo_lng = NULL`, `geo_radius_ft = NULL`);
    } else {
      if (geo_lat !== undefined) { fields.push(`geo_lat = $${idx++}`); values.push(parseFloat(geo_lat)); }
      if (geo_lng !== undefined) { fields.push(`geo_lng = $${idx++}`); values.push(parseFloat(geo_lng)); }
      if (geo_radius_ft !== undefined) {
        const radius = parseInt(geo_radius_ft);
        if (isNaN(radius) || radius <= 0) return res.status(400).json({ error: 'geo_radius_ft must be a positive number' });
        fields.push(`geo_radius_ft = $${idx++}`); values.push(radius);
      }
    }
    if (budget_hours !== undefined) {
      const bh = budget_hours === null ? null : parseFloat(budget_hours);
      if (bh !== null && (isNaN(bh) || bh < 0)) return res.status(400).json({ error: 'budget_hours must be non-negative' });
      fields.push(`budget_hours = $${idx++}`); values.push(bh);
      // Reset alert tracker so new budget gets fresh alerts
      fields.push(`budget_alert_pct = NULL`);
    }
    if (budget_dollars !== undefined) {
      const bd = budget_dollars === null ? null : parseFloat(budget_dollars);
      if (bd !== null && (isNaN(bd) || bd < 0)) return res.status(400).json({ error: 'budget_dollars must be non-negative' });
      fields.push(`budget_dollars = $${idx++}`); values.push(bd);
    }
    if (prevailing_wage_rate !== undefined) {
      const pwr = prevailing_wage_rate === null ? null : parseFloat(prevailing_wage_rate);
      if (pwr !== null && (isNaN(pwr) || pwr < 0)) return res.status(400).json({ error: 'prevailing_wage_rate must be non-negative' });
      fields.push(`prevailing_wage_rate = $${idx++}`); values.push(pwr);
    }
    if (required_checklist_template_id !== undefined) {
      fields.push(`required_checklist_template_id = $${idx++}`);
      values.push(required_checklist_template_id ? parseInt(required_checklist_template_id) : null);
    }
    if (client_name !== undefined) { fields.push(`client_name = $${idx++}`); values.push(client_name || null); }
    if (job_number !== undefined)   { fields.push(`job_number = $${idx++}`);   values.push(job_number || null); }
    if (address !== undefined)      { fields.push(`address = $${idx++}`);      values.push(address || null); }
    if (start_date !== undefined)   { fields.push(`start_date = $${idx++}`);   values.push(start_date || null); }
    if (end_date !== undefined)     { fields.push(`end_date = $${idx++}`);     values.push(end_date || null); }
    if (description !== undefined)  { fields.push(`description = $${idx++}`);  values.push(description || null); }
    if (status !== undefined)       { fields.push(`status = $${idx++}`);       values.push(status); }
    if (progress_pct !== undefined) {
      const pp = progress_pct === null ? null : parseInt(progress_pct, 10);
      if (pp !== null && (isNaN(pp) || pp < 0 || pp > 100)) return res.status(400).json({ error: 'progress_pct must be 0–100' });
      fields.push(`progress_pct = $${idx++}`); values.push(pp);
    }
    if (active !== undefined) { fields.push(`active = $${idx++}`); values.push(!!active); }
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
router.post('/projects', requireAdmin, requirePermission('manage_projects'), async (req, res) => {
  const { wage_type, prevailing_wage_rate, client_id, job_number, address, start_date, end_date, status, description } = req.body;
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: 'Project name required' });
  const companyId = req.user.company_id;
  const wt = wage_type === 'prevailing' ? 'prevailing' : 'regular';
  const pwr = prevailing_wage_rate != null ? parseFloat(prevailing_wage_rate) : null;
  if (pwr !== null && (isNaN(pwr) || pwr < 0)) return res.status(400).json({ error: 'prevailing_wage_rate must be non-negative' });
  const validStatuses = ['planning', 'in_progress', 'on_hold', 'completed'];
  const st = validStatuses.includes(status) ? status : 'in_progress';
  try {
    let resolvedClientName = null;
    if (client_id) {
      const cr = await pool.query('SELECT name FROM clients WHERE id = $1 AND company_id = $2', [client_id, companyId]);
      if (cr.rows.length) resolvedClientName = cr.rows[0].name;
    }
    const result = await pool.query(
      `INSERT INTO projects (company_id, name, wage_type, prevailing_wage_rate, client_id, client_name, job_number, address, start_date, end_date, status, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [companyId, name, wt, pwr,
       client_id || null, resolvedClientName, job_number?.trim() || null,
       address?.trim() || null, start_date || null, end_date || null, st, description?.trim() || null]
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

// Unified activity feed for a project (field notes + punchlist items)
// Recent photos for a project (across all field reports)
router.get('/projects/:id/photos', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `SELECT ph.url, ph.caption, ph.media_type, ph.created_at,
              COALESCE(r.report_date, r.reported_at::date) AS report_date,
              COALESCE(u.invoice_name, u.full_name) AS worker_name
       FROM field_report_photos ph
       JOIN field_reports r ON ph.report_id = r.id
       JOIN users u ON r.user_id = u.id
       WHERE r.project_id = $1 AND r.company_id = $2 AND ph.url IS NOT NULL
       ORDER BY COALESCE(r.report_date, r.reported_at::date) DESC, ph.created_at DESC
       LIMIT 60`,
      [req.params.id, companyId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Project documents
router.get('/projects/:id/documents/upload-url', requireAdmin, async (req, res) => {
  const { filename, contentType } = req.query;
  if (!filename || !contentType) return res.status(400).json({ error: 'filename and contentType required' });
  const ALLOWED = ['application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv'];
  if (!ALLOWED.includes(contentType)) return res.status(400).json({ error: 'File type not allowed' });
  try {
    const ext = filename.split('.').pop().toLowerCase();
    const { getPresignedUploadUrl } = require('../r2');
    const { uploadUrl, publicUrl } = await getPresignedUploadUrl('documents', ext, contentType);
    res.json({ uploadUrl, publicUrl });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to generate upload URL' }); }
});

router.post('/projects/:id/documents', requireAdmin, async (req, res) => {
  const { name, url, size_bytes } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `INSERT INTO project_documents (company_id, project_id, name, url, size_bytes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [companyId, req.params.id, name.trim(), url, size_bytes || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/projects/:id/documents', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `SELECT d.*, COALESCE(u.full_name, '') AS uploader_name
       FROM project_documents d
       LEFT JOIN users u ON d.uploaded_by = u.id
       WHERE d.project_id = $1 AND d.company_id = $2
       ORDER BY d.created_at DESC`,
      [req.params.id, companyId]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/projects/:id/documents/:docId', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const doc = await pool.query(
      'SELECT url FROM project_documents WHERE id=$1 AND project_id=$2 AND company_id=$3',
      [req.params.docId, req.params.id, companyId]
    );
    if (doc.rowCount === 0) return res.status(404).json({ error: 'Document not found' });
    const { deleteByUrl } = require('../r2');
    await deleteByUrl(doc.rows[0].url).catch(() => {});
    await pool.query('DELETE FROM project_documents WHERE id=$1', [req.params.docId]);
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// RFIs for a project
router.get('/projects/:id/rfis', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `SELECT id, rfi_number, subject, status, directed_to, date_submitted, date_due
       FROM rfis
       WHERE project_id = $1 AND company_id = $2
       ORDER BY rfi_number DESC
       LIMIT 100`,
      [req.params.id, companyId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Project health snapshot — counts + approximate cost in one query
router.get('/projects/:id/health', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM punchlist_items
          WHERE project_id=$1 AND company_id=$2 AND status='open')::int             AS open_punchlist,
         (SELECT COUNT(*) FROM punchlist_items
          WHERE project_id=$1 AND company_id=$2 AND status!='verified')::int        AS active_punchlist,
         (SELECT COUNT(*) FROM rfis
          WHERE project_id=$1 AND company_id=$2 AND status='open')::int             AS open_rfis,
         (SELECT COUNT(*) FROM field_reports
          WHERE project_id=$1 AND company_id=$2
            AND COALESCE(report_date, reported_at::date) >= CURRENT_DATE - 7)::int  AS reports_week,
         (SELECT ROUND(COALESCE(SUM(
            EXTRACT(EPOCH FROM (
              CASE WHEN te.end_time < te.start_time
                THEN te.end_time + INTERVAL '1 day' - te.start_time
                ELSE te.end_time - te.start_time
              END
            )) / 3600 * COALESCE(u.hourly_rate, (
              SELECT value::numeric FROM settings
              WHERE company_id=$2 AND key='default_hourly_rate' LIMIT 1
            ), 30)
          ), 0)::numeric, 0)
          FROM time_entries te
          JOIN users u ON te.user_id = u.id
          WHERE te.project_id=$1 AND te.company_id=$2)                              AS approx_cost`,
      [req.params.id, companyId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/projects/:id/activity', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `WITH notes AS (
         SELECT 'note'::text AS type,
                r.id::text,
                r.notes AS title,
                r.reported_at AS event_at,
                COALESCE(u.invoice_name, u.full_name) AS worker_name,
                NULL::text AS status,
                NULL::text AS priority
         FROM field_reports r
         JOIN users u ON r.user_id = u.id
         WHERE r.project_id = $1 AND r.company_id = $2
           AND r.notes IS NOT NULL AND r.notes <> ''
         ORDER BY r.reported_at DESC
         LIMIT 10
       ),
       punches AS (
         SELECT 'punch'::text AS type,
                pi.id::text,
                pi.title,
                pi.created_at AS event_at,
                NULL::text AS worker_name,
                pi.status,
                pi.priority
         FROM punchlist_items pi
         WHERE pi.project_id = $1 AND pi.company_id = $2
         ORDER BY pi.created_at DESC
         LIMIT 15
       )
       SELECT * FROM notes
       UNION ALL
       SELECT * FROM punches
       ORDER BY event_at DESC
       LIMIT 25`,
      [req.params.id, companyId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Workers who have time entries on this project
router.get('/projects/:id/workers', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `SELECT u.id,
              COALESCE(u.invoice_name, u.full_name) AS worker_name,
              COUNT(te.id)::int AS entry_count,
              ROUND(
                COALESCE(SUM(EXTRACT(EPOCH FROM (
                  CASE WHEN te.end_time < te.start_time
                    THEN te.end_time + INTERVAL '1 day' - te.start_time
                    ELSE te.end_time - te.start_time
                  END
                )) / 3600), 0)::numeric, 1
              ) AS total_hours,
              MAX(te.work_date) AS last_worked
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       WHERE te.project_id = $1 AND te.company_id = $2
       GROUP BY u.id, COALESCE(u.invoice_name, u.full_name)
       ORDER BY total_hours DESC`,
      [req.params.id, companyId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove (soft-delete) a project
router.get('/projects/:id/media-urls', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const photos = await pool.query(
      `SELECT p.url FROM field_report_photos p
       JOIN field_reports r ON p.report_id = r.id
       WHERE r.company_id = $1 AND r.project_id = $2 AND p.url IS NOT NULL`,
      [companyId, req.params.id]
    );
    const attachments = await pool.query(
      `SELECT a.url FROM safety_talk_attachments a
       JOIN safety_talks t ON a.talk_id = t.id
       WHERE t.company_id = $1 AND t.project_id = $2 AND a.url IS NOT NULL`,
      [companyId, req.params.id]
    );
    const urls = [
      ...photos.rows.map(r => r.url),
      ...attachments.rows.map(r => r.url),
    ];
    res.json({ urls, count: urls.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/projects/:id/media-zip', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const projectRow = await pool.query(
      'SELECT name FROM projects WHERE id = $1 AND company_id = $2',
      [req.params.id, companyId]
    );
    if (projectRow.rowCount === 0) return res.status(404).json({ error: 'Project not found' });
    const projectName = projectRow.rows[0].name.replace(/[^a-z0-9]/gi, '_');

    const photos = await pool.query(
      `SELECT p.url FROM field_report_photos p
       JOIN field_reports r ON p.report_id = r.id
       WHERE r.company_id = $1 AND r.project_id = $2 AND p.url IS NOT NULL`,
      [companyId, req.params.id]
    );
    const attachments = await pool.query(
      `SELECT a.url FROM safety_talk_attachments a
       JOIN safety_talks t ON a.talk_id = t.id
       WHERE t.company_id = $1 AND t.project_id = $2 AND a.url IS NOT NULL`,
      [companyId, req.params.id]
    );
    const urls = [
      ...photos.rows.map(r => r.url),
      ...attachments.rows.map(r => r.url),
    ];

    if (urls.length === 0) return res.status(404).json({ error: 'No media found for this project' });

    const archiver = require('archiver');
    const https = require('https');
    const http = require('http');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${projectName}_media.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);
    archive.on('error', err => { console.error('[media-zip]', err); });

    // Fetch and append each file; resolve once the http response stream begins
    await Promise.all(urls.map((url, i) => new Promise(resolve => {
      const ext = url.split('?')[0].split('.').pop().toLowerCase() || 'bin';
      const filename = `${String(i + 1).padStart(4, '0')}.${ext}`;
      const mod = url.startsWith('https') ? https : http;
      mod.get(url, stream => {
        archive.append(stream, { name: filename });
        resolve();
      }).on('error', resolve);
    })));

    await archive.finalize();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Server error' });
  }
});

// Merge one project into another — moves all data, deletes source
router.post('/projects/:id/merge-into/:target_id', requireAdmin, requirePermission('manage_projects'), async (req, res) => {
  const sourceId = parseInt(req.params.id);
  const targetId = parseInt(req.params.target_id);
  const companyId = req.user.company_id;

  if (sourceId === targetId) return res.status(400).json({ error: 'Cannot merge a project into itself' });

  try {
    const check = await pool.query(
      'SELECT id, name FROM projects WHERE id = ANY($1) AND company_id = $2',
      [[sourceId, targetId], companyId]
    );
    if (check.rowCount < 2) return res.status(404).json({ error: 'One or both projects not found' });

    const sourceName = check.rows.find(r => r.id === sourceId)?.name;
    const targetName = check.rows.find(r => r.id === targetId)?.name;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const intTables = [
        'time_entries', 'active_clock', 'shifts', 'field_reports', 'daily_reports',
        'punchlist_items', 'safety_talks', 'incident_reports', 'sub_reports',
        'equipment_hours', 'rfis', 'safety_checklist_submissions',
      ];
      for (const table of intTables) {
        await client.query(`UPDATE ${table} SET project_id = $1 WHERE project_id = $2`, [targetId, sourceId]);
      }
      // inspections stores project_id as UUID/text column
      await client.query(
        `UPDATE inspections SET project_id = $1::text WHERE project_id::text = $2::text AND company_id = $3`,
        [targetId, sourceId, companyId]
      );

      await client.query('DELETE FROM projects WHERE id = $1 AND company_id = $2', [sourceId, companyId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await logAudit(companyId, req.user.id, req.user.full_name, 'project.merged', 'project', sourceId, sourceName, `Merged into "${targetName}" (id ${targetId})`);
    res.json({ success: true, message: `Merged "${sourceName}" into "${targetName}"` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/projects/:id', requireAdmin, requirePermission('manage_projects'), async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const project = await pool.query('SELECT name FROM projects WHERE id = $1 AND company_id = $2', [req.params.id, companyId]);
    const result = await pool.query(
      'UPDATE projects SET active = false WHERE id = $1 AND active = true AND company_id = $2 RETURNING id',
      [req.params.id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Project not found' });
    await logAudit(companyId, req.user.id, req.user.full_name, 'project.deleted', 'project', parseInt(req.params.id), project.rows[0]?.name);

    // Delete project media if setting is enabled — fire and forget
    try {
      const settingRow = await pool.query(
        `SELECT value FROM settings WHERE company_id=$1 AND key='media_delete_on_project_archive'`,
        [companyId]
      );
      if (settingRow.rows[0]?.value === '1') {
        const { deleteMediaForProject } = require('../jobs/mediaRetention');
        deleteMediaForProject(companyId, req.params.id).catch(() => {});
      }
    } catch {}

    res.json({ removed: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /admin/analytics
router.get('/analytics', requireAdmin, requirePermission('view_reports'), requirePlan('business'), async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const [daily, weekly, projects, workers, summary] = await Promise.all([
      // Hours per day for the last 14 days
      pool.query(
        `SELECT work_date::text as date,
                ROUND(SUM(EXTRACT(EPOCH FROM (CASE WHEN end_time < start_time THEN end_time + INTERVAL '1 day' - start_time ELSE end_time - start_time END)) / 3600)::numeric, 2) as hours
         FROM time_entries
         WHERE company_id = $1 AND work_date >= CURRENT_DATE - 13
         GROUP BY work_date ORDER BY work_date ASC`,
        [companyId]
      ),
      // Hours per week for the last 12 weeks
      pool.query(
        `SELECT to_char(date_trunc('week', work_date), 'YYYY-MM-DD') as week_start,
                ROUND(SUM(EXTRACT(EPOCH FROM (CASE WHEN end_time < start_time THEN end_time + INTERVAL '1 day' - start_time ELSE end_time - start_time END)) / 3600)::numeric, 1) as hours
         FROM time_entries
         WHERE company_id = $1 AND work_date >= CURRENT_DATE - 83
         GROUP BY week_start ORDER BY week_start ASC`,
        [companyId]
      ),
      // Top projects by hours, last 30 days
      pool.query(
        `SELECT p.name,
                ROUND(SUM(EXTRACT(EPOCH FROM (CASE WHEN te.end_time < te.start_time THEN te.end_time + INTERVAL '1 day' - te.start_time ELSE te.end_time - te.start_time END)) / 3600)::numeric, 2) as hours
         FROM time_entries te
         JOIN projects p ON te.project_id = p.id
         WHERE te.company_id = $1 AND te.work_date >= CURRENT_DATE - 29
         GROUP BY p.name ORDER BY hours DESC LIMIT 10`,
        [companyId]
      ),
      // Top workers by hours, last 30 days
      pool.query(
        `SELECT u.full_name as name,
                ROUND(SUM(EXTRACT(EPOCH FROM (CASE WHEN te.end_time < te.start_time THEN te.end_time + INTERVAL '1 day' - te.start_time ELSE te.end_time - te.start_time END)) / 3600)::numeric, 2) as hours
         FROM time_entries te
         JOIN users u ON te.user_id = u.id
         WHERE te.company_id = $1 AND te.work_date >= CURRENT_DATE - 29
         GROUP BY u.full_name ORDER BY hours DESC LIMIT 10`,
        [companyId]
      ),
      // Summary stats
      pool.query(
        `SELECT
           ROUND(COALESCE(SUM(CASE WHEN work_date >= date_trunc('week', CURRENT_DATE)
             THEN EXTRACT(EPOCH FROM (CASE WHEN end_time < start_time THEN end_time + INTERVAL '1 day' - start_time ELSE end_time - start_time END)) / 3600 END), 0)::numeric, 1) as hours_this_week,
           COUNT(DISTINCT CASE WHEN work_date >= date_trunc('week', CURRENT_DATE) THEN user_id END) as active_workers_this_week,
           COUNT(DISTINCT CASE WHEN work_date >= date_trunc('month', CURRENT_DATE) THEN user_id END) as active_workers_this_month,
           ROUND(COALESCE(SUM(CASE WHEN work_date >= date_trunc('month', CURRENT_DATE)
             THEN EXTRACT(EPOCH FROM (CASE WHEN end_time < start_time THEN end_time + INTERVAL '1 day' - start_time ELSE end_time - start_time END)) / 3600 END), 0)::numeric, 1) as hours_this_month,
           COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_approvals,
           ROUND(COALESCE(SUM(CASE WHEN work_date >= date_trunc('week', CURRENT_DATE) THEN mileage END), 0)::numeric, 1) as mileage_this_week,
           ROUND(COALESCE(SUM(CASE WHEN work_date >= date_trunc('month', CURRENT_DATE) THEN mileage END), 0)::numeric, 1) as mileage_this_month
         FROM time_entries WHERE company_id = $1`,
        [companyId]
      ),
    ]);

    res.json({
      daily_hours: daily.rows,
      weekly_hours: weekly.rows,
      project_hours: projects.rows,
      worker_hours: workers.rows,
      summary: summary.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /admin/entries/pending — pending time entries for this company (max 200; has_more signals overflow)
router.get('/entries/pending', requireAdmin, requirePermission('approve_entries'), async (req, res) => {
  const companyId = req.user.company_id;
  const LIMIT = 200;
  const accessIds = req.user.worker_access_ids;
  try {
    const workerFilter = accessIds && accessIds.length ? `AND te.user_id = ANY($3)` : '';
    const params = accessIds && accessIds.length ? [companyId, LIMIT + 1, accessIds] : [companyId, LIMIT + 1];
    const result = await pool.query(
      `SELECT te.*, COALESCE(u.invoice_name, u.full_name) as worker_name, u.email as worker_email, p.name as project_name,
              te.clock_source, te.clocked_in_by, admin_u.full_name AS clocked_in_by_name
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       LEFT JOIN projects p ON te.project_id = p.id
       LEFT JOIN users admin_u ON te.clocked_in_by = admin_u.id
       WHERE te.company_id = $1 AND te.status = 'pending' ${workerFilter}
       ORDER BY te.worker_signed_at DESC NULLS LAST, te.work_date DESC, te.start_time DESC
       LIMIT $2`,
      params
    );
    const has_more = result.rows.length > LIMIT;
    res.json({ entries: result.rows.slice(0, LIMIT), has_more });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /admin/entries/recently-approved — entries approved in the last 24 hours
router.get('/entries/recently-approved', requireAdmin, requirePermission('approve_entries'), async (req, res) => {
  const companyId = req.user.company_id;
  const accessIds = req.user.worker_access_ids;
  try {
    const workerFilter = accessIds && accessIds.length ? `AND te.user_id = ANY($2)` : '';
    const params = accessIds && accessIds.length ? [companyId, accessIds] : [companyId];
    const { rows } = await pool.query(
      `SELECT te.id, te.work_date, te.start_time, te.end_time, te.project_id, te.user_id, te.approved_at,
              COALESCE(u.invoice_name, u.full_name) AS worker_name, p.name AS project_name
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       LEFT JOIN projects p ON te.project_id = p.id
       WHERE te.company_id = $1 AND te.status = 'approved'
         AND te.approved_at >= NOW() - INTERVAL '24 hours'
         ${workerFilter}
       ORDER BY te.approved_at DESC
       LIMIT 100`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /admin/entries/approve-all — approve every pending entry for this company
router.post('/entries/approve-all', requireAdmin, requirePermission('approve_entries'), async (req, res) => {
  const companyId = req.user.company_id;
  const accessIds = req.user.worker_access_ids;
  try {
    const workerFilter = accessIds && accessIds.length ? `AND user_id = ANY($3)` : '';
    const params = accessIds && accessIds.length ? [req.user.id, companyId, accessIds] : [req.user.id, companyId];
    const result = await pool.query(
      `UPDATE time_entries SET status = 'approved', locked = true, approved_by = $1, approved_at = NOW()
       WHERE company_id = $2 AND status = 'pending' ${workerFilter} RETURNING id`,
      params
    );
    await logAudit(companyId, req.user.id, req.user.full_name, 'entries.approved_all', 'time_entry', null, null, { count: result.rowCount });
    res.json({ approved: result.rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /admin/entries/:id/approve
router.patch('/entries/:id/approve', requireAdmin, requirePermission('approve_entries'), async (req, res) => {
  const companyId = req.user.company_id;
  const { note } = req.body;
  if (note && note.length > 500) return res.status(400).json({ error: 'Note must be 500 characters or fewer' });
  const accessIds = req.user.worker_access_ids;
  try {
    const workerFilter = accessIds && accessIds.length ? `AND user_id = ANY($5)` : '';
    const params = accessIds && accessIds.length
      ? [note || null, req.user.id, req.params.id, companyId, accessIds]
      : [note || null, req.user.id, req.params.id, companyId];
    const result = await pool.query(
      `UPDATE time_entries SET status = 'approved', locked = true, approval_note = $1, approved_by = $2, approved_at = NOW()
       WHERE id = $3 AND company_id = $4 ${workerFilter} RETURNING *`,
      params
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    await logAudit(companyId, req.user.id, req.user.full_name, 'entry.approved', 'time_entry', parseInt(req.params.id), null);
    const worker = await pool.query('SELECT email, full_name FROM users WHERE id = $1', [result.rows[0].user_id]);
    if (worker.rows[0]?.email) {
      const { work_date, start_time, end_time } = result.rows[0];
      sendEmail(worker.rows[0].email, 'Time entry approved ✓',
        `<p>Hi ${worker.rows[0].full_name},</p><p>Your time entry for <b>${work_date?.toString().substring(0,10)}</b> (${start_time}–${end_time}) has been <b style="color:#059669">approved</b>.</p><p>— OpsFloa</p>`);
    }
    const entry = result.rows[0];
    sendPushToUser(entry.user_id, { title: 'Time entry approved', body: 'An admin approved your time entry.', url: '/dashboard' });
    createInboxItem(entry.user_id, companyId, 'approval', 'Time entry approved ✓',
      `Your entry for ${entry.work_date?.toString().substring(0,10)} (${entry.start_time}–${entry.end_time}) was approved.`, '/dashboard');
    res.json(entry);

    // Budget alert — fire-and-forget after response is sent
    if (entry.project_id) {
      setImmediate(async () => {
        try {
          const proj = await pool.query(
            `SELECT id, name, budget_hours, budget_alert_pct FROM projects WHERE id = $1 AND company_id = $2`,
            [entry.project_id, companyId]
          );
          if (!proj.rows[0] || !proj.rows[0].budget_hours) return;
          const { id: pid, name: pname, budget_hours: budgetH, budget_alert_pct: alertedPct } = proj.rows[0];

          const totals = await pool.query(
            `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (
               CASE WHEN end_time < start_time THEN end_time + INTERVAL '1 day' - start_time
                    ELSE end_time - start_time END)) / 3600), 0) AS approved_hours
             FROM time_entries
             WHERE project_id = $1 AND company_id = $2 AND status = 'approved'`,
            [pid, companyId]
          );
          const approvedH = parseFloat(totals.rows[0].approved_hours);
          const pct = (approvedH / budgetH) * 100;

          let threshold = null;
          if (pct >= 100 && (alertedPct === null || alertedPct < 100)) threshold = 100;
          else if (pct >= 90 && (alertedPct === null || alertedPct < 90)) threshold = 90;
          if (!threshold) return;

          const notifSetting = await pool.query(
            `SELECT value FROM settings WHERE company_id = $1 AND key = 'notify_budget_alerts'`,
            [companyId]
          );
          await pool.query(
            `UPDATE projects SET budget_alert_pct = $1 WHERE id = $2`,
            [threshold, pid]
          );
          if (notifSetting.rows[0]?.value === '0') return;

          const admins = await pool.query(
            `SELECT email, full_name FROM users WHERE company_id = $1 AND role = 'admin' AND email IS NOT NULL`,
            [companyId]
          );
          const subject = threshold === 100
            ? `Budget exceeded: ${pname}`
            : `Budget alert (${threshold}%): ${pname}`;
          const body = threshold === 100
            ? `<p>The project <b>${pname}</b> has exceeded its hour budget.</p><p>Approved: <b>${approvedH.toFixed(1)} hrs</b> / Budget: <b>${budgetH} hrs</b></p><p>— OpsFloa</p>`
            : `<p>The project <b>${pname}</b> has reached ${threshold}% of its hour budget.</p><p>Approved: <b>${approvedH.toFixed(1)} hrs</b> / Budget: <b>${budgetH} hrs</b></p><p>— OpsFloa</p>`;
          for (const admin of admins.rows) {
            sendEmail(admin.email, subject, body);
          }
        } catch (alertErr) {
          console.error('Budget alert error:', alertErr);
        }
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /admin/entries/:id/reject
router.patch('/entries/:id/reject', requireAdmin, requirePermission('approve_entries'), async (req, res) => {
  const companyId = req.user.company_id;
  const { note } = req.body;
  if (note && note.length > 500) return res.status(400).json({ error: 'Note must be 500 characters or fewer' });
  const accessIds = req.user.worker_access_ids;
  try {
    const workerFilter = accessIds && accessIds.length ? `AND user_id = ANY($5)` : '';
    const params = accessIds && accessIds.length
      ? [note || null, req.user.id, req.params.id, companyId, accessIds]
      : [note || null, req.user.id, req.params.id, companyId];
    const result = await pool.query(
      `UPDATE time_entries SET status = 'rejected', approval_note = $1, approved_by = $2, approved_at = NOW()
       WHERE id = $3 AND company_id = $4 ${workerFilter} RETURNING *`,
      params
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    await logAudit(companyId, req.user.id, req.user.full_name, 'entry.rejected', 'time_entry', parseInt(req.params.id), null, { note });
    const rejWorker = await pool.query('SELECT email, full_name FROM users WHERE id = $1', [result.rows[0].user_id]);
    if (rejWorker.rows[0]?.email) {
      const { work_date, start_time, end_time } = result.rows[0];
      sendEmail(rejWorker.rows[0].email, 'Time entry rejected',
        `<p>Hi ${rejWorker.rows[0].full_name},</p><p>Your time entry for <b>${work_date?.toString().substring(0,10)}</b> (${start_time}–${end_time}) was <b style="color:#ef4444">rejected</b>${note ? ` with the note: <i>${note}</i>` : ''}.</p><p>Please log in to review and resubmit.</p><p>— OpsFloa</p>`);
    }
    const rejEntry = result.rows[0];
    sendPushToUser(rejEntry.user_id, {
      title: 'Time entry rejected',
      body: note ? `Reason: ${note}` : 'An admin rejected your time entry.',
      url: '/dashboard',
    });
    createInboxItem(rejEntry.user_id, companyId, 'rejection', 'Time entry rejected',
      `Your entry for ${rejEntry.work_date?.toString().substring(0,10)} was rejected.${note ? ` Reason: ${note}` : ''}`, '/dashboard');
    res.json(rejEntry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /admin/entries/:id/unapprove — revert an approved entry back to pending
router.patch('/entries/:id/unapprove', requireAdmin, requirePermission('approve_entries'), async (req, res) => {
  const companyId = req.user.company_id;
  const accessIds = req.user.worker_access_ids;
  try {
    const workerFilter = accessIds && accessIds.length ? `AND user_id = ANY($3)` : '';
    const params = accessIds && accessIds.length ? [req.params.id, companyId, accessIds] : [req.params.id, companyId];
    const result = await pool.query(
      `UPDATE time_entries
       SET status = 'pending', locked = false, approved_by = NULL, approved_at = NULL, approval_note = NULL
       WHERE id = $1 AND company_id = $2 AND status = 'approved' ${workerFilter}
       RETURNING *`,
      params
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Entry not found or not in approved state' });
    await logAudit(companyId, req.user.id, req.user.full_name, 'entry.unapproved', 'time_entry', parseInt(req.params.id), null);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /admin/entries/:id/unlock
router.patch('/entries/:id/unlock', requireAdmin, requirePermission('approve_entries'), async (req, res) => {
  const companyId = req.user.company_id;
  const accessIds = req.user.worker_access_ids;
  try {
    const workerFilter = accessIds && accessIds.length ? `AND user_id = ANY($3)` : '';
    const params = accessIds && accessIds.length ? [req.params.id, companyId, accessIds] : [req.params.id, companyId];
    const result = await pool.query(
      `UPDATE time_entries SET locked = false WHERE id = $1 AND company_id = $2 ${workerFilter} RETURNING *`,
      params
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    await logAudit(companyId, req.user.id, req.user.full_name, 'entry.unlocked', 'time_entry', parseInt(req.params.id), null);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Pay periods
router.get('/pay-periods', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pp.*, u.full_name as locked_by_name
       FROM pay_periods pp LEFT JOIN users u ON pp.locked_by = u.id
       WHERE pp.company_id = $1 ORDER BY pp.period_start DESC`,
      [req.user.company_id]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/pay-periods', requireAdmin, requirePermission('approve_entries'), async (req, res) => {
  const { period_start, period_end, label } = req.body;
  if (!period_start || !period_end) return res.status(400).json({ error: 'period_start and period_end required' });
  if (period_start >= period_end) return res.status(400).json({ error: 'period_end must be after period_start' });
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `INSERT INTO pay_periods (company_id, period_start, period_end, label, locked_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [companyId, period_start, period_end, label || null, req.user.id]
    );
    await logAudit(companyId, req.user.id, req.user.full_name, 'pay_period.locked', 'pay_period', result.rows[0].id, label || `${period_start} – ${period_end}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A pay period overlapping those dates already exists' });
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/pay-periods/:id', requireAdmin, requirePermission('approve_entries'), async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      'DELETE FROM pay_periods WHERE id = $1 AND company_id = $2 RETURNING *',
      [req.params.id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Pay period not found' });
    await logAudit(companyId, req.user.id, req.user.full_name, 'pay_period.unlocked', 'pay_period', parseInt(req.params.id), result.rows[0].label);
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// CSV Export
router.get('/export', requireAdmin, requirePermission('view_reports'), requirePlan('starter'), async (req, res) => {
  const { from, to, worker_id, project_id, status } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const companyId = req.user.company_id;
  const conditions = ['te.company_id = $1', 'te.work_date >= $2', 'te.work_date <= $3'];
  const values = [companyId, from, to];
  let idx = 4;
  if (worker_id) { conditions.push(`te.user_id = $${idx++}`); values.push(parseInt(worker_id)); }
  if (project_id) { conditions.push(`te.project_id = $${idx++}`); values.push(parseInt(project_id)); }
  if (status) { conditions.push(`te.status = $${idx++}`); values.push(status); }
  try {
    const result = await pool.query(
      `SELECT te.*, COALESCE(u.invoice_name, u.full_name) as worker_name, p.name as project_name,
              to_char(te.work_date, 'YYYY-MM-DD') as work_date_str
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       LEFT JOIN projects p ON te.project_id = p.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY te.work_date, COALESCE(u.invoice_name, u.full_name), te.start_time`,
      values
    );
    const esc = v => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`;
    const fmtTime = t => { const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr % 12 || 12}:${m} ${hr < 12 ? 'AM' : 'PM'}`; };
    const netHours = (s, e, brk) => (hoursWorked(s, e) - (brk || 0) / 60).toFixed(2);
    const headers = ['Worker', 'Project', 'Date', 'Start', 'End', 'Break (min)', 'Net Hours', 'Wage Type', 'Mileage (mi)', 'Status', 'Notes'];
    const lines = [
      headers.join(','),
      ...result.rows.map(r => [
        esc(r.worker_name), esc(r.project_name), esc(r.work_date_str),
        esc(fmtTime(r.start_time)), esc(fmtTime(r.end_time)),
        r.break_minutes || 0, netHours(r.start_time, r.end_time, r.break_minutes),
        esc(r.wage_type), r.mileage != null ? parseFloat(r.mileage).toFixed(1) : '',
        esc(r.status || 'pending'), esc(r.notes),
      ].join(',')),
    ];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="timecrunch-${from}-to-${to}.csv"`);
    res.send(lines.join('\r\n'));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Overtime report
router.get('/overtime-report', requireAdmin, requirePermission('view_reports'), requirePlan('starter'), async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const companyId = req.user.company_id;
  try {
    const s = await getSettings(companyId);
    const rule = s.overtime_rule || 'daily';
    const threshold = parseFloat(s.overtime_threshold) || 8;
    const otMult = parseFloat(s.overtime_multiplier) || 1.5;
    const defaultRate = parseFloat(s.default_hourly_rate) || 30;
    const prevRate = parseFloat(s.prevailing_wage_rate) || 45;

    const workers = await pool.query(
      `SELECT u.id, u.full_name, u.invoice_name, u.hourly_rate, u.rate_type, u.overtime_rule FROM users u
       WHERE u.company_id = $1 AND u.role = 'worker' AND u.active = true
       ORDER BY u.full_name`,
      [companyId]
    );
    const entries = await pool.query(
      `SELECT te.user_id, te.project_id, te.wage_type, te.start_time, te.end_time, te.work_date, te.break_minutes, te.mileage
       FROM time_entries te
       WHERE te.company_id = $1 AND te.work_date >= $2 AND te.work_date <= $3 AND te.status = 'approved'`,
      [companyId, from, to]
    );
    const projectRates = await pool.query(
      'SELECT id, prevailing_wage_rate FROM projects WHERE company_id = $1', [companyId]
    );
    const projectRateMap = {};
    projectRates.rows.forEach(p => { if (p.prevailing_wage_rate != null) projectRateMap[p.id] = parseFloat(p.prevailing_wage_rate); });

    const byWorker = {};
    entries.rows.forEach(e => {
      if (!byWorker[e.user_id]) byWorker[e.user_id] = [];
      byWorker[e.user_id].push(e);
    });

    const rows = workers.rows.map(w => {
      const wEntries = byWorker[w.id] || [];
      const workerOTRule = w.overtime_rule || 'daily';
      const { regularHours, overtimeHours } = computeOT(wEntries, workerOTRule, threshold);
      let prevHours = 0, prevailingCost = 0;
      wEntries.filter(e => e.wage_type === 'prevailing').forEach(e => {
        const h = hoursWorked(e.start_time, e.end_time) - (e.break_minutes || 0) / 60;
        prevHours += h;
        prevailingCost += h * (projectRateMap[e.project_id] ?? prevRate);
      });
      const totalHours = regularHours + overtimeHours + prevHours;
      const rate = parseFloat(w.hourly_rate) || defaultRate;
      let regularCost, overtimeCost;
      if (w.rate_type === 'daily') {
        const dc = computeDailyPayCosts(wEntries, workerOTRule, threshold, rate, otMult);
        regularCost = dc.regularCost;
        overtimeCost = dc.overtimeCost;
      } else {
        regularCost = regularHours * rate;
        overtimeCost = overtimeHours * rate * otMult;
      }
      const totalCost = regularCost + overtimeCost + prevailingCost;
      const mileage = wEntries.reduce((s, e) => s + (parseFloat(e.mileage) || 0), 0);
      return {
        worker_id: w.id, worker_name: w.invoice_name || w.full_name, rate, rate_type: w.rate_type || 'hourly', overtime_rule: workerOTRule,
        regular_hours: parseFloat(regularHours.toFixed(2)),
        overtime_hours: parseFloat(overtimeHours.toFixed(2)),
        prevailing_hours: parseFloat(prevHours.toFixed(2)),
        total_hours: parseFloat(totalHours.toFixed(2)),
        mileage: parseFloat(mileage.toFixed(1)),
        regular_cost: parseFloat(regularCost.toFixed(2)),
        overtime_cost: parseFloat(overtimeCost.toFixed(2)),
        prevailing_cost: parseFloat(prevailingCost.toFixed(2)),
        total_cost: parseFloat(totalCost.toFixed(2)),
      };
    });
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Payroll export CSV
router.get('/payroll-export', requireAdmin, requirePermission('view_reports'), requirePlan('starter'), async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const companyId = req.user.company_id;
  try {
    const s = await getSettings(companyId);
    const rule = s.overtime_rule || 'daily';
    const threshold = parseFloat(s.overtime_threshold) || 8;
    const otMult = parseFloat(s.overtime_multiplier) || 1.5;
    const defaultRate = parseFloat(s.default_hourly_rate) || 30;
    const prevRate = parseFloat(s.prevailing_wage_rate) || 45;

    const workers = await pool.query(
      `SELECT u.id, u.full_name, u.invoice_name, u.hourly_rate, u.rate_type, u.overtime_rule FROM users u
       WHERE u.company_id = $1 AND u.role = 'worker' AND u.active = true
       ORDER BY u.full_name`,
      [companyId]
    );
    const entries = await pool.query(
      `SELECT te.user_id, te.project_id, te.wage_type, te.start_time, te.end_time, te.work_date, te.break_minutes, te.mileage
       FROM time_entries te
       WHERE te.company_id = $1 AND te.work_date >= $2 AND te.work_date <= $3 AND te.status = 'approved'`,
      [companyId, from, to]
    );
    const projectRatesExport = await pool.query(
      'SELECT id, prevailing_wage_rate FROM projects WHERE company_id = $1', [companyId]
    );
    const projectRateMapExport = {};
    projectRatesExport.rows.forEach(p => { if (p.prevailing_wage_rate != null) projectRateMapExport[p.id] = parseFloat(p.prevailing_wage_rate); });

    const byWorker = {};
    entries.rows.forEach(e => {
      if (!byWorker[e.user_id]) byWorker[e.user_id] = [];
      byWorker[e.user_id].push(e);
    });

    const esc = v => v == null ? '' : `"${String(v).replace(/"/g, '""')}"`;
    const headers = ['Worker', 'Rate Type', 'Overtime', 'Rate', 'Regular Hrs', 'OT Hrs', 'Prevailing Hrs', 'Total Hrs', 'Mileage (mi)', 'Regular Pay', 'OT Pay', 'Prevailing Pay', 'Total Pay'];
    const lines = [headers.join(',')];

    workers.rows.forEach(w => {
      const wEntries = byWorker[w.id] || [];
      const workerOTRule = w.overtime_rule || 'daily';
      const { regularHours, overtimeHours } = computeOT(wEntries, workerOTRule, threshold);
      let prevHours = 0, prevailingCost = 0;
      wEntries.filter(e => e.wage_type === 'prevailing').forEach(e => {
        const h = hoursWorked(e.start_time, e.end_time) - (e.break_minutes || 0) / 60;
        prevHours += h;
        prevailingCost += h * (projectRateMapExport[e.project_id] ?? prevRate);
      });
      const rate = parseFloat(w.hourly_rate) || defaultRate;
      const mileage = wEntries.reduce((s, e) => s + (parseFloat(e.mileage) || 0), 0);
      let regularCost, overtimeCost;
      if (w.rate_type === 'daily') {
        const dc = computeDailyPayCosts(wEntries, workerOTRule, threshold, rate, otMult);
        regularCost = dc.regularCost;
        overtimeCost = dc.overtimeCost;
      } else {
        regularCost = regularHours * rate;
        overtimeCost = overtimeHours * rate * otMult;
      }
      lines.push([
        esc(w.invoice_name || w.full_name), w.rate_type || 'hourly', workerOTRule, rate.toFixed(2),
        regularHours.toFixed(2), overtimeHours.toFixed(2), prevHours.toFixed(2),
        (regularHours + overtimeHours + prevHours).toFixed(2),
        mileage.toFixed(1),
        regularCost.toFixed(2),
        overtimeCost.toFixed(2),
        prevailingCost.toFixed(2),
        (regularCost + overtimeCost + prevailingCost).toFixed(2),
      ].join(','));
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-${from}-to-${to}.csv"`);
    res.send(lines.join('\r\n'));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /admin/company — company profile
router.get('/company', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, subscription_status, trial_ends_at, plan, address, phone, contact_email FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    res.json(result.rows[0] || {});
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /admin/company — update company profile
router.patch('/company', requireAdmin, async (req, res) => {
  const { name, address, phone, contact_email } = req.body;
  if (name !== undefined && !name?.trim()) return res.status(400).json({ error: 'name cannot be empty' });
  try {
    const fields = [];
    const values = [];
    let idx = 1;
    if (name !== undefined) {
      const existing = await pool.query('SELECT id FROM companies WHERE lower(name) = lower($1) AND id != $2', [name.trim(), req.user.company_id]);
      if (existing.rowCount > 0) return res.status(409).json({ error: 'That company name is already taken' });
      fields.push(`name = $${idx++}`); values.push(name.trim());
    }
    if (address !== undefined) { fields.push(`address = $${idx++}`); values.push(address || null); }
    if (phone !== undefined) { fields.push(`phone = $${idx++}`); values.push(phone || null); }
    if (contact_email !== undefined) { fields.push(`contact_email = $${idx++}`); values.push(contact_email || null); }
    if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    values.push(req.user.company_id);
    const result = await pool.query(
      `UPDATE companies SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, address, phone, contact_email`,
      values
    );
    await logAudit(req.user.company_id, req.user.id, req.user.full_name, 'company.updated', 'company', req.user.company_id, result.rows[0].name);
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Audit log
router.get('/audit-log', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const limit = parseInt(req.query.limit) || 30;
  const offset = parseInt(req.query.offset) || 0;
  const { group, from, to } = req.query;
  const conditions = ['company_id = $1'];
  const values = [companyId];
  let idx = 2;
  if (group) {
    if (!/^[a-zA-Z0-9_]+$/.test(group)) return res.status(400).json({ error: 'Invalid group' });
    conditions.push(`action LIKE $${idx++}`); values.push(`${group}.%`);
  }
  if (from) { conditions.push(`created_at >= $${idx++}`); values.push(from); }
  if (to) { conditions.push(`created_at < ($${idx++}::date + interval '1 day')`); values.push(to); }
  const where = conditions.join(' AND ');
  try {
    const result = await pool.query(
      `SELECT id, actor_name, action, entity_type, entity_id, entity_name, details, created_at
       FROM audit_log WHERE ${where}
       ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    );
    const total = await pool.query(`SELECT COUNT(*) FROM audit_log WHERE ${where}`, values);
    res.json({ entries: result.rows, total: parseInt(total.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /admin/broadcast — push a message to all active workers
router.post('/broadcast', requireAdmin, requirePermission('manage_settings'), requirePlan('business'), async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'message required' });
  if (message.length > 200) return res.status(400).json({ error: 'Message must be 200 characters or fewer' });
  const companyId = req.user.company_id;
  await sendPushToAllWorkers(companyId, {
    title: `📢 ${req.user.company_name || 'Announcement'}`,
    body: message.trim(),
    url: '/dashboard',
  });
  // Create inbox item for every active worker (single batch insert)
  const broadcastWorkers = await pool.query(
    `SELECT id FROM users WHERE company_id = $1 AND role = 'worker' AND active = true`,
    [companyId]
  );
  createInboxItemBatch(
    broadcastWorkers.rows.map(w => w.id),
    companyId, 'announcement',
    `📢 ${req.user.company_name || 'Announcement'}`,
    message.trim(), '/dashboard'
  );
  await logAudit(companyId, req.user.id, req.user.full_name, 'broadcast.sent', null, null, null, { message: message.trim() });
  res.json({ sent: true });
});

// GET /admin/certified-payroll?week_end=YYYY-MM-DD&project_id=N
// Returns prevailing-wage hours by worker broken down by day of week for a 7-day window
router.get('/certified-payroll', requireAdmin, requirePermission('view_reports'), requireProAddon, async (req, res) => {
  const { week_end, project_id } = req.query;
  if (!week_end) return res.status(400).json({ error: 'week_end required' });
  const companyId = req.user.company_id;

  const weekEndDate = new Date(week_end + 'T00:00:00');
  const weekStartDate = new Date(weekEndDate);
  weekStartDate.setDate(weekStartDate.getDate() - 6);
  const weekStart = weekStartDate.toISOString().substring(0, 10);

  try {
    const companyRow = await pool.query('SELECT name FROM companies WHERE id = $1', [companyId]);
    const contractor = companyRow.rows[0]?.name || '';

    let projectName = null;
    let projectPrevRate = null;
    if (project_id) {
      const pr = await pool.query('SELECT name, prevailing_wage_rate FROM projects WHERE id = $1 AND company_id = $2', [project_id, companyId]);
      projectName = pr.rows[0]?.name || null;
      projectPrevRate = pr.rows[0]?.prevailing_wage_rate != null ? parseFloat(pr.rows[0].prevailing_wage_rate) : null;
    }

    const conditions = ['te.company_id = $1', 'te.work_date >= $2', 'te.work_date <= $3'];
    const values = [companyId, weekStart, week_end];
    let idx = 4;
    if (project_id) { conditions.push(`te.project_id = $${idx++}`); values.push(parseInt(project_id)); }

    const result = await pool.query(
      `SELECT te.user_id, COALESCE(u.invoice_name, u.full_name) as worker_name, u.hourly_rate,
              to_char(te.work_date, 'YYYY-MM-DD') as work_date,
              te.start_time, te.end_time, te.break_minutes, te.wage_type
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY COALESCE(u.invoice_name, u.full_name), te.work_date, te.start_time`,
      values
    );

    const s = await getSettings(companyId);
    const defaultRate = parseFloat(s.default_hourly_rate) || 30;
    const prevRate = projectPrevRate ?? parseFloat(s.prevailing_wage_rate) ?? 45;

    const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const workerMap = {};

    for (const row of result.rows) {
      if (!workerMap[row.user_id]) {
        workerMap[row.user_id] = {
          worker_id: row.user_id,
          worker_name: row.worker_name,  // already COALESCE(invoice_name, full_name) from SQL
          rate: parseFloat(row.hourly_rate) || defaultRate,
          regular_days: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
          prevailing_days: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
        };
      }
      const w = workerMap[row.user_id];
      const dayKey = DAY_KEYS[new Date(row.work_date + 'T00:00:00').getDay()];
      const h = hoursWorked(row.start_time, row.end_time) - (row.break_minutes || 0) / 60;
      if (row.wage_type === 'prevailing') {
        w.prevailing_days[dayKey] = +(w.prevailing_days[dayKey] + h).toFixed(2);
      } else {
        w.regular_days[dayKey] = +(w.regular_days[dayKey] + h).toFixed(2);
      }
    }

    const workers = Object.values(workerMap).map(w => {
      const regTotal = +Object.values(w.regular_days).reduce((s, h) => s + h, 0).toFixed(2);
      const prevTotal = +Object.values(w.prevailing_days).reduce((s, h) => s + h, 0).toFixed(2);
      return { ...w, regular_total: regTotal, prevailing_total: prevTotal, total: +(regTotal + prevTotal).toFixed(2), prevailing_rate: prevRate };
    });

    res.json({ week_start: weekStart, week_end, contractor, project: projectName, workers });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Analytics dashboard — summary, weekly trend, by-project, top workers
router.get('/analytics', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const hoursExpr = `EXTRACT(EPOCH FROM (CASE WHEN end_time < start_time THEN end_time + INTERVAL '1 day' - start_time ELSE end_time - start_time END))/3600`;
  try {
    const [summaryRes, weeklyRes, byProjectRes, topWorkersRes, statusRes] = await Promise.all([
      pool.query(`
        SELECT
          ROUND(COALESCE(SUM(CASE WHEN work_date >= date_trunc('month', CURRENT_DATE) THEN ${hoursExpr} END), 0)::numeric, 1) AS month_hours,
          ROUND(COALESCE(SUM(CASE WHEN work_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
                                   AND work_date < date_trunc('month', CURRENT_DATE) THEN ${hoursExpr} END), 0)::numeric, 1) AS prev_month_hours,
          COUNT(DISTINCT CASE WHEN work_date >= date_trunc('month', CURRENT_DATE) THEN user_id END) AS month_workers,
          COUNT(DISTINCT CASE WHEN work_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
                               AND work_date < date_trunc('month', CURRENT_DATE) THEN user_id END) AS prev_month_workers,
          COUNT(DISTINCT CASE WHEN work_date >= date_trunc('month', CURRENT_DATE) THEN project_id END) AS month_projects,
          COUNT(CASE WHEN work_date >= date_trunc('month', CURRENT_DATE) THEN 1 END) AS month_entries
        FROM time_entries
        WHERE company_id = $1 AND status = 'approved'
          AND work_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
      `, [companyId]),

      pool.query(`
        SELECT
          date_trunc('week', work_date::timestamp)::date AS week_start,
          ROUND(COALESCE(SUM(${hoursExpr}), 0)::numeric, 1) AS hours,
          COUNT(DISTINCT user_id) AS workers,
          COUNT(*) AS entries
        FROM time_entries
        WHERE company_id = $1 AND status = 'approved'
          AND work_date >= CURRENT_DATE - INTERVAL '56 days'
        GROUP BY week_start
        ORDER BY week_start
      `, [companyId]),

      pool.query(`
        SELECT
          p.name AS project_name,
          ROUND(COALESCE(SUM(${hoursExpr}), 0)::numeric, 1) AS hours,
          COUNT(DISTINCT te.user_id) AS workers
        FROM time_entries te
        JOIN projects p ON te.project_id = p.id
        WHERE te.company_id = $1 AND te.status = 'approved'
          AND te.work_date >= date_trunc('month', CURRENT_DATE)
          AND te.project_id IS NOT NULL
        GROUP BY p.id, p.name
        ORDER BY hours DESC
        LIMIT 10
      `, [companyId]),

      pool.query(`
        SELECT
          COALESCE(u.invoice_name, u.full_name) AS worker_name,
          ROUND(COALESCE(SUM(${hoursExpr}), 0)::numeric, 1) AS hours,
          COUNT(*) AS entries
        FROM time_entries te
        JOIN users u ON te.user_id = u.id
        WHERE te.company_id = $1 AND te.status = 'approved'
          AND te.work_date >= date_trunc('month', CURRENT_DATE)
        GROUP BY u.id, u.invoice_name, u.full_name
        ORDER BY hours DESC
        LIMIT 10
      `, [companyId]),

      pool.query(`
        SELECT status, COUNT(*) AS count
        FROM projects
        WHERE company_id = $1 AND active = true
        GROUP BY status
      `, [companyId]),
    ]);

    res.json({
      summary: summaryRes.rows[0],
      weekly: weeklyRes.rows,
      by_project: byProjectRes.rows,
      top_workers: topWorkersRes.rows,
      project_statuses: statusRes.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/support', requireAdmin, async (req, res) => {
  const { subject, message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });
  const { sendEmail } = require('../email');
  const companyName = req.user.company_name || 'Unknown company';
  const userName = req.user.full_name || req.user.username || 'Unknown user';
  const userEmail = req.user.email || '';
  const subjectLine = subject?.trim() ? subject.trim() : 'Support Request';
  const body = '<p><strong>From:</strong> ' + userName + ' (' + userEmail + ')</p>' +
    '<p><strong>Company:</strong> ' + companyName + '</p>' +
    '<p><strong>Subject:</strong> ' + subjectLine + '</p><hr/>' +
    '<p>' + message.trim().replace(/\n/g, '<br/>') + '</p>';
  await sendEmail('support@opsfloa.com', '[OpsFloa Support] ' + subjectLine + ' — ' + companyName, body);
  res.json({ ok: true });
});

// GET /admin/audit-log — recent audit events for this company
router.get('/audit-log', requireAdmin, async (req, res) => {
  const { limit = 25, offset = 0, group = '', from = '', to = '' } = req.query;
  const companyId = req.user.company_id;
  try {
    const safeLimit = Math.min(parseInt(limit) || 25, 100);
    const safeOffset = parseInt(offset) || 0;
    const conditions = ['company_id = $1'];
    const params = [companyId];
    if (group) { params.push(`${group}.%`); conditions.push(`action LIKE $${params.length}`); }
    if (from)  { params.push(from); conditions.push(`created_at >= $${params.length}::date`); }
    if (to)    { params.push(to);   conditions.push(`created_at < ($${params.length}::date + INTERVAL '1 day')`); }
    const where = conditions.join(' AND ');
    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT id, actor_name, action, entity_type, entity_name, details, created_at
         FROM audit_log WHERE ${where}
         ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, safeLimit, safeOffset]
      ),
      pool.query(`SELECT COUNT(*) FROM audit_log WHERE ${where}`, params),
    ]);
    res.json({ entries: dataRes.rows, total: parseInt(countRes.rows[0].count) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /admin/projects/:id/rfis — create a new RFI
router.post('/projects/:id/rfis', requireAdmin, async (req, res) => {
  const { subject, directed_to, description, date_submitted, date_due } = req.body;
  if (!subject?.trim()) return res.status(400).json({ error: 'subject is required' });
  const companyId = req.user.company_id;
  try {
    const projCheck = await pool.query('SELECT id FROM projects WHERE id = $1 AND company_id = $2', [req.params.id, companyId]);
    if (projCheck.rowCount === 0) return res.status(404).json({ error: 'Project not found' });
    const maxNum = await pool.query(
      'SELECT COALESCE(MAX(rfi_number), 0) + 1 AS next FROM rfis WHERE project_id = $1 AND company_id = $2',
      [req.params.id, companyId]
    );
    const rfi_number = maxNum.rows[0].next;
    const today = new Date().toLocaleDateString('en-CA');
    const result = await pool.query(
      `INSERT INTO rfis (company_id, project_id, rfi_number, subject, description, directed_to, submitted_by, date_submitted, date_due, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open')
       RETURNING id, rfi_number, subject, status, directed_to, date_submitted, date_due`,
      [companyId, req.params.id, rfi_number, subject.trim(), description || null,
       directed_to || null, req.user.full_name, date_submitted || today, date_due || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── Clients ───────────────────────────────────────────────────────────────────

router.get('/clients', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `SELECT c.*,
        COUNT(DISTINCT p.id) FILTER (WHERE p.active = true) AS project_count,
        COUNT(DISTINCT d.id) AS document_count,
        MIN(d.expires_at) FILTER (WHERE d.expires_at IS NOT NULL AND d.expires_at >= CURRENT_DATE) AS next_expiry
       FROM clients c
       LEFT JOIN projects p ON p.client_id = c.id AND p.company_id = $1
       LEFT JOIN client_documents d ON d.client_id = c.id AND d.company_id = $1
       WHERE c.company_id = $1 AND c.active = true
       GROUP BY c.id
       ORDER BY c.name`,
      [companyId]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/clients', requireAdmin, async (req, res) => {
  const { name, contact_name, contact_email, contact_phone, address, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Client name is required' });
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `INSERT INTO clients (company_id, name, contact_name, contact_email, contact_phone, address, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [companyId, name.trim(), contact_name || null, contact_email || null,
       contact_phone || null, address || null, notes || null]
    );
    res.status(201).json({ ...result.rows[0], project_count: 0, document_count: 0 });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.patch('/clients/:id', requireAdmin, async (req, res) => {
  const { name, contact_name, contact_email, contact_phone, address, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Client name is required' });
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `UPDATE clients SET name=$1, contact_name=$2, contact_email=$3, contact_phone=$4,
       address=$5, notes=$6 WHERE id=$7 AND company_id=$8 RETURNING *`,
      [name.trim(), contact_name || null, contact_email || null, contact_phone || null,
       address || null, notes || null, req.params.id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/clients/:id', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    await pool.query('UPDATE clients SET active=false WHERE id=$1 AND company_id=$2', [req.params.id, companyId]);
    await pool.query('UPDATE projects SET client_id=NULL WHERE client_id=$1 AND company_id=$2', [req.params.id, companyId]);
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Client documents
const CLIENT_DOC_TYPES = ['w9', 'w2', 'coi', 'contract', 'license', 'other'];

router.post('/clients/:id/documents/upload', requireAdmin, async (req, res) => {
  const { dataUrl, name, doc_type, expires_at, direction } = req.body;
  if (!dataUrl || !name) return res.status(400).json({ error: 'dataUrl and name required' });
  const companyId = req.user.company_id;
  const CLIENT_DOC_TYPES_LOCAL = ['coi', 'w9', 'w2', 'contract', 'license', 'other'];
  const safeType = CLIENT_DOC_TYPES_LOCAL.includes(doc_type) ? doc_type : 'other';
  const safeDir = direction === 'from_company' ? 'from_company' : 'from_client';
  try {
    const { uploadBase64 } = require('../r2');
    const { url, sizeBytes } = await uploadBase64(dataUrl, 'client-docs');
    const result = await pool.query(
      `INSERT INTO client_documents (company_id, client_id, name, url, size_bytes, doc_type, expires_at, uploaded_by, direction)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [companyId, req.params.id, name.trim(), url, sizeBytes || null,
       safeType, expires_at || null, req.user.id, safeDir]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Upload failed' }); }
});

router.post('/clients/:id/documents', requireAdmin, async (req, res) => {
  const { name, url, size_bytes, doc_type, expires_at } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  const companyId = req.user.company_id;
  const safeType = CLIENT_DOC_TYPES.includes(doc_type) ? doc_type : 'other';
  try {
    const result = await pool.query(
      `INSERT INTO client_documents (company_id, client_id, name, url, size_bytes, doc_type, expires_at, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [companyId, req.params.id, name.trim(), url, size_bytes || null,
       safeType, expires_at || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/clients/:id/documents', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `SELECT d.*, COALESCE(u.full_name, '') AS uploader_name
       FROM client_documents d
       LEFT JOIN users u ON d.uploaded_by = u.id
       WHERE d.client_id = $1 AND d.company_id = $2
       ORDER BY d.doc_type, d.created_at DESC`,
      [req.params.id, companyId]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/clients/:id/documents/:docId', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const doc = await pool.query(
      'SELECT url FROM client_documents WHERE id=$1 AND client_id=$2 AND company_id=$3',
      [req.params.docId, req.params.id, companyId]
    );
    if (doc.rowCount === 0) return res.status(404).json({ error: 'Document not found' });
    const { deleteByUrl } = require('../r2');
    await deleteByUrl(doc.rows[0].url).catch(() => {});
    await pool.query('DELETE FROM client_documents WHERE id=$1', [req.params.docId]);
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
