/**
 * Core pay calculation utilities shared by admin and timeEntries routes.
 * Exported so they can be unit-tested without touching the database.
 */

/** Decimal hours between two HH:MM[:SS] strings. Handles midnight-crossing shifts. */
function hoursWorked(start, end) {
  let ms = new Date(`1970-01-01T${end}`) - new Date(`1970-01-01T${start}`);
  if (ms < 0) ms += 86400000;
  return ms / 3600000;
}

/**
 * Split an array of time entries into regularHours and overtimeHours.
 * Only entries with wage_type === 'regular' count toward OT.
 * @param {Array}  entries   - rows with {wage_type, start_time, end_time, work_date, break_minutes}
 * @param {string} rule      - 'daily' | 'weekly'
 * @param {number} threshold - hours before OT kicks in (e.g. 8 for daily, 40 for weekly)
 */
function computeOT(entries, rule, threshold) {
  const regular = entries.filter(e => e.wage_type === 'regular');

  if (rule === 'weekly') {
    const weekly = {};
    regular.forEach(e => {
      const d = new Date(e.work_date.toString().substring(0, 10) + 'T00:00:00');
      const jan4 = new Date(d.getFullYear(), 0, 4);
      const week = Math.ceil(((d - jan4) / 86400000 + jan4.getDay() + 1) / 7);
      const key = `${d.getFullYear()}-W${week}`;
      const h = hoursWorked(e.start_time, e.end_time) - (e.break_minutes || 0) / 60;
      weekly[key] = (weekly[key] || 0) + h;
    });
    const reg = Object.values(weekly).reduce((s, h) => s + Math.min(h, threshold), 0);
    const ot = Object.values(weekly).reduce((s, h) => s + Math.max(h - threshold, 0), 0);
    return { regularHours: reg, overtimeHours: ot };
  }

  // daily (default)
  const daily = {};
  regular.forEach(e => {
    const key = e.work_date.toString().substring(0, 10);
    const h = hoursWorked(e.start_time, e.end_time) - (e.break_minutes || 0) / 60;
    daily[key] = (daily[key] || 0) + h;
  });
  const reg = Object.values(daily).reduce((s, h) => s + Math.min(h, threshold), 0);
  const ot = Object.values(daily).reduce((s, h) => s + Math.max(h - threshold, 0), 0);
  return { regularHours: reg, overtimeHours: ot };
}

/**
 * Compute regular and overtime pay costs for a daily-rate worker.
 * Daily workers earn `dailyRate` per distinct work day.
 * Overtime hours (above daily threshold) are paid at (dailyRate / threshold) × multiplier.
 * @param {Array}  entries          - regular wage_type entries for one worker
 * @param {number} threshold        - daily OT threshold (e.g. 8)
 * @param {number} dailyRate        - amount earned per full day
 * @param {number} overtimeMultiplier
 * @returns {{ regularCost: number, overtimeCost: number }}
 */
function computeDailyPayCosts(entries, threshold, dailyRate, overtimeMultiplier) {
  const regular = entries.filter(e => e.wage_type === 'regular');
  const days = new Set(regular.map(e => e.work_date.toString().substring(0, 10))).size;
  const { overtimeHours } = computeOT(entries, 'daily', threshold);
  return {
    regularCost: days * dailyRate,
    overtimeCost: overtimeHours * (dailyRate / threshold) * overtimeMultiplier,
  };
}

module.exports = { hoursWorked, computeOT, computeDailyPayCosts };
