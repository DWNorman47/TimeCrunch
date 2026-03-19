const FEATURE_KEYS = ['feature_scheduling', 'feature_analytics', 'feature_chat', 'feature_prevailing_wage'];

// Defaults available to all authenticated users
const SETTINGS_DEFAULTS = {
  prevailing_wage_rate: 45, default_hourly_rate: 30, overtime_multiplier: 1.5,
  overtime_rule: 'daily', overtime_threshold: 8,
  feature_scheduling: true, feature_analytics: true, feature_chat: true, feature_prevailing_wage: true,
};

// Admin-only defaults (superset of SETTINGS_DEFAULTS)
const ADMIN_SETTINGS_DEFAULTS = {
  ...SETTINGS_DEFAULTS,
  notification_inactive_days: 3, notification_start_hour: 6, notification_end_hour: 20,
  chat_retention_days: 3,
};

function applySettingsRows(rows, defaults) {
  const s = { ...defaults };
  rows.forEach(r => {
    if (r.key === 'overtime_rule') s.overtime_rule = r.value;
    else if (FEATURE_KEYS.includes(r.key)) s[r.key] = r.value === '1';
    else s[r.key] = parseFloat(r.value);
  });
  return s;
}

module.exports = { FEATURE_KEYS, SETTINGS_DEFAULTS, ADMIN_SETTINGS_DEFAULTS, applySettingsRows };
