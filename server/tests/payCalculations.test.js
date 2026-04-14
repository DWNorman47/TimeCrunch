const { hoursWorked, computeOT, computeDailyPayCosts } = require('../utils/payCalculations');

describe('hoursWorked', () => {
  test('normal same-day shift', () => {
    expect(hoursWorked('08:00', '17:00')).toBeCloseTo(9);
  });

  test('exactly 8 hours', () => {
    expect(hoursWorked('09:00', '17:00')).toBeCloseTo(8);
  });

  test('short shift (30 minutes)', () => {
    expect(hoursWorked('12:00', '12:30')).toBeCloseTo(0.5);
  });

  test('midnight-crossing shift (23:00–00:30)', () => {
    expect(hoursWorked('23:00', '00:30')).toBeCloseTo(1.5);
  });

  test('midnight-crossing shift (22:00–06:00)', () => {
    expect(hoursWorked('22:00', '06:00')).toBeCloseTo(8);
  });

  test('handles seconds in time string', () => {
    expect(hoursWorked('08:00:00', '10:00:00')).toBeCloseTo(2);
  });
});

describe('computeOT — daily rule', () => {
  function makeEntry(work_date, start_time, end_time, wage_type = 'regular', break_minutes = 0) {
    return { work_date, start_time, end_time, wage_type, break_minutes };
  }

  test('no overtime when hours ≤ threshold', () => {
    const entries = [makeEntry('2024-01-01', '09:00', '17:00')]; // 8h
    const { regularHours, overtimeHours } = computeOT(entries, 'daily', 8);
    expect(regularHours).toBeCloseTo(8);
    expect(overtimeHours).toBeCloseTo(0);
  });

  test('overtime when hours > threshold', () => {
    const entries = [makeEntry('2024-01-01', '08:00', '19:00')]; // 11h
    const { regularHours, overtimeHours } = computeOT(entries, 'daily', 8);
    expect(regularHours).toBeCloseTo(8);
    expect(overtimeHours).toBeCloseTo(3);
  });

  test('break minutes reduce hours before OT calculation', () => {
    // 10h raw - 1h break = 9h; 1h OT with 8h threshold
    const entries = [makeEntry('2024-01-01', '08:00', '18:00', 'regular', 60)];
    const { regularHours, overtimeHours } = computeOT(entries, 'daily', 8);
    expect(regularHours).toBeCloseTo(8);
    expect(overtimeHours).toBeCloseTo(1);
  });

  test('multiple entries on same day accumulate before OT', () => {
    // 5h + 5h = 10h total; 2h OT
    const entries = [
      makeEntry('2024-01-01', '06:00', '11:00'),
      makeEntry('2024-01-01', '12:00', '17:00'),
    ];
    const { regularHours, overtimeHours } = computeOT(entries, 'daily', 8);
    expect(regularHours).toBeCloseTo(8);
    expect(overtimeHours).toBeCloseTo(2);
  });

  test('prevailing wage entries do not count toward OT', () => {
    const entries = [
      makeEntry('2024-01-01', '08:00', '16:00', 'regular'),    // 8h regular
      makeEntry('2024-01-01', '16:00', '20:00', 'prevailing'), // 4h prevailing — not counted
    ];
    const { regularHours, overtimeHours } = computeOT(entries, 'daily', 8);
    expect(regularHours).toBeCloseTo(8);
    expect(overtimeHours).toBeCloseTo(0);
  });

  test('multiple days calculated independently', () => {
    // Day 1: 10h (2 OT), Day 2: 6h (0 OT)
    const entries = [
      makeEntry('2024-01-01', '07:00', '17:00'),
      makeEntry('2024-01-02', '09:00', '15:00'),
    ];
    const { regularHours, overtimeHours } = computeOT(entries, 'daily', 8);
    expect(regularHours).toBeCloseTo(14);
    expect(overtimeHours).toBeCloseTo(2);
  });

  test('no entries returns zero hours', () => {
    const { regularHours, overtimeHours } = computeOT([], 'daily', 8);
    expect(regularHours).toBe(0);
    expect(overtimeHours).toBe(0);
  });

  test('exactly at threshold triggers no overtime', () => {
    // 8h exactly with threshold 8 — boundary is ≤, not <
    const entries = [makeEntry('2024-01-01', '08:00', '16:00')]; // exactly 8h
    const { regularHours, overtimeHours } = computeOT(entries, 'daily', 8);
    expect(regularHours).toBeCloseTo(8);
    expect(overtimeHours).toBeCloseTo(0);
  });

  test('custom threshold (4×10 schedule, threshold=10)', () => {
    // 10h shift — no OT; 10.5h shift — 0.5h OT
    const noOT = [makeEntry('2024-01-01', '06:00', '16:00')]; // 10h
    const withOT = [makeEntry('2024-01-02', '06:00', '16:30')]; // 10.5h
    expect(computeOT(noOT, 'daily', 10).overtimeHours).toBeCloseTo(0);
    expect(computeOT(withOT, 'daily', 10).overtimeHours).toBeCloseTo(0.5);
  });
});

