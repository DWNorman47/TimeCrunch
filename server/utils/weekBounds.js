/**
 * Week-boundary helpers. All 'weekStart' params are integers 0-6 where
 * 0=Sunday, 1=Monday, …, 6=Saturday. The default (1=Monday) matches
 * OpsFloa's original behavior before week_start became configurable.
 */

/** Normalize a weekStart input to 0..6, falling back to Monday. */
function normWeekStart(weekStart) {
  const n = parseInt(weekStart, 10);
  if (!Number.isFinite(n)) return 1;
  return ((n % 7) + 7) % 7;
}

/** Parse a YYYY-MM-DD string into a local-midnight Date (no TZ drift). */
function parseYMD(input) {
  const s = String(input).substring(0, 10);
  return new Date(s + 'T00:00:00');
}

/** ISO date string (YYYY-MM-DD) in local time. */
function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Number of days from `date` back to the most recent `weekStart` day. */
function daysSinceWeekStart(date, weekStart) {
  return (date.getDay() - normWeekStart(weekStart) + 7) % 7;
}

/** Return the start-of-week date (local-midnight) for the week containing `date`. */
function startOfWeek(date, weekStart) {
  const d = typeof date === 'string' ? parseYMD(date) : new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysSinceWeekStart(d, weekStart));
  return d;
}

/**
 * Return { from, to } ISO strings for the N'th week relative to today.
 *   weekOffset = 0  → current week
 *   weekOffset = -1 → previous week
 *   weekOffset = 1  → next week
 */
function weekRange(weekStart, weekOffset = 0, now = new Date()) {
  const start = startOfWeek(now, weekStart);
  start.setDate(start.getDate() + weekOffset * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { from: toYMD(start), to: toYMD(end) };
}

/** Key used to bucket entries per week (ISO date of the week's start). */
function weekBucketKey(date, weekStart) {
  return toYMD(startOfWeek(date, weekStart));
}

module.exports = {
  normWeekStart,
  parseYMD,
  toYMD,
  startOfWeek,
  weekRange,
  weekBucketKey,
};
