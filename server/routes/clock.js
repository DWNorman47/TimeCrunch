const router = require('express').Router();
const pool = require('../db');
const sgMail = require('@sendgrid/mail');
const { requireAuth } = require('../middleware/auth');

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

// POST /api/clock/in
router.post('/in', requireAuth, async (req, res) => {
  const { project_id, notes, lat, lng } = req.body;
  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  const companyId = req.user.company_id;
  try {
    // Verify project belongs to this company
    const proj = await pool.query(
      'SELECT id FROM projects WHERE id = $1 AND company_id = $2 AND active = true',
      [project_id, companyId]
    );
    if (proj.rowCount === 0) return res.status(400).json({ error: 'Project not found' });

    // Upsert — replace any existing clock-in (safety valve)
    const result = await pool.query(
      `INSERT INTO active_clock (user_id, company_id, project_id, clock_in_time, clock_in_lat, clock_in_lng, work_date, notes)
       VALUES ($1, $2, $3, NOW(), $4, $5, CURRENT_DATE, $6)
       ON CONFLICT (user_id) DO UPDATE
         SET project_id = EXCLUDED.project_id,
             clock_in_time = EXCLUDED.clock_in_time,
             clock_in_lat = EXCLUDED.clock_in_lat,
             clock_in_lng = EXCLUDED.clock_in_lng,
             work_date = EXCLUDED.work_date,
             notes = EXCLUDED.notes
       RETURNING *`,
      [req.user.id, companyId, project_id, lat || null, lng || null, notes || null]
    );

    const row = result.rows[0];
    const projName = await pool.query('SELECT name, wage_type FROM projects WHERE id = $1', [project_id]);

    // Check if clock-in is outside configured hours — notify admin if so
    try {
      const settingsResult = await pool.query(
        'SELECT key, value FROM settings WHERE company_id = $1', [companyId]
      );
      const s = { notification_start_hour: 6, notification_end_hour: 20 };
      settingsResult.rows.forEach(r => { s[r.key] = parseFloat(r.value); });
      const nowHour = new Date().getHours();
      if (nowHour < s.notification_start_hour || nowHour >= s.notification_end_hour) {
        const adminResult = await pool.query(
          `SELECT u.email, u.full_name FROM users u
           WHERE u.company_id = $1 AND u.role = 'admin' AND u.active = true AND u.email IS NOT NULL
           LIMIT 1`, [companyId]
        );
        if (adminResult.rowCount > 0 && process.env.SENDGRID_API_KEY) {
          const admin = adminResult.rows[0];
          const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          await sgMail.send({
            from: { name: 'Time Crunch', email: process.env.SENDGRID_FROM_EMAIL },
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
  const { lat, lng } = req.body;
  const companyId = req.user.company_id;
  try {
    const clockResult = await pool.query(
      'SELECT * FROM active_clock WHERE user_id = $1',
      [req.user.id]
    );
    if (clockResult.rowCount === 0) return res.status(400).json({ error: 'Not clocked in' });
    const clock = clockResult.rows[0];

    // Get project wage_type
    const projResult = await pool.query(
      'SELECT wage_type, name FROM projects WHERE id = $1',
      [clock.project_id]
    );
    if (projResult.rowCount === 0) return res.status(400).json({ error: 'Project not found' });
    const { wage_type, name: project_name } = projResult.rows[0];

    // Extract start/end times as HH:MM:SS
    const clockInTime = new Date(clock.clock_in_time);
    const clockOutTime = new Date();
    const pad = n => String(n).padStart(2, '0');
    const start_time = `${pad(clockInTime.getHours())}:${pad(clockInTime.getMinutes())}:${pad(clockInTime.getSeconds())}`;
    const end_time = `${pad(clockOutTime.getHours())}:${pad(clockOutTime.getMinutes())}:${pad(clockOutTime.getSeconds())}`;

    // Create the time entry
    const entryResult = await pool.query(
      `INSERT INTO time_entries
         (company_id, user_id, project_id, work_date, start_time, end_time, wage_type, notes,
          clock_in_lat, clock_in_lng, clock_out_lat, clock_out_lng)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        companyId, req.user.id, clock.project_id, clock.work_date,
        start_time, end_time, wage_type, clock.notes || null,
        clock.clock_in_lat, clock.clock_in_lng, lat || null, lng || null,
      ]
    );

    // Remove the active clock row
    await pool.query('DELETE FROM active_clock WHERE user_id = $1', [req.user.id]);

    res.json({ ...entryResult.rows[0], project_name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
