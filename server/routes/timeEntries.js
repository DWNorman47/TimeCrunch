const router = require('express').Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendPushToUser, sendPushToCompanyAdmins } = require('../push');
const { createInboxItem } = require('./inbox');
const { sendEmail } = require('../email');
const { logAudit } = require('../auditLog');
const rateLimit = require('express-rate-limit');

const entryWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 120, // generous — manual entry is rare, but admins can bulk-add
  keyGenerator: req => String(req.user?.id || req.ip),
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Get current user's entries
router.get('/', requireAuth, async (req, res) => {
  try {
    const co = await pool.query(
      'SELECT plan, subscription_status, trial_ends_at FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    const { plan, subscription_status, trial_ends_at } = co.rows[0] || {};
    const trialActive = subscription_status === 'trial' && (!trial_ends_at || new Date(trial_ends_at) >= new Date());
    const isFree = plan === 'free' && !trialActive;
    const dateClause = isFree ? `AND te.work_date >= CURRENT_DATE - INTERVAL '90 days'` : '';

    const result = await pool.query(
      `SELECT te.*, p.name as project_name
       FROM time_entries te
       LEFT JOIN projects p ON te.project_id = p.id
       WHERE te.user_id = $1 ${dateClause}
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
router.post('/', requireAuth, entryWriteLimiter, async (req, res) => {
  const { project_id, work_date, start_time, end_time, break_minutes, mileage, timezone, client_id } = req.body;
  const notesTrimmed = req.body.notes?.trim() || null;
  if (!project_id || !work_date || !start_time || !end_time) {
    return res.status(400).json({ error: 'project_id, work_date, start_time, and end_time are required' });
  }
  if (notesTrimmed && notesTrimmed.length > 500) return res.status(400).json({ error: 'Notes must be 500 characters or fewer' });
  const companyId = req.user.company_id;
  try {
    const projectResult = await pool.query(
      'SELECT wage_type FROM projects WHERE id = $1 AND company_id = $2',
      [project_id, companyId]
    );
    if (projectResult.rowCount === 0) return res.status(400).json({ error: 'Project not found' });
    const wage_type = projectResult.rows[0].wage_type;

    const bm = parseInt(break_minutes) || 0;
    if (bm < 0) return res.status(400).json({ error: 'break_minutes must be non-negative' });
    const mileageParsed = mileage != null ? parseFloat(mileage) : null;
    const mileageVal = (mileageParsed != null && !isNaN(mileageParsed) && mileageParsed >= 0) ? mileageParsed : null;
    const cid = (typeof client_id === 'string' && client_id.length <= 36) ? client_id : null;
    const result = await pool.query(
      `INSERT INTO time_entries (company_id, user_id, project_id, work_date, start_time, end_time, wage_type, notes, break_minutes, mileage, timezone, client_id, clock_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (user_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
       RETURNING *`,
      [companyId, req.user.id, project_id, work_date, start_time, end_time, wage_type, notesTrimmed,
       bm, mileageVal, timezone || null, cid, 'log_entry']
    );
    if (result.rowCount === 0) return res.status(409).json({ error: 'Duplicate entry' });
    const entry = result.rows[0];
    logAudit(companyId, req.user.id, req.user.full_name, 'entry.submitted', 'time_entry', entry.id, null,
      { work_date, start_time, end_time, project_id });
    res.status(201).json(entry);
    // Optionally notify admins on submission
    setImmediate(async () => {
      try {
        const notifSetting = await pool.query(
          `SELECT value FROM settings WHERE company_id = $1 AND key = 'notify_entry_submitted'`,
          [companyId]
        );
        if (notifSetting.rows[0]?.value !== '1') return;
        const admins = await pool.query(
          `SELECT email FROM users WHERE company_id = $1 AND role = 'admin' AND email IS NOT NULL`,
          [companyId]
        );
        const subject = `Time entry submitted: ${req.user.full_name}`;
        const body = `<p><b>${req.user.full_name}</b> submitted a time entry for <b>${work_date}</b> (${start_time}–${end_time}).</p><p>— OpsFloa</p>`;
        for (const admin of admins.rows) sendEmail(admin.email, subject, body);
      } catch (err) { console.error('Entry notification error:', err); }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Edit an entry (own entries only, within 7 days)
router.patch('/:id', requireAuth, async (req, res) => {
  const { start_time, end_time, notes, break_minutes, mileage } = req.body;
  if (!start_time || !end_time) return res.status(400).json({ error: 'start_time and end_time required' });
  if (notes && notes.length > 500) return res.status(400).json({ error: 'Notes must be 500 characters or fewer' });
  // Allow midnight-crossing shifts (end_time < start_time is valid, e.g. 23:00–00:30)
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
    if (entry.locked) return res.status(403).json({ error: 'This entry has been approved and cannot be edited' });
    const locked = await pool.query(
      'SELECT id FROM pay_periods WHERE company_id = $1 AND period_start <= $2 AND period_end >= $2',
      [req.user.company_id, entry.work_date]
    );
    if (locked.rowCount > 0) return res.status(403).json({ error: 'This entry is in a locked pay period' });
    const bm = parseInt(break_minutes) || 0;
    if (bm < 0) return res.status(400).json({ error: 'break_minutes must be non-negative' });
    const mileageParsed = mileage != null ? parseFloat(mileage) : null;
    const mileageVal = (mileageParsed != null && !isNaN(mileageParsed) && mileageParsed >= 0) ? mileageParsed : null;
    const result = await pool.query(
      `UPDATE time_entries SET start_time = $1, end_time = $2, notes = $3, break_minutes = $4, mileage = $5,
       status = 'pending', approval_note = NULL WHERE id = $6 RETURNING *`,
      [start_time, end_time, notes?.trim() || null, bm, mileageVal, req.params.id]
    );
    logAudit(req.user.company_id, req.user.id, req.user.full_name, 'entry.edited', 'time_entry', req.params.id, null,
      { from: { start_time: entry.start_time, end_time: entry.end_time }, to: { start_time, end_time } });
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
  if (body.length > 1000) return res.status(400).json({ error: 'Message must be 1000 characters or fewer' });
  try {
    const entry = await pool.query('SELECT id FROM time_entries WHERE id = $1 AND company_id = $2', [req.params.id, req.user.company_id]);
    if (entry.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    const result = await pool.query(
      `INSERT INTO entry_messages (time_entry_id, company_id, sender_id, body)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, req.user.company_id, req.user.id, body.trim()]
    );
    const msg = { ...result.rows[0], sender_name: req.user.full_name };
    const entryOwner = await pool.query('SELECT user_id FROM time_entries WHERE id = $1 AND company_id = $2', [req.params.id, req.user.company_id]);
    const ownerId = entryOwner.rows[0]?.user_id;
    const isWorker = req.user.role === 'worker';
    const snippet = body.trim().substring(0, 100);
    if (isWorker) {
      // Worker commented — notify all company admins
      sendPushToCompanyAdmins(req.user.company_id, {
        title: `Comment from ${req.user.full_name}`,
        body: snippet,
        url: '/admin#approvals',
      });
      const admins = await pool.query(
        `SELECT id FROM users WHERE company_id = $1 AND role IN ('admin','super_admin') AND active = true`,
        [req.user.company_id]
      );
      for (const a of admins.rows) {
        createInboxItem(a.id, req.user.company_id, 'comment', `Comment from ${req.user.full_name}`, snippet, '/admin#approvals');
      }
    } else if (ownerId && ownerId !== req.user.id) {
      // Admin commented — notify the entry's worker
      sendPushToUser(ownerId, {
        title: `Comment from ${req.user.full_name}`,
        body: snippet,
        url: '/dashboard',
      });
      createInboxItem(ownerId, req.user.company_id, 'comment', `Comment from ${req.user.full_name}`, snippet, '/dashboard');
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
    const existing = await pool.query('SELECT work_date, locked FROM time_entries WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    if (existing.rows[0].locked) return res.status(403).json({ error: 'Approved entries cannot be deleted' });
    const locked = await pool.query(
      'SELECT id FROM pay_periods WHERE company_id = $1 AND period_start <= $2 AND period_end >= $2',
      [req.user.company_id, existing.rows[0].work_date]
    );
    if (locked.rowCount > 0) return res.status(403).json({ error: 'This entry is in a locked pay period' });
    const result = await pool.query(
      'DELETE FROM time_entries WHERE id = $1 AND user_id = $2 RETURNING id, work_date',
      [req.params.id, req.user.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    logAudit(req.user.company_id, req.user.id, req.user.full_name, 'entry.deleted', 'time_entry', req.params.id, null,
      { work_date: result.rows[0].work_date });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const { hoursWorked, computeOT } = require('../utils/payCalculations');

// GET /time-entries/pay-stubs — worker's pay periods with aggregated hours
router.get('/pay-stubs', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const companyId = req.user.company_id;
  try {
    const [periods, settingsRows, workerRow] = await Promise.all([
      pool.query('SELECT * FROM pay_periods WHERE company_id = $1 ORDER BY period_start DESC', [companyId]),
      pool.query('SELECT key, value FROM settings WHERE company_id = $1', [companyId]),
      pool.query('SELECT overtime_rule, hourly_rate, rate_type, guaranteed_weekly_hours FROM users WHERE id = $1', [userId]),
    ]);
    const s = { overtime_threshold: 8, default_hourly_rate: 0 };
    settingsRows.rows.forEach(r => {
      if (r.key === 'overtime_threshold') s.overtime_threshold = parseFloat(r.value);
      if (r.key === 'default_hourly_rate') s.default_hourly_rate = parseFloat(r.value);
    });
    const workerData = workerRow.rows[0] || {};
    const workerOTRule = workerData.overtime_rule || 'daily';
    const guaranteedWeeklyHours = workerData.guaranteed_weekly_hours ? parseFloat(workerData.guaranteed_weekly_hours) : null;

    const result = [];
    if (periods.rows.length > 0) {
      const minDate = periods.rows[periods.rows.length - 1].period_start;
      const maxDate = periods.rows[0].period_end;
      const allEntries = await pool.query(
        `SELECT te.*, p.name as project_name,
                to_char(te.work_date, 'YYYY-MM-DD') as work_date_str
         FROM time_entries te LEFT JOIN projects p ON te.project_id = p.id
         WHERE te.user_id = $1 AND te.status = 'approved' AND te.work_date >= $2 AND te.work_date <= $3
         ORDER BY te.work_date, te.start_time`,
        [userId, minDate, maxDate]
      );

      for (const period of periods.rows) {
        const ps = period.period_start.toString().substring(0, 10);
        const pe = period.period_end.toString().substring(0, 10);
        const entries = allEntries.rows.filter(e => e.work_date_str >= ps && e.work_date_str <= pe);
        if (entries.length === 0) continue;

        const { regularHours, overtimeHours } = computeOT(entries, workerOTRule, s.overtime_threshold);
        let prevailingHours = 0, totalMileage = 0;
        for (const e of entries) {
          if (e.wage_type === 'prevailing') {
            prevailingHours += hoursWorked(e.start_time, e.end_time) - (e.break_minutes || 0) / 60;
          }
          if (e.mileage) totalMileage += parseFloat(e.mileage);
        }

        const totalHours = regularHours + overtimeHours + prevailingHours;
        // Guarantee shortfall: scale by how many weeks are in this pay period
        let guaranteeShortfall = 0, guaranteeMinHours = 0;
        if (guaranteedWeeklyHours) {
          const ps = new Date(String(period.period_start).substring(0, 10) + 'T00:00:00');
          const pe = new Date(String(period.period_end).substring(0, 10) + 'T00:00:00');
          const days = Math.round((pe - ps) / (1000 * 60 * 60 * 24)) + 1;
          const weeks = Math.max(1, Math.round(days / 7));
          guaranteeMinHours = +(guaranteedWeeklyHours * weeks).toFixed(2);
          guaranteeShortfall = +Math.max(0, guaranteeMinHours - totalHours).toFixed(2);
        }
        result.push({
          id: period.id,
          period_start: period.period_start,
          period_end: period.period_end,
          label: period.label,
          entries,
          summary: {
            regular_hours: +regularHours.toFixed(2),
            overtime_hours: +overtimeHours.toFixed(2),
            prevailing_hours: +prevailingHours.toFixed(2),
            total_mileage: +totalMileage.toFixed(1),
            guarantee_shortfall_hours: guaranteeShortfall,
            guarantee_min_hours: guaranteeMinHours,
            guaranteed_weekly_hours: guaranteedWeeklyHours,
          },
        });
      }
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
      const adminId = admin.rows[0].id;
      const signTitle = `${req.user.full_name} signed their timesheet`;
      const signBody = `${result.rowCount} entr${result.rowCount === 1 ? 'y' : 'ies'} ready for review`;
      sendPushToUser(adminId, { title: signTitle, body: signBody, url: '/admin#approvals' });
      createInboxItem(adminId, req.user.company_id, 'signoff', signTitle, signBody, '/admin#approvals');
    }
    res.json({ signed: result.rowCount });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /time-entries/copy-last-week
// Copies last week's entries (Mon–Sun) to the same weekday this week. Skips days that already have entries.
router.post('/copy-last-week', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const today = new Date();
    const dow = today.getDay();
    const thisMon = new Date(today);
    thisMon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    thisMon.setHours(0, 0, 0, 0);
    const lastMon = new Date(thisMon);
    lastMon.setDate(thisMon.getDate() - 7);
    const lastSun = new Date(lastMon);
    lastSun.setDate(lastMon.getDate() + 6);
    const toISO = d => d.toLocaleDateString('en-CA');

    const lastWeek = await pool.query(
      `SELECT start_time, end_time, break_minutes, project_id, notes, wage_type, work_date
       FROM time_entries
       WHERE user_id=$1 AND company_id=$2 AND work_date BETWEEN $3 AND $4
       ORDER BY work_date`,
      [req.user.id, companyId, toISO(lastMon), toISO(lastSun)]
    );
    if (lastWeek.rowCount === 0) return res.json({ created: 0, skipped: 0, entries: [] });

    const thisSun = new Date(thisMon);
    thisSun.setDate(thisMon.getDate() + 6);
    const existing = await pool.query(
      `SELECT DISTINCT work_date FROM time_entries
       WHERE user_id=$1 AND company_id=$2 AND work_date BETWEEN $3 AND $4`,
      [req.user.id, companyId, toISO(thisMon), toISO(thisSun)]
    );
    const existingDates = new Set(existing.rows.map(r => r.work_date?.toString().substring(0, 10)));

    const created = [];
    for (const e of lastWeek.rows) {
      const lastDate = new Date(e.work_date.toString().substring(0, 10) + 'T00:00:00');
      const thisDate = new Date(lastDate);
      thisDate.setDate(lastDate.getDate() + 7);
      const thisDateStr = toISO(thisDate);
      if (existingDates.has(thisDateStr)) continue;
      const result = await pool.query(
        `INSERT INTO time_entries (user_id, company_id, work_date, start_time, end_time, break_minutes, project_id, notes, wage_type, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'submitted') RETURNING *`,
        [req.user.id, companyId, thisDateStr, e.start_time, e.end_time, e.break_minutes || 0,
         e.project_id || null, e.notes || null, e.wage_type || 'regular']
      );
      created.push(result.rows[0]);
      existingDates.add(thisDateStr);
    }
    res.json({ created: created.length, skipped: lastWeek.rowCount - created.length, entries: created });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
