const { SETTINGS_DEFAULTS, ADMIN_SETTINGS_DEFAULTS, FEATURE_KEYS, applySettingsRows } = require('../settingsDefaults');

describe('SETTINGS_DEFAULTS', () => {
  test('contains all required numeric fields', () => {
    expect(typeof SETTINGS_DEFAULTS.prevailing_wage_rate).toBe('number');
    expect(typeof SETTINGS_DEFAULTS.default_hourly_rate).toBe('number');
    expect(typeof SETTINGS_DEFAULTS.overtime_multiplier).toBe('number');
    expect(typeof SETTINGS_DEFAULTS.overtime_threshold).toBe('number');
  });

  test('contains overtime_rule string', () => {
    expect(typeof SETTINGS_DEFAULTS.overtime_rule).toBe('string');
  });

  test('all feature flags default to true', () => {
    for (const key of FEATURE_KEYS) {
      expect(SETTINGS_DEFAULTS[key]).toBe(true);
    }
  });
});

describe('ADMIN_SETTINGS_DEFAULTS', () => {
  test('includes all SETTINGS_DEFAULTS keys', () => {
    for (const key of Object.keys(SETTINGS_DEFAULTS)) {
      expect(key in ADMIN_SETTINGS_DEFAULTS).toBe(true);
    }
  });

  test('has admin-only keys', () => {
    expect('notification_inactive_days' in ADMIN_SETTINGS_DEFAULTS).toBe(true);
    expect('chat_retention_days' in ADMIN_SETTINGS_DEFAULTS).toBe(true);
  });
});

describe('applySettingsRows', () => {
  test('returns defaults when rows are empty', () => {
    const result = applySettingsRows([], SETTINGS_DEFAULTS);
    expect(result).toEqual(SETTINGS_DEFAULTS);
  });

  test('overrides numeric value from row', () => {
    const rows = [{ key: 'default_hourly_rate', value: '45' }];
    const result = applySettingsRows(rows, SETTINGS_DEFAULTS);
    expect(result.default_hourly_rate).toBe(45);
  });

  test('overrides overtime_rule string from row', () => {
    const rows = [{ key: 'overtime_rule', value: 'weekly' }];
    const result = applySettingsRows(rows, SETTINGS_DEFAULTS);
    expect(result.overtime_rule).toBe('weekly');
  });

  test('feature flag "1" becomes true', () => {
    const rows = [{ key: 'feature_scheduling', value: '1' }];
    const result = applySettingsRows(rows, SETTINGS_DEFAULTS);
    expect(result.feature_scheduling).toBe(true);
  });

  test('feature flag "0" becomes false', () => {
    const rows = [{ key: 'feature_chat', value: '0' }];
    const result = applySettingsRows(rows, SETTINGS_DEFAULTS);
    expect(result.feature_chat).toBe(false);
  });

  test('does not mutate the defaults object', () => {
    const defaults = { ...SETTINGS_DEFAULTS };
    applySettingsRows([{ key: 'default_hourly_rate', value: '99' }], SETTINGS_DEFAULTS);
    expect(SETTINGS_DEFAULTS.default_hourly_rate).toBe(defaults.default_hourly_rate);
  });
});
