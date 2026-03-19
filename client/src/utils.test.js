import { describe, test, expect } from 'vitest';
import { fmtHours } from './utils';

describe('fmtHours', () => {
  test('whole hours', () => {
    expect(fmtHours(8)).toBe('8h');
  });

  test('minutes only (less than 1 hour)', () => {
    expect(fmtHours(0.5)).toBe('30m');
  });

  test('hours and minutes', () => {
    expect(fmtHours(1.5)).toBe('1h 30m');
  });

  test('zero', () => {
    expect(fmtHours(0)).toBe('0m');
  });

  test('null/undefined treated as 0', () => {
    expect(fmtHours(null)).toBe('0m');
    expect(fmtHours(undefined)).toBe('0m');
  });

  test('rounds fractional minutes', () => {
    // 0.2566... hours ≈ 15.4 min → rounds to 15m
    expect(fmtHours(0.25)).toBe('15m');
  });

  test('large value', () => {
    expect(fmtHours(40)).toBe('40h');
  });

  test('1h 45m', () => {
    expect(fmtHours(1.75)).toBe('1h 45m');
  });
});
