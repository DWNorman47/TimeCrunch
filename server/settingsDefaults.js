const FEATURE_KEYS = ['feature_scheduling', 'feature_analytics', 'feature_chat', 'feature_prevailing_wage', 'show_worker_wages', 'notification_use_work_hours'];
const STRING_KEYS = ['overtime_rule', 'currency', 'company_timezone'];

// Defaults available to all authenticated users
const SETTINGS_DEFAULTS = {
  prevailing_wage_rate: 45, default_hourly_rate: 30, overtime_multiplier: 1.5,
  overtime_rule: 'daily', overtime_threshold: 8,
  feature_scheduling: true, feature_analytics: true, feature_chat: true, feature_prevailing_wage: true,
  show_worker_wages: false, notification_use_work_hours: true,
  currency: 'USD',
};

// Admin-only defaults (superset of SETTINGS_DEFAULTS)
const ADMIN_SETTINGS_DEFAULTS = {
  ...SETTINGS_DEFAULTS,
  notification_inactive_days: 3, notification_start_hour: 6, notification_end_hour: 20,
  notification_use_work_hours: true,
  chat_retention_days: 3,
  company_timezone: '',
};

function applySettingsRows(rows, defaults) {
  const s = { ...defaults };
  rows.forEach(r => {
    if (STRING_KEYS.includes(r.key)) s[r.key] = r.value;
    else if (FEATURE_KEYS.includes(r.key)) s[r.key] = r.value === '1';
    else s[r.key] = parseFloat(r.value);
  });
  return s;
}

module.exports = { FEATURE_KEYS, STRING_KEYS, SETTINGS_DEFAULTS, ADMIN_SETTINGS_DEFAULTS, applySettingsRows };
