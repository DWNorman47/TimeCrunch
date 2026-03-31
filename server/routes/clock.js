const router = require('express').Router();
const pool = require('../db');
const sgMail = require('@sendgrid/mail');
const { requireAuth } = require('../middleware/auth');
const { haversineDistanceFt } = require('../utils/geoUtils');
const { sendPushToCompanyAdmins } = require('../push');
const { createInboxItem } = require('./inbox');
const { applySettingsRows, SETTINGS_DEFAULTS } = require('../settingsDefaults');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// GET /api/clock/status — returns active clock-in for this user, if any
router.get('/status', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ac.*, p.name as project_name, p.wage_type
       FROM active_clock ac
       LEFT JOIN projects p ON ac.project_id = p.id
       WHERE ac.user_id = $1`,
      [req.user.id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const { validCoords } = require('../utils/geoUtils');

// POST /api/clock/in
router.post('/in', requireAuth, async (req, res) => {
  const { project_id, notes, lat, lng, local_work_date, timezone, location_denied } = req.body;
  if ((lat != null || lng != null) && !validCoords(lat, lng)) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }
  const companyId = req.user.company_id;
  try {
    // Check if projects feature is enabled for this company
    const featRow = await pool.query(
      `SELECT value FROM settings WHERE company_id = $1 AND key = 'feature_projects'`,
      [companyId]
    );
    const projectsEnabled = featRow.rows[0]?.value !== '0';

    if (!project_id && projectsEnabled) return res.status(400).json({ error: 'project_id required' });

    // Check global checklist requirement
    const globalChecklistRow = await pool.query(
      `SELECT value FROM settings WHERE company_id=$1 AND key='global_required_checklist_template_id'`,
      [companyId]
    );
    const globalChecklistId = globalChecklistRow.rows[0]?.value ? parseInt(globalChecklistRow.rows[0].value) : null;

    // Verify project belongs to this company and fetch geofence (only when project provided)
    if (project_id) {
      const proj = await pool.query(
        'SELECT id, geo_lat, geo_lng, geo_radius_ft, required_checklist_template_id FROM projects WHERE id = $1 AND company_id = $2 AND active = true',
        [project_id, companyId]
      );
      if (proj.rowCount === 0) return res.status(400).json({ error: 'Project not found' });

      // Geofence check
      const { geo_lat, geo_lng, geo_radius_ft } = proj.rows[0];
      if (geo_lat && geo_lng && geo_radius_ft) {
        if (!lat || !lng) {
          return res.status(403).json({ error: 'This job site requires location access to clock in. Please enable GPS and try again.', geofence: true });
        }
        const distanceFt = Math.round(haversineDistanceFt(lat, lng, parseFloat(geo_lat), parseFloat(geo_lng)));
        if (distanceFt > geo_radius_ft) {
          return res.status(403).json({
            error: `You are ${distanceFt.toLocaleString()} ft from the job site. Must be within ${geo_radius_ft.toLocaleString()} ft to clock in.`,
            geofence: true,
            distance_ft: distanceFt,
            radius_ft: geo_radius_ft,
          });
        }
      }

      // Checklist requirement (project-level overrides global)
      const projectChecklistId = proj.rows[0].required_checklist_template_id;
      const requiredChecklistId = projectChecklistId || globalChecklistId;
      if (requiredChecklistId) {
        const sub = await pool.query(
          `SELECT id FROM safety_checklist_submissions
           WHERE company_id=$1 AND template_id=$2 AND submitted_by=$3 AND check_date=CURRENT_DATE`,
          [companyId, requiredChecklistId, req.user.id]
        );
        if (sub.rowCount === 0) {
          return res.status(403).json({
            error: 'Complete the required safety checklist before clocking in.',
            checklist_required: true,
            template_id: requiredChecklistId,
          });
        }
      }
    } else if (globalChecklistId) {
      // No project selected but global requirement exists
      const sub = await pool.query(
        `SELECT id FROM safety_checklist_submissions
         WHERE company_id=$1 AND template_id=$2 AND submitted_by=$3 AND check_date=CURRENT_DATE`,
        [companyId, globalChecklistId, req.user.id]
      );
      if (sub.rowCount === 0) {
        return res.status(403).json({
          error: 'Complete the required safety checklist before clocking in.',
          checklist_required: true,
          template_id: globalChecklistId,
        });
      }
    }

    // Upsert — replace any existing clock-in (safety valve)
    const result = await pool.query(
      `INSERT INTO active_clock (user_id, company_id, project_id, clock_in_time, clock_in_lat, clock_in_lng, work_date, notes, timezone, clock_source, clocked_in_by)
       VALUES ($1, $2, $3, NOW(), $4, $5, COALESCE($6::date, CURRENT_DATE), $7, $8, $9, $10)
       ON CONFLICT (user_id) DO UPDATE
         SET project_id = EXCLUDED.project_id,
             clock_in_time = EXCLUDED.clock_in_time,
             clock_in_lat = EXCLUDED.clock_in_lat,
             clock_in_lng = EXCLUDED.clock_in_lng,
             work_date = EXCLUDED.work_date,
             notes = EXCLUDED.notes,
             timezone = EXCLUDED.timezone,
             clock_source = EXCLUDED.clock_source,
             clocked_in_by = EXCLUDED.clocked_in_by
       RETURNING *`,
      [req.user.id, companyId, project_id, lat || null, lng || null, local_work_date || null, notes || null, timezone || null, 'worker', null]
    );

    const row = result.rows[0];
    const projName = project_id
      ? await pool.query('SELECT name, wage_type FROM projects WHERE id = $1', [project_id])
      : { rows: [{ name: null, wage_type: 'regular' }] };

    // Notify admin if worker's location permission was denied
    if (location_denied) {
      try {
        const workerName = req.user.full_name || req.user.username;
        const title = `Location denied: ${workerName}`;
        const body = `${workerName} clocked in but their browser blocked location access. Their location was not recorded.`;
        await sendPushToCompanyAdmins(companyId, { title, body, url: '/admin#live' });
        const adminRows = await pool.query(
          `SELECT id FROM users WHERE company_id = $1 AND role IN ('admin','super_admin') AND active = true`,
          [companyId]
        );
        for (const a of adminRows.rows) {
          createInboxItem(a.id, companyId, 'location_denied', title, body, '/admin#live');
        }
      } catch {} // never block clock-in
    }

    // Check if clock-in is outside configured hours — notify admin if so
    try {
      const settingsResult = await pool.query(
        'SELECT key, value FROM settings WHERE company_id = $1', [companyId]
      );
      const s = { notification_start_hour: 6, notification_end_hour: 20, notification_use_work_hours: true, company_timezone: '' };
      settingsResult.rows.forEach(r => {
        if (r.key === 'notification_use_work_hours') s[r.key] = r.value === '1';
        else if (r.key === 'company_timezone') s[r.key] = r.value;
        else s[r.key] = parseFloat(r.value);
      });
      const tz = timezone || s.company_timezone || 'UTC';
      const nowHour = parseInt(new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false })) % 24;
      if (s.notification_use_work_hours && (nowHour < s.notification_start_hour || nowHour >= s.notification_end_hour)) {
        const adminResult = await pool.query(
          `SELECT u.email, u.full_name FROM users u
           WHERE u.company_id = $1 AND u.role = 'admin' AND u.active = true AND u.email IS NOT NULL
           LIMIT 1`, [companyId]
        );
        if (adminResult.rowCount > 0 && process.env.SENDGRID_API_KEY) {
          const admin = adminResult.rows[0];
          const timeStr = new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
          await sgMail.send({
            from: { name: 'OpsFloa', email: process.env.SENDGRID_FROM_EMAIL },
            to: admin.email,
            subject: `Unusual clock-in: ${req.user.full_name}`,
            html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
              <h3 style="color:#d97706">Unusual clock-in detected</h3>
              <p><strong>${req.user.full_name}</strong> clocked in at <strong>${timeStr}</strong> on project <strong>${projName.rows[0].name}</strong>.</p>
              <p style="color:#888;font-size:13px">This is outside your configured work hours (${s.notification_start_hour}:00–${s.notification_end_hour}:00).</p>
            </div>`,
          }).catch(() => {}); // don't fail clock-in if email fails
        }
      }
    } catch {} // don't fail clock-in if notification check fails

    res.status(201).json({ ...row, project_name: projName.rows[0].name, wage_type: projName.rows[0].wage_type });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/clock/out
