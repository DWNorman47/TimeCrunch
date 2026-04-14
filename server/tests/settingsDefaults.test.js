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

  test('all feature flags have a boolean default', () => {
    for (const key of FEATURE_KEYS) {
      expect(typeof SETTINGS_DEFAULTS[key]).toBe('boolean');
    }
  });

  test('show_worker_wages defaults to false', () => {
    expect(SETTINGS_DEFAULTS.show_worker_wages).toBe(false);
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

  test('zero numeric value is applied and not discarded as falsy', () => {
    const rows = [{ key: 'overtime_multiplier', value: '0' }];
    const result = applySettingsRows(rows, SETTINGS_DEFAULTS);
    expect(result.overtime_multiplier).toBe(0);
  });

  test('unknown key is added with parseFloat of its value', () => {
    // Current behavior: unknown keys fall through to parseFloat().
    // This documents the behavior so a change would be a conscious decision.
    const rows = [{ key: 'mystery_key', value: '42' }];
    const result = applySettingsRows(rows, SETTINGS_DEFAULTS);
    expect(result.mystery_key).toBe(42);
  });

  test('non-numeric value for a numeric key becomes NaN', () => {
    // parseFloat('bad') === NaN; documents that invalid DB data produces NaN
    const rows = [{ key: 'overtime_multiplier', value: 'bad' }];
    const result = applySettingsRows(rows, SETTINGS_DEFAULTS);
    expect(result.overtime_multiplier).toBeNaN();
  });

  test('multiple rows are all applied', () => {
    const rows = [
      { key: 'default_hourly_rate', value: '35' },
      { key: 'overtime_multiplier', value: '2' },
      { key: 'overtime_rule', value: 'weekly' },
    ];
    const result = applySettingsRows(rows, SETTINGS_DEFAULTS);
    expect(result.default_hourly_rate).toBe(35);
    expect(result.overtime_multiplier).toBe(2);
    expect(result.overtime_rule).toBe('weekly');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Dirty-data cases — what happens when settings rows drift from spec
// ───────────────────────────────────────────────────────────────────────────

describe('applySettingsRows — dirty data', () => {
  test('feature flag value "true" (not "1") is treated as FALSE', () => {
    // The spec is '1' = true, anything else = false. Documents what happens
    // if a migration or admin UI accidentally stores the literal string.
    const rows = [{ key: 'feature_chat', value: 'true' }];
    const result = applySettingsRows(rows, SETTINGS_DEFAULTS);
    expect(result.feature_chat).toBe(false);
  });

  test('feature flag value "" (empty) is treated as false', () => {
    const rows = [{ key: 'feature_chat', value: '' }];
    const result = applySettingsRows(rows, SETTINGS_DEFAULTS);
    expect(result.feature_chat).toBe(false);
  });

  test('feature flag value "0" turns a defaulted-true flag off', () => {
    expect(SETTINGS_DEFAULTS.feature_chat).toBe(true);
    const rows = [{ key: 'feature_chat', value: '0' }];
    const result = applySettingsRows(rows, SETTINGS_DEFAULTS);
    expect(result.feature_chat).toBe(false);
  });

  test('string key with null value is applied (and becomes null)', () => {
    // String keys don't transform — null falls through as null
    const rows = [{ key: 'company_timezone', value: null }];
    const result = applySettingsRows(rows, ADMIN_SETTINGS_DEFAULTS);
    expect(result.company_timezone).toBeNull();
  });

  test('string key with whitespace preserved (no trimming)', () => {
    // Documents current behavior — callers shouldn't assume trimming
    const rows = [{ key: 'currency', value: '  USD  ' }];
    const result = applySettingsRows(rows, SETTINGS_DEFAULTS);
    expect(result.currency).toBe('  USD  ');
  });

  test('duplicate keys: later row wins', () => {
    // Important — if two rows for the same key somehow coexist in the DB,
    // the order returned determines which value applies.
    const rows = [
      { key: 'default_hourly_rate', value: '25' },
      { key: 'default_hourly_rate', value: '40' },
    ];
    const result = applySettingsRows(rows, SETTINGS_DEFAULTS);
    expect(result.default_hourly_rate).toBe(40);
  });

  test('orphaned key (no longer in defaults) is added with parseFloat', () => {
    // If a migration removed a key from defaults but the row still exists in
    // the DB, the function still includes it. Callers should be resilient.
    const rows = [{ key: 'deprecated_setting', value: '99' }];
    const result = applySettingsRows(rows, SETTINGS_DEFAULTS);
    expect(result.deprecated_setting).toBe(99);
  });

  test('numeric key with empty string becomes NaN (documents quirk)', () => {
    const rows = [{ key: 'overtime_multiplier', value: '' }];
    const result = applySettingsRows(rows, SETTINGS_DEFAULTS);
    expect(result.overtime_multiplier).toBeNaN();
  });

  test('feature flag and numeric key in same batch both resolve correctly', () => {
    const rows = [
      { key: 'feature_chat', value: '0' },
      { key: 'overtime_multiplier', value: '1.75' },
    ];
    const result = applySettingsRows(rows, SETTINGS_DEFAULTS);
    expect(result.feature_chat).toBe(false);
    expect(result.overtime_multiplier).toBe(1.75);
  });

  test('empty key list returns shallow copy of defaults, not the same reference', () => {
    const result = applySettingsRows([], SETTINGS_DEFAULTS);
    expect(result).toEqual(SETTINGS_DEFAULTS);
    expect(result).not.toBe(SETTINGS_DEFAULTS); // different object
  });

  test('all known FEATURE_KEYS flip to true on "1"', () => {
    const rows = FEATURE_KEYS.map(key => ({ key, value: '1' }));
    const result = applySettingsRows(rows, SETTINGS_DEFAULTS);
    for (const key of FEATURE_KEYS) {
      expect(result[key]).toBe(true);
    }
  });

  test('all known FEATURE_KEYS flip to false on "0"', () => {
    const rows = FEATURE_KEYS.map(key => ({ key, value: '0' }));
    const result = applySettingsRows(rows, SETTINGS_DEFAULTS);
    for (const key of FEATURE_KEYS) {
      expect(result[key]).toBe(false);
    }
  });
});
