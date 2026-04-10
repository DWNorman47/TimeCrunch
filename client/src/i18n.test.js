import { describe, test, expect } from 'vitest';
import { getT } from './i18n';

describe('getT', () => {
  test('returns English translations for "English"', () => {
    const t = getT('English');
    expect(t.clockIn).toBe('Clock In');
    expect(t.clockOut).toBe('Clock Out');
    expect(t.logout).toBe('Logout');
  });

  test('returns Spanish translations for "Spanish"', () => {
    const t = getT('Spanish');
    expect(t.clockIn).toBe('Registrar Entrada');
    expect(t.clockOut).toBe('Registrar Salida');
    expect(t.logout).toBe('Cerrar Sesión');
  });

  test('falls back to English for an unknown language', () => {
    expect(getT('French')).toEqual(getT('English'));
    expect(getT('German')).toEqual(getT('English'));
  });

  test('falls back to English for undefined or null', () => {
    expect(getT(undefined)).toEqual(getT('English'));
    expect(getT(null)).toEqual(getT('English'));
  });

  test('Spanish has all the same keys as English (translation parity)', () => {
    const en = getT('English');
    const es = getT('Spanish');
    const missing = Object.keys(en).filter(k => !(k in es));
    expect(missing).toEqual([]);
  });

  test('English has all the same keys as Spanish (no orphaned Spanish keys)', () => {
    const en = getT('English');
    const es = getT('Spanish');
    const orphaned = Object.keys(es).filter(k => !(k in en));
    expect(orphaned).toEqual([]);
  });

  test('all translation values are non-empty strings or non-empty arrays', () => {
    for (const lang of ['English', 'Spanish']) {
      const t = getT(lang);
      for (const [key, val] of Object.entries(t)) {
        if (Array.isArray(val)) {
          expect(val.length, `${lang}.${key} should not be empty`).toBeGreaterThan(0);
        } else {
          expect(typeof val, `${lang}.${key} should be a string`).toBe('string');
          expect(val.length, `${lang}.${key} should not be empty`).toBeGreaterThan(0);
        }
      }
    }
  });
});
