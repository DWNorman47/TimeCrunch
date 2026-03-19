const { hoursWorked, computeOT } = require('../utils/payCalculations');

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
