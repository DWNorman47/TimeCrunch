// Maps ISO 4217 currency codes to a locale that produces the correct local symbol
const CURRENCY_LOCALES = {
  USD: 'en-US', CAD: 'en-CA', EUR: 'de-DE', GBP: 'en-GB',
  MXN: 'es-MX', HNL: 'es-HN', GTQ: 'es-GT', NIO: 'es-NI',
  BZD: 'en-BZ', CRC: 'es-CR', PAB: 'es-PA',
};

/**
 * Format a monetary amount using the given ISO 4217 currency code.
 * Uses a locale that produces the local symbol (e.g. "L" for HNL, "Q" for GTQ).
 */
export function formatCurrency(amount, currency = 'USD') {
  const locale = CURRENCY_LOCALES[currency] ?? 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `$${Number(amount).toFixed(2)}`;
  }
}

/**
 * Returns just the currency symbol for the given ISO 4217 code (e.g. "$", "L", "€").
 */
export function currencySymbol(currency = 'USD') {
  const locale = CURRENCY_LOCALES[currency] ?? 'en-US';
  try {
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0);
    return parts.find(p => p.type === 'currency')?.value ?? currency;
  } catch {
    return '$';
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
