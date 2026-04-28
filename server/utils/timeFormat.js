/**
 * Wall-clock time formatting helpers.
 *
 * The app stores time_entries.start_time and end_time as plain "HH:MM:SS"
 * strings — wall-clock time in the worker's local timezone, no UTC offset.
 * Whenever the server needs to write one of those fields, it must know the
 * worker's local time. That can come from one of three places, in order:
 *
 *   1. A client-supplied field (best — the client knew its own clock).
 *   2. A stored timezone (e.g. active_clock.timezone) used to render a
 *      stored TIMESTAMPTZ into the worker's wall-clock.
 *   3. UTC fallback (only when no other info is available; usually wrong).
 *
 * Centralising the conversion here keeps every write site doing the same
 * thing — the server's host timezone (Render = UTC) never leaks into a
 * stored start_time again.
 */

/**
 * Return "HH:MM:SS" wall-clock time for `date` interpreted in `timezone`.
 * Uses Intl.DateTimeFormat parts for a safe 24-hour value.
 *
 * @param {Date}   date
 * @param {string} [timezone]  IANA tz (e.g. 'America/New_York'). Falls back
 *                             to the server's UTC clock when undefined/invalid.
 * @returns {string}
 */
function wallClockInTZ(date, timezone) {
  if (!(date instanceof Date) || isNaN(date)) date = new Date();
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'UTC',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(date).reduce((acc, p) => {
      if (p.type !== 'literal') acc[p.type] = p.value;
      return acc;
    }, {});
    // Intl can return "24" for hour at midnight in en-US; coerce to "00"
    const hh = parts.hour === '24' ? '00' : (parts.hour || '00');
    return `${hh}:${parts.minute || '00'}:${parts.second || '00'}`;
  } catch {
    // Bad timezone string — fall through to UTC components
    const pad = n => String(n).padStart(2, '0');
    return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  }
}

/**
 * Validate a client-supplied "HH:MM[:SS]" string. Returns it (with seconds
 * appended if missing) on success, null on failure. Use to gate a fallback:
 *
 *   const t = validLocalTime(req.body.local_time)
 *           ?? wallClockInTZ(new Date(), worker.timezone);
 */
function validLocalTime(s) {
  if (typeof s !== 'string') return null;
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return null;
  return s.length === 5 ? `${s}:00` : s;
}

module.exports = { wallClockInTZ, validLocalTime };