router.post('/out', requireAuth, async (req, res) => {
  const { lat, lng, break_minutes, mileage, local_clock_in, local_clock_out } = req.body;
  if ((lat != null || lng != null) && !validCoords(lat, lng)) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }
  const companyId = req.user.company_id;
  try {
    const clockResult = await pool.query(
      'SELECT user_id, company_id, project_id, clock_in_time, work_date, notes, timezone, clock_source, clocked_in_by FROM active_clock WHERE user_id = $1',
      [req.user.id]
    );
    if (clockResult.rowCount === 0) return res.status(400).json({ error: 'Not clocked in' });
    const clock = clockResult.rows[0];

    // Get project wage_type (project may be null if projects feature is off)
    const projResult = clock.project_id
      ? await pool.query('SELECT wage_type, name FROM projects WHERE id = $1', [clock.project_id])
      : { rows: [{ wage_type: 'regular', name: null }] };
    if (clock.project_id && projResult.rowCount === 0) return res.status(400).json({ error: 'Project not found' });
    const { wage_type, name: project_name } = projResult.rows[0];

    // Use client-supplied local times if available (avoids UTC offset issues on server)
    // Fallback to UTC extraction for backwards compatibility
    const clockInTime = new Date(clock.clock_in_time);
    const clockOutTime = new Date();
    const pad = n => String(n).padStart(2, '0');
    const start_time = local_clock_in || `${pad(clockInTime.getUTCHours())}:${pad(clockInTime.getUTCMinutes())}:${pad(clockInTime.getUTCSeconds())}`;
    const end_time = local_clock_out || `${pad(clockOutTime.getUTCHours())}:${pad(clockOutTime.getUTCMinutes())}:${pad(clockOutTime.getUTCSeconds())}`;

    // Create the time entry
    const entryResult = await pool.query(
      `INSERT INTO time_entries
         (company_id, user_id, project_id, work_date, start_time, end_time, wage_type, notes,
          clock_in_lat, clock_in_lng, clock_out_lat, clock_out_lng, break_minutes, mileage, timezone,
          clock_source, clocked_in_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [
        companyId, req.user.id, clock.project_id, clock.work_date,
        start_time, end_time, wage_type, clock.notes || null,
        clock.clock_in_lat, clock.clock_in_lng, lat || null, lng || null,
        parseInt(break_minutes) || 0, mileage != null ? parseFloat(mileage) : null,
        clock.timezone || null,
        clock.clock_source, clock.clocked_in_by,
      ]
    );

    // Remove the active clock row
    await pool.query('DELETE FROM active_clock WHERE user_id = $1', [req.user.id]);

    // Overtime alert — fire-and-forget, never block the response
    try {
      const settingsRows = await pool.query(
        'SELECT key, value FROM settings WHERE company_id = $1', [companyId]
      );
      const s = applySettingsRows(settingsRows.rows, SETTINGS_DEFAULTS);

      if (s.feature_overtime && s.feature_overtime_alerts) {
        const workDate = clock.work_date;
        const threshold = parseFloat(s.overtime_threshold) || 8;
        const rule = s.overtime_rule || 'daily';

        // Get all entries for this worker on the relevant period (before this new entry)
        let prevHours = 0;
        let totalHours = 0;

        if (rule === 'weekly') {
          // Sum this ISO week (Mon–Sun)
          const allWeekRows = await pool.query(
            `SELECT start_time, end_time FROM time_entries
             WHERE user_id = $1 AND wage_type = 'regular'
               AND DATE_TRUNC('week', work_date::date) = DATE_TRUNC('week', $2::date)`,
            [req.user.id, workDate]
          );
          const allEntries = allWeekRows.rows;
          // Subtract the new entry when computing "before"
          const newEntry = entryResult.rows[0];
          const calcH = (s, e) => {
            const start = new Date(`1970-01-01T${s}`);
            const end = new Date(`1970-01-01T${e}`);
            let h = (end - start) / 3600000;
            if (h < 0) h += 24;
            return h;
          };
          const newEntryHours = calcH(newEntry.start_time, newEntry.end_time) - (newEntry.break_minutes || 0) / 60;
          totalHours = allEntries.reduce((sum, r) => sum + calcH(r.start_time, r.end_time), 0);
          prevHours = totalHours - newEntryHours;
          // Weekly threshold is typically 40
          const weeklyThreshold = threshold <= 10 ? 40 : threshold;
          if (prevHours < weeklyThreshold && totalHours >= weeklyThreshold && wage_type === 'regular') {
            await _sendOvertimeAlert(req.user, companyId, project_name, totalHours, weeklyThreshold, 'weekly', s);
          }
        } else {
          // Daily rule — check today's total
          const dayRows = await pool.query(
            `SELECT start_time, end_time, break_minutes FROM time_entries
             WHERE user_id = $1 AND work_date = $2 AND wage_type = 'regular'`,
            [req.user.id, workDate]
          );
          const calcH = (s, e, brk) => {
            const start = new Date(`1970-01-01T${s}`);
            const end = new Date(`1970-01-01T${e}`);
            let h = (end - start) / 3600000;
            if (h < 0) h += 24;
            return Math.max(0, h - (brk || 0) / 60);
          };
          const newEntry = entryResult.rows[0];
          const newEntryHours = calcH(newEntry.start_time, newEntry.end_time, newEntry.break_minutes);
          totalHours = dayRows.rows.reduce((sum, r) => sum + calcH(r.start_time, r.end_time, r.break_minutes), 0);
          prevHours = totalHours - newEntryHours;
          if (prevHours < threshold && totalHours >= threshold && wage_type === 'regular') {
            await _sendOvertimeAlert(req.user, companyId, project_name, totalHours, threshold, 'daily', s);
          }
        }
      }
    } catch (alertErr) {
      console.error('Overtime alert error:', alertErr);
    }

    res.json({ ...entryResult.rows[0], project_name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

async function _sendOvertimeAlert(worker, companyId, projectName, totalHours, threshold, rule, settings) {
  const workerName = worker.full_name || worker.username;
  const extra = (totalHours - threshold).toFixed(1);
  const title = `Overtime: ${workerName}`;
  const body = `${workerName} has worked ${totalHours.toFixed(1)}h today${projectName ? ` on ${projectName}` : ''} — ${extra}h over the ${threshold}h ${rule} threshold`;

  await sendPushToCompanyAdmins(companyId, { title, body, url: '/admin#reports' });

  const adminRows = await pool.query(
    `SELECT id FROM users WHERE company_id = $1 AND role IN ('admin','super_admin') AND active = true`,
    [companyId]
  );
  for (const a of adminRows.rows) {
    createInboxItem(a.id, companyId, 'overtime_alert', title, body, '/admin#reports');
  }
}

// DELETE /api/clock/cancel — discard an active clock-in without creating a time entry
router.delete('/cancel', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM active_clock WHERE user_id = $1 RETURNING id',
      [req.user.id]
    );
    if (result.rowCount === 0) return res.status(400).json({ error: 'Not clocked in' });
    res.json({ cancelled: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