describe('computeOT — weekly rule', () => {
  function makeEntry(work_date, hours, wage_type = 'regular') {
    // Start at 08:00, end at 08:00 + hours
    const endHour = String(8 + Math.floor(hours)).padStart(2, '0');
    const endMin = String(Math.round((hours % 1) * 60)).padStart(2, '0');
    return { work_date, start_time: '08:00', end_time: `${endHour}:${endMin}`, wage_type, break_minutes: 0 };
  }

  test('no overtime when weekly hours ≤ threshold', () => {
    // 5 days × 7h = 35h; threshold 40
    const dates = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'];
    const entries = dates.map(d => makeEntry(d, 7));
    const { regularHours, overtimeHours } = computeOT(entries, 'weekly', 40);
    expect(regularHours).toBeCloseTo(35);
    expect(overtimeHours).toBeCloseTo(0);
  });

  test('overtime when weekly hours > threshold', () => {
    // 5 days × 9h = 45h; 5h OT
    const dates = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'];
    const entries = dates.map(d => makeEntry(d, 9));
    const { regularHours, overtimeHours } = computeOT(entries, 'weekly', 40);
    expect(regularHours).toBeCloseTo(40);
    expect(overtimeHours).toBeCloseTo(5);
  });

  test('prevailing wage excluded from weekly OT', () => {
    const dates = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'];
    const regular = dates.map(d => makeEntry(d, 7));          // 35h regular
    const prevailing = dates.map(d => makeEntry(d, 5, 'prevailing')); // 25h prevailing
    const { regularHours, overtimeHours } = computeOT([...regular, ...prevailing], 'weekly', 40);
    expect(regularHours).toBeCloseTo(35);
    expect(overtimeHours).toBeCloseTo(0);
  });

  test('weekly rule is per-calendar-week, not a running total', () => {
    // Week 1 (Jan 1–5): 5 days × 9h = 45h → 5h OT
    // Week 2 (Jan 8–12): 5 days × 7h = 35h → 0h OT
    // If incorrectly totaled: 80h vs 40h threshold = 40h OT (wrong)
    const week1 = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'].map(d => makeEntry(d, 9));
    const week2 = ['2024-01-08', '2024-01-09', '2024-01-10', '2024-01-11', '2024-01-12'].map(d => makeEntry(d, 7));
    const { regularHours, overtimeHours } = computeOT([...week1, ...week2], 'weekly', 40);
    expect(regularHours).toBeCloseTo(75); // 40 + 35
    expect(overtimeHours).toBeCloseTo(5); // only from week 1
  });

  test('weekly rule with OT in both weeks accumulates correctly', () => {
    // Week 1: 45h → 5h OT; Week 2: 44h → 4h OT; Total: 89h reg, 9h OT
    const week1 = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'].map(d => makeEntry(d, 9));
    const week2 = ['2024-01-08', '2024-01-09', '2024-01-10', '2024-01-11', '2024-01-12'].map(d => makeEntry(d, 8.8));
    const { regularHours, overtimeHours } = computeOT([...week1, ...week2], 'weekly', 40);
    expect(regularHours).toBeCloseTo(80); // 40 + 40
    expect(overtimeHours).toBeCloseTo(9); // 5 + 4
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Edge cases added 2026-04 — things real payroll runs have hit
// ───────────────────────────────────────────────────────────────────────────

describe('hoursWorked — edge cases', () => {
  test('zero-length shift (same start/end) returns 0', () => {
    expect(hoursWorked('12:00', '12:00')).toBe(0);
  });

  test('near-full-day shift (00:00 to 23:59)', () => {
    expect(hoursWorked('00:00', '23:59')).toBeCloseTo(23 + 59 / 60, 5);
  });

  test('full 24-hour shift (00:00 to 00:00 interpreted as next day)', () => {
    // end < start triggers the +24h fallback; 0 - 0 is exactly zero, which
    // means hoursWorked can't express a 24-hour shift through this input.
    // This test pins that behavior so a future "fix" doesn't break callers.
    expect(hoursWorked('00:00', '00:00')).toBe(0);
  });

  test('one-second shift', () => {
    expect(hoursWorked('08:00:00', '08:00:01')).toBeCloseTo(1 / 3600, 5);
  });
});

describe('computeOT — more edge cases', () => {
  const daily = (date, start, end, wage = 'regular', brk = 0) => ({
    work_date: date, start_time: start, end_time: end, wage_type: wage, break_minutes: brk,
  });

  test("rule: 'none' returns zero overtime regardless of hours", () => {
    const entries = [daily('2024-01-01', '06:00', '20:00')]; // 14h
    const { regularHours, overtimeHours } = computeOT(entries, 'none', 8);
    expect(regularHours).toBeCloseTo(14);
    expect(overtimeHours).toBe(0);
  });

  test("rule: 'none' still excludes prevailing wage entries", () => {
    const entries = [
      daily('2024-01-01', '08:00', '16:00', 'regular'),    // 8h regular
      daily('2024-01-01', '16:00', '20:00', 'prevailing'), // 4h prevailing
    ];
    const { regularHours, overtimeHours } = computeOT(entries, 'none', 8);
    expect(regularHours).toBeCloseTo(8);
    expect(overtimeHours).toBe(0);
  });

  test('fractional hours just below threshold → no OT', () => {
    const entries = [daily('2024-01-01', '08:00', '15:59')]; // 7.983h
    const { overtimeHours } = computeOT(entries, 'daily', 8);
    expect(overtimeHours).toBe(0);
  });

  test('fractional hours just above threshold → tiny OT', () => {
    const entries = [daily('2024-01-01', '08:00', '16:01')]; // 8.017h
    const { overtimeHours } = computeOT(entries, 'daily', 8);
    expect(overtimeHours).toBeCloseTo(1 / 60, 5); // 1 minute of OT
  });

  test('missing break_minutes (null/undefined) treated as zero', () => {
    const entries = [
      { work_date: '2024-01-01', start_time: '08:00', end_time: '17:00', wage_type: 'regular' },
    ];
    const { regularHours } = computeOT(entries, 'daily', 8);
    expect(regularHours).toBeCloseTo(8);
  });

  test('break longer than shift produces negative hours (known quirk — pins behavior)', () => {
    // Data integrity problem, not a calc bug — but document what happens if
    // dirty data reaches this function. h = -1h → regularHours still 0, no OT.
    const entries = [daily('2024-01-01', '08:00', '09:00', 'regular', 120)]; // 1h shift, 2h break
    const { regularHours, overtimeHours } = computeOT(entries, 'daily', 8);
    expect(regularHours).toBeCloseTo(-1); // negative — flag as data-integrity bug upstream
    expect(overtimeHours).toBe(0);
  });

  test('multiple entries on same day with mixed wage types: regular alone drives OT', () => {
    const entries = [
      daily('2024-01-01', '06:00', '16:00', 'regular'),       // 10h regular
      daily('2024-01-01', '16:00', '20:00', 'prevailing'),    // 4h prevailing (ignored)
    ];
    const { regularHours, overtimeHours } = computeOT(entries, 'daily', 8);
    expect(regularHours).toBeCloseTo(8);
    expect(overtimeHours).toBeCloseTo(2);
  });

  test('weekly rule handles a single heavy day (valid if unusual)', () => {
    const entries = [daily('2024-01-03', '00:00', '16:00')]; // 16h on one day
    const { regularHours, overtimeHours } = computeOT(entries, 'weekly', 40);
    expect(regularHours).toBeCloseTo(16);
    expect(overtimeHours).toBe(0);
  });

  test('unknown rule string falls through to daily behavior', () => {
    // Guards against a settings row ending up as 'weekl' (typo) silently
    // disabling OT. Implementation treats anything not 'weekly'/'none' as daily.
    const entries = [daily('2024-01-01', '08:00', '19:00')]; // 11h
    const { overtimeHours } = computeOT(entries, 'gibberish', 8);
    expect(overtimeHours).toBeCloseTo(3);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// computeDailyPayCosts — previously untested
// ───────────────────────────────────────────────────────────────────────────

describe('computeDailyPayCosts', () => {
  const entry = (date, start, end, wage = 'regular', brk = 0) => ({
    work_date: date, start_time: start, end_time: end, wage_type: wage, break_minutes: brk,
  });

  test('5 days × $200/day, no OT = $1000', () => {
    const entries = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05']
      .map(d => entry(d, '08:00', '16:00')); // 8h each
    const { regularCost, overtimeCost } = computeDailyPayCosts(entries, 'daily', 8, 200, 1.5);
    expect(regularCost).toBe(1000);
    expect(overtimeCost).toBe(0);
  });

  test('10-hour day with $200 rate, 8h threshold, 1.5× = $75 OT cost', () => {
    // 2h OT at (200/8) * 1.5 = 25 * 1.5 = 37.5/hr → 2h = $75
    const entries = [entry('2024-01-01', '07:00', '17:00')]; // 10h
    const { regularCost, overtimeCost } = computeDailyPayCosts(entries, 'daily', 8, 200, 1.5);
    expect(regularCost).toBe(200);
    expect(overtimeCost).toBeCloseTo(75, 2);
  });

  test("'none' rule returns zero OT cost even if hours exceed threshold", () => {
    const entries = [entry('2024-01-01', '06:00', '20:00')]; // 14h
    const { regularCost, overtimeCost } = computeDailyPayCosts(entries, 'none', 8, 200, 1.5);
    expect(regularCost).toBe(200);
    expect(overtimeCost).toBe(0);
  });

  test('multiple entries on the same day count as ONE day for daily rate', () => {
    // Worker clocks in and out twice in a day — still one day's pay
    const entries = [
      entry('2024-01-01', '06:00', '10:00'), // 4h
      entry('2024-01-01', '12:00', '16:00'), // 4h
    ];
    const { regularCost, overtimeCost } = computeDailyPayCosts(entries, 'daily', 8, 200, 1.5);
    expect(regularCost).toBe(200);
    expect(overtimeCost).toBe(0);
  });

  test('prevailing-wage-only day does NOT count toward daily rate', () => {
    // Daily rate is for regular work — prevailing is separately billable.
    const entries = [entry('2024-01-01', '08:00', '16:00', 'prevailing')];
    const { regularCost, overtimeCost } = computeDailyPayCosts(entries, 'daily', 8, 200, 1.5);
    expect(regularCost).toBe(0);
    expect(overtimeCost).toBe(0);
  });

  test('no entries returns zero regular and zero OT', () => {
    const { regularCost, overtimeCost } = computeDailyPayCosts([], 'daily', 8, 200, 1.5);
    expect(regularCost).toBe(0);
    expect(overtimeCost).toBe(0);
  });

  test('weekly OT with daily rate: 45h week, 5h OT at (200/40)*1.5 = $37.50', () => {
    // On weekly rules the threshold is 40, so hourly OT rate = 200/40 = 5 × 1.5 = 7.50
    // 5h OT × 7.50 = $37.50 OT cost. 5 days × 200 = $1000 regular.
    const entries = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05']
      .map(d => entry(d, '08:00', '17:00')); // 9h each = 45h week
    const { regularCost, overtimeCost } = computeDailyPayCosts(entries, 'weekly', 40, 200, 1.5);
    expect(regularCost).toBe(1000);
    expect(overtimeCost).toBeCloseTo(37.5, 2);
  });
});
