/**
 * Format a monetary amount using the given ISO 4217 currency code.
 * Falls back to plain "$X.XX" if the currency is unrecognised by the runtime.
 */
export function formatCurrency(amount, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `$${Number(amount).toFixed(2)}`;
  }
}

/**
 * Format decimal hours as "Xh Ym" (e.g. 1.5 → "1h 30m", 0.25 → "15m", 8 → "8h")
 */
export function fmtHours(h) {
  const totalMin = Math.round((h || 0) * 60);
  const hrs = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (hrs === 0) return `${min}m`;
  if (min === 0) return `${hrs}h`;
  return `${hrs}h ${min}m`;
}
