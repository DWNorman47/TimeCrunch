/**
 * Week-boundary helpers (client mirror of server/utils/weekBounds.js).
 * weekStart is 0-6 (0=Sunday … 6=Saturday). Default 1 (Monday) matches
 * OpsFloa's original behavior before week_start became configurable.
 */

export function normWeekStart(weekStart) {
  const n = parseInt(weekStart, 10);
  if (!Number.isFinite(n)) return 1;
  return ((n % 7) + 7) % 7;
}

export function parseYMD(input) {
  const s = String(input).substring(0, 10);
  return new Date(s + 'T00:00:00');
}

export function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function daysSinceWeekStart(date, weekStart) {
  return (date.getDay() - normWeekStart(weekStart) + 7) % 7;
}

export function startOfWeek(date, weekStart) {
  const d = typeof date === 'string' ? parseYMD(date) : new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysSinceWeekStart(d, weekStart));
  return d;
}

/**
 * weekOffset = 0 → current week, -1 → previous, +1 → next.
 * Returns { from, to } as YYYY-MM-DD strings (Sun-Sat, Mon-Sun, etc.
 * depending on weekStart).
 */
export function weekRange(weekStart, weekOffset = 0, now = new Date()) {
  const start = startOfWeek(now, weekStart);
  start.setDate(start.getDate() + weekOffset * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { from: toYMD(start), to: toYMD(end) };
}

export function weekBucketKey(date, weekStart) {
  return toYMD(startOfWeek(date, weekStart));
}
