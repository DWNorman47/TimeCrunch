const { normWeekStart, startOfWeek, weekRange, weekBucketKey, toYMD } = require('../utils/weekBounds');

describe('normWeekStart', () => {
  test('accepts 0-6 unchanged', () => {
    for (let i = 0; i < 7; i++) expect(normWeekStart(i)).toBe(i);
  });
  test('wraps out-of-range numbers', () => {
    expect(normWeekStart(7)).toBe(0);
    expect(normWeekStart(-1)).toBe(6);
    expect(normWeekStart(14)).toBe(0);
  });
  test('parses numeric strings', () => {
    expect(normWeekStart('3')).toBe(3);
  });
  test('defaults to Monday for garbage input', () => {
    expect(normWeekStart(undefined)).toBe(1);
    expect(normWeekStart(null)).toBe(1);
    expect(normWeekStart('bad')).toBe(1);
    expect(normWeekStart({})).toBe(1);
  });
});

describe('startOfWeek', () => {
  // 2026-04-14 is a Tuesday (day = 2)
  test('Monday-start: Tuesday rolls back to Monday', () => {
    expect(toYMD(startOfWeek('2026-04-14', 1))).toBe('2026-04-13');
  });
  test('Sunday-start: Tuesday rolls back to Sunday', () => {
    expect(toYMD(startOfWeek('2026-04-14', 0))).toBe('2026-04-12');
  });
  test('Thursday-start: Tuesday rolls back to prior Thursday', () => {
    expect(toYMD(startOfWeek('2026-04-14', 4))).toBe('2026-04-09');
  });
  test('date that IS the weekStart stays put', () => {
    // 2026-04-13 is Monday. weekStart=1 → same day.
    expect(toYMD(startOfWeek('2026-04-13', 1))).toBe('2026-04-13');
  });
  test('handles Date object input', () => {
    expect(toYMD(startOfWeek(new Date('2026-04-14T15:30:00'), 1))).toBe('2026-04-13');
  });
});

describe('weekRange', () => {
  const TUE_APR_14 = new Date('2026-04-14T09:00:00');

  test('current week, Monday-start', () => {
    const { from, to } = weekRange(1, 0, TUE_APR_14);
    expect(from).toBe('2026-04-13');
    expect(to).toBe('2026-04-19');
  });
  test('previous week, Monday-start', () => {
    const { from, to } = weekRange(1, -1, TUE_APR_14);
    expect(from).toBe('2026-04-06');
    expect(to).toBe('2026-04-12');
  });
  test('previous week, Sunday-start', () => {
    const { from, to } = weekRange(0, -1, TUE_APR_14);
    expect(from).toBe('2026-04-05');
    expect(to).toBe('2026-04-11');
  });
  test('previous week, Thursday-start', () => {
    const { from, to } = weekRange(4, -1, TUE_APR_14);
    expect(from).toBe('2026-04-02');
    expect(to).toBe('2026-04-08');
  });
  test('next week, Monday-start', () => {
    const { from, to } = weekRange(1, 1, TUE_APR_14);
    expect(from).toBe('2026-04-20');
    expect(to).toBe('2026-04-26');
  });
});

describe('weekBucketKey', () => {
  test('all days in a Monday-start week share one key', () => {
    const keys = new Set();
    for (let d = 13; d <= 19; d++) {
      keys.add(weekBucketKey(`2026-04-${d}`, 1));
    }
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe('2026-04-13');
  });
  test('Sunday and Monday of the same calendar week differ when weekStart=Mon', () => {
    // 2026-04-12 is Sunday → belongs to prior week (start 2026-04-06)
    // 2026-04-13 is Monday → new week (start 2026-04-13)
    expect(weekBucketKey('2026-04-12', 1)).toBe('2026-04-06');
    expect(weekBucketKey('2026-04-13', 1)).toBe('2026-04-13');
  });
});
