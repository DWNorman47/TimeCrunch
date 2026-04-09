/**
 * Background cron jobs — started once from index.js via startCron().
 * Uses setInterval; runs in-process alongside the Express server.
 */
const pool = require('./db');
const { sendPushToUser } = require('./push');

// Send push notifications to workers with shifts tomorrow.
// Runs once per hour; the reminder_sent flag prevents duplicate sends.
async function sendShiftReminders() {
  try {
    // Find all shifts starting tomorrow that haven't been reminded yet
    const result = await pool.query(
      `SELECT s.id, s.user_id, s.shift_date, s.start_time, s.end_time, s.cant_make_it,
              p.name as project_name
       FROM shifts s
       LEFT JOIN projects p ON s.project_id = p.id
       WHERE s.shift_date = CURRENT_DATE + 1
         AND s.reminder_sent = false
         AND s.cant_make_it = false`
    );

    if (result.rows.length === 0) return;

    for (const shift of result.rows) {
      const timeStr = shift.start_time?.substring(0, 5) || '';
      const body = `${timeStr}${shift.project_name ? ' · ' + shift.project_name : ''}`;
      await sendPushToUser(shift.user_id, {
        title: 'Shift reminder — tomorrow',
        body,
        url: '/dashboard#schedule',
      });
    }

    // Mark all reminded shifts so we don't send again
    const ids = result.rows.map(s => s.id);
    await pool.query(
      `UPDATE shifts SET reminder_sent = true WHERE id = ANY($1)`,
      [ids]
    );

    console.log(`[cron] Sent shift reminders for ${ids.length} shift(s)`);
  } catch (err) {
    console.error('[cron] sendShiftReminders error:', err);
  }
}

function startCron() {
  // Run immediately on startup (catches any missed window from restart)
  sendShiftReminders();
  // Then run every hour
  setInterval(sendShiftReminders, 60 * 60 * 1000);
  console.log('[cron] Shift reminder cron started');
}

module.exports = { startCron };
