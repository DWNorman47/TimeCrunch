/**
 * Core pay calculation utilities shared by admin and timeEntries routes.
 * Exported so they can be unit-tested without touching the database.
 */

const { weekBucketKey } = require('./weekBounds');

/** Decimal hours between two HH:MM[:SS] strings. Handles midnight-crossing shifts. */
function hoursWorked(start, end) {
  let ms = new Date(`1970-01-01T${end}`) - new Date(`1970-01-01T${start}`);
  if (ms < 0) ms += 86400000;
  return ms / 3600000;
}

function entryDuration(e) {
  return hoursWorked(e.start_time, e.end_time) - (e.break_minutes || 0) / 60;
}

/**
 * Split an array of time entries into regularHours and overtimeHours.
 * Only entries with wage_type === 'regular' count toward OT.
 *
 * Per-entry admin override: if `entry.overtime_hours_override` is not null,
 * that entry is carved out of the automatic daily/weekly calc. The override
 * value is taken as the OT portion (clamped to 0..total), and the remainder
 * of the entry becomes regular. This lets an admin say "this particular 14h
 * entry should only count 2h as OT" without affecting the other entries in
 * the pay period.
 *
 * @param {Array}  entries   - rows with {wage_type, start_time, end_time, work_date, break_minutes, overtime_hours_override?}
 * @param {string} rule      - 'daily' | 'weekly' | 'none'
 * @param {number} threshold - hours before OT kicks in (e.g. 8 for daily, 40 for weekly)
 * @param {number} [weekStart=1] - 0=Sun … 6=Sat (only affects the 'weekly' rule)
 */
function computeOT(entries, rule, threshold, weekStart = 1) {
  const regular = entries.filter(e => e.wage_type === 'regular');

  // Partition entries with an explicit override out of the automatic calc.
  const overridden = regular.filter(e => e.overtime_hours_override != null);
  const auto       = regular.filter(e => e.overtime_hours_override == null);

  let overrideReg = 0, overrideOt = 0;
  for (const e of overridden) {
    const total = entryDuration(e);
    const ot = Math.max(0, Math.min(total, parseFloat(e.overtime_hours_override)));
    overrideReg += total - ot;
    overrideOt  += ot;
  }

  let autoReg = 0, autoOt = 0;
  if (rule === 'weekly') {
    const weekly = {};
    auto.forEach(e => {
      const key = weekBucketKey(e.work_date, weekStart);
      weekly[key] = (weekly[key] || 0) + entryDuration(e);
    });
    autoReg = Object.values(weekly).reduce((s, h) => s + Math.min(h, threshold), 0);
    autoOt  = Object.values(weekly).reduce((s, h) => s + Math.max(h - threshold, 0), 0);
  } else if (rule === 'none') {
    autoReg = auto.reduce((s, e) => s + entryDuration(e), 0);
  } else {
    // daily (default)
    const daily = {};
    auto.forEach(e => {
      const key = e.work_date.toString().substring(0, 10);
      daily[key] = (daily[key] || 0) + entryDuration(e);
    });
    autoReg = Object.values(daily).reduce((s, h) => s + Math.min(h, threshold), 0);
    autoOt  = Object.values(daily).reduce((s, h) => s + Math.max(h - threshold, 0), 0);
  }

  return {
    regularHours:  overrideReg + autoReg,
    overtimeHours: overrideOt  + autoOt,
  };
}

/**
 * Compute regular and overtime pay costs for a daily-rate worker.
 * Daily workers earn `dailyRate` per distinct work day.
 * Overtime hours (above threshold) are paid at (dailyRate / threshold) × multiplier.
 * @param {Array}  entries          - all entries for one worker
 * @param {string} overtimeRule     - 'daily' | 'weekly' | 'none'
 * @param {number} threshold        - OT threshold in hours
 * @param {number} dailyRate        - amount earned per full day
 * @param {number} overtimeMultiplier
 * @returns {{ regularCost: number, overtimeCost: number }}
 */
function computeDailyPayCosts(entries, overtimeRule, threshold, dailyRate, overtimeMultiplier) {
  const regular = entries.filter(e => e.wage_type === 'regular');
  const days = new Set(regular.map(e => e.work_date.toString().substring(0, 10))).size;
  if (overtimeRule === 'none') {
    return { regularCost: days * dailyRate, overtimeCost: 0 };
  }
  const { overtimeHours } = computeOT(entries, overtimeRule, threshold);
  return {
    regularCost: days * dailyRate,
    overtimeCost: overtimeHours * (dailyRate / threshold) * overtimeMultiplier,
  };
}

module.exports = { hoursWorked, computeOT, computeDailyPayCosts };
