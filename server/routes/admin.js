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
  const numericKeys = [...rateKeys, ...notifKeys, 'overtime_threshold'];
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
      SELECT u.id, u.full_name, u.username, u.role, u.language, u.hourly_rate, u.rate_type, u.overtime_rule, u.email, u.admin_permissions, u.worker_access_ids, u.worker_type, u.must_change_password,
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
      GROUP BY u.id, u.full_name, u.username, u.role, u.language, u.hourly_rate, u.rate_type, u.overtime_rule, u.email, u.admin_permissions, u.worker_access_ids, u.worker_type, u.must_change_password
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
router.get('/workers/:id/entries', requireAdmin, async (req, res) => {
  const { from, to } = req.query;
  const companyId = req.user.company_id;
  try {
    const userResult = await pool.query(
      'SELECT id, full_name, username, email, hourly_rate, rate_type, overtime_rule FROM users WHERE id = $1 AND role = $2 AND company_id = $3',
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
    const totalCost = regularCost + overtimeCost + prevailingCost;

    res.json({
      worker,
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

// GET /admin/workers/check-username — check if a username is already taken
router.get('/workers/check-username', requireAdmin, async (req, res) => {
  const { username, exclude_id } = req.query;
  if (!username) return res.json({ taken: false });
  try {
    const result = exclude_id
      ? await pool.query('SELECT id FROM users WHERE username = $1 AND id != $2', [username.toLowerCase().trim(), exclude_id])
      : await pool.query('SELECT id FROM users WHERE username = $1', [username.toLowerCase().trim()]);
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

// Update a worker (full_name, first_name, middle_name, last_name, username, role, language, hourly_rate, rate_type, email, worker_type)
router.patch('/workers/:id', requireAdmin, requirePermission('manage_workers'), async (req, res) => {
  const { full_name, first_name, middle_name, last_name, username, role, language, hourly_rate, rate_type, overtime_rule, email, worker_type } = req.body;
  if (!full_name && !first_name && !last_name && !username && !role && !language && hourly_rate === undefined && rate_type === undefined && overtime_rule === undefined && email === undefined && worker_type === undefined) {
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
    values.push(req.params.id);
    values.push(companyId);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} AND company_id = $${idx + 1} RETURNING id, username, full_name, role, language, hourly_rate, rate_type, overtime_rule, email, worker_type`,
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
      `SELECT te.*, u.full_name as worker_name, u.username, u.hourly_rate, u.rate_type, u.overtime_rule
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
              budget_hours, budget_dollars, active, created_at
       FROM projects WHERE active = true AND company_id = $1 ORDER BY name LIMIT 500`,
      [companyId]
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
  const { wage_type, name, geo_lat, geo_lng, geo_radius_ft, clear_geofence, budget_hours, budget_dollars, prevailing_wage_rate, required_checklist_template_id } = req.body;
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
  const { wage_type, prevailing_wage_rate } = req.body;
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: 'Project name required' });
  const companyId = req.user.company_id;
  const wt = wage_type === 'prevailing' ? 'prevailing' : 'regular';
  const pwr = prevailing_wage_rate != null ? parseFloat(prevailing_wage_rate) : null;
  if (pwr !== null && (isNaN(pwr) || pwr < 0)) return res.status(400).json({ error: 'prevailing_wage_rate must be non-negative' });
  try {
    const result = await pool.query(
      'INSERT INTO projects (company_id, name, wage_type, prevailing_wage_rate) VALUES ($1, $2, $3, $4) RETURNING *',
      [companyId, name, wt, pwr]
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
           COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_approvals
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
      `SELECT te.*, u.full_name as worker_name, u.email as worker_email, p.name as project_name
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       LEFT JOIN projects p ON te.project_id = p.id
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
      `SELECT te.*, u.full_name as worker_name, p.name as project_name,
              to_char(te.work_date, 'YYYY-MM-DD') as work_date_str
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       LEFT JOIN projects p ON te.project_id = p.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY te.work_date, u.full_name, te.start_time`,
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
      `SELECT u.id, u.full_name, u.hourly_rate, u.rate_type, u.overtime_rule FROM users u
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
        worker_id: w.id, worker_name: w.full_name, rate, rate_type: w.rate_type || 'hourly', overtime_rule: workerOTRule,
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
      `SELECT u.id, u.full_name, u.hourly_rate, u.rate_type, u.overtime_rule FROM users u
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
        esc(w.full_name), w.rate_type || 'hourly', workerOTRule, rate.toFixed(2),
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
  if (group) { conditions.push(`action LIKE $${idx++}`); values.push(`${group}.%`); }
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
      `SELECT te.user_id, u.full_name as worker_name, u.hourly_rate,
              to_char(te.work_date, 'YYYY-MM-DD') as work_date,
              te.start_time, te.end_time, te.break_minutes, te.wage_type
       FROM time_entries te
       JOIN users u ON te.user_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY u.full_name, te.work_date, te.start_time`,
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
          worker_name: row.worker_name,
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

module.exports = router;
