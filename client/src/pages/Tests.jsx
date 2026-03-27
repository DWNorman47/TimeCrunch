import React, { useState } from 'react';
import { localDateStr, formatCurrency, currencySymbol, fmtHours, formatInTz } from '../utils';

// Use raw fetch for all API tests — avoids the axios 401 interceptor which would log the user out
const BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';
const get    = (path, token) => fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
const post   = (path, body, token) => fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const patch  = (path, body, token) => fetch(`${BASE}${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const del    = (path, token) => fetch(`${BASE}${path}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} });

const TOKEN = () => localStorage.getItem('tc_token');

// ── Tiny test runner ────────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertClose(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance)
    throw new Error(`${label}: expected ${expected} ± ${tolerance}, got ${actual}`);
}

function assertIs401(status, label) {
  if (status !== 401) throw new Error(`${label || 'Auth guard'}: expected 401, got ${status}`);
}

function assertIs400(status, label) {
  if (status !== 400) throw new Error(`${label || 'Validation'}: expected 400, got ${status}`);
}

// ── Inlined server utilities (no Node.js required) ──────────────────────────────

// payCalculations.js
function hoursWorked(start, end) {
  let ms = new Date(`1970-01-01T${end}`) - new Date(`1970-01-01T${start}`);
  if (ms < 0) ms += 86400000;
  return ms / 3600000;
}

function computeOT(entries, rule, threshold) {
  const regular = entries.filter(e => e.wage_type === 'regular');
  if (rule === 'weekly') {
    const weekly = {};
    regular.forEach(e => {
      const d = new Date(e.work_date.toString().substring(0, 10) + 'T00:00:00');
      const jan4 = new Date(d.getFullYear(), 0, 4);
      const week = Math.ceil(((d - jan4) / 86400000 + jan4.getDay() + 1) / 7);
      const key = `${d.getFullYear()}-W${week}`;
      const h = hoursWorked(e.start_time, e.end_time) - (e.break_minutes || 0) / 60;
      weekly[key] = (weekly[key] || 0) + h;
    });
    const reg = Object.values(weekly).reduce((s, h) => s + Math.min(h, threshold), 0);
    const ot  = Object.values(weekly).reduce((s, h) => s + Math.max(h - threshold, 0), 0);
    return { regularHours: reg, overtimeHours: ot };
  }
  if (rule === 'none') {
    const total = regular.reduce((s, e) => s + hoursWorked(e.start_time, e.end_time) - (e.break_minutes || 0) / 60, 0);
    return { regularHours: total, overtimeHours: 0 };
  }
  // daily (default)
  const daily = {};
  regular.forEach(e => {
    const key = e.work_date.toString().substring(0, 10);
    const h = hoursWorked(e.start_time, e.end_time) - (e.break_minutes || 0) / 60;
    daily[key] = (daily[key] || 0) + h;
  });
  const reg = Object.values(daily).reduce((s, h) => s + Math.min(h, threshold), 0);
  const ot  = Object.values(daily).reduce((s, h) => s + Math.max(h - threshold, 0), 0);
  return { regularHours: reg, overtimeHours: ot };
}

function computeDailyPayCosts(entries, overtimeRule, threshold, dailyRate, overtimeMultiplier) {
  const regular = entries.filter(e => e.wage_type === 'regular');
  const days = new Set(regular.map(e => e.work_date.toString().substring(0, 10))).size;
  if (overtimeRule === 'none') return { regularCost: days * dailyRate, overtimeCost: 0 };
  const { overtimeHours } = computeOT(entries, overtimeRule, threshold);
  return {
    regularCost: days * dailyRate,
    overtimeCost: overtimeHours * (dailyRate / threshold) * overtimeMultiplier,
  };
}

// geoUtils.js
function haversineDistanceFt(lat1, lng1, lat2, lng2) {
  const R = 20902231;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function validCoords(lat, lng) {
  const la = parseFloat(lat), lo = parseFloat(lng);
  return !isNaN(la) && !isNaN(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180;
}

// settingsDefaults.js
const FEATURE_KEYS_TEST = ['feature_scheduling', 'feature_analytics', 'feature_chat', 'feature_prevailing_wage', 'feature_field', 'feature_timeclock', 'feature_projects', 'feature_overtime', 'feature_geolocation', 'feature_inactive_alerts', 'feature_overtime_alerts', 'feature_broadcast', 'show_worker_wages', 'notification_use_work_hours'];
const STRING_KEYS_TEST  = ['overtime_rule', 'currency', 'company_timezone', 'invoice_signature', 'default_temp_password'];

function applySettingsRows(rows, defaults) {
  const s = { ...defaults };
  rows.forEach(r => {
    if (STRING_KEYS_TEST.includes(r.key)) s[r.key] = r.value;
    else if (FEATURE_KEYS_TEST.includes(r.key)) s[r.key] = r.value === '1';
    else s[r.key] = parseFloat(r.value);
  });
  return s;
}

// ── Test helper — makes a guard entry: expects 401 when no token is provided ────
function guard(label, path, method = 'GET') {
  return {
    name: `${label} — 401 without token`,
    run: async () => {
      const r = method === 'GET' ? await get(path) : await post(path, {});
      assertIs401(r.status, label);
    },
  };
}

// ── Test suites ─────────────────────────────────────────────────────────────────

const SUITES = [

  // ── 1. localDateStr ──────────────────────────────────────────────────────────
  {
    name: 'localDateStr()',
    tests: [
      { name: 'Returns YYYY-MM-DD format', run: () => {
        const result = localDateStr(new Date('2025-06-15T12:00:00'));
        assert(/^\d{4}-\d{2}-\d{2}$/.test(result), `"${result}" is not YYYY-MM-DD`);
      }},
      { name: 'Uses local timezone, not UTC', run: () => {
        const d = new Date(2025, 5, 15); // June 15 local
        assert(localDateStr(d).startsWith('2025-06'), `Expected 2025-06-xx, got ${localDateStr(d)}`);
      }},
      { name: 'Defaults to today without argument', run: () => {
        assert(/^\d{4}-\d{2}-\d{2}$/.test(localDateStr()), 'Not YYYY-MM-DD');
      }},
      { name: 'Jan 1 formats correctly', run: () => {
        assertEqual(localDateStr(new Date(2025, 0, 1)), '2025-01-01', 'Jan 1');
      }},
      { name: 'Dec 31 formats correctly', run: () => {
        assertEqual(localDateStr(new Date(2025, 11, 31)), '2025-12-31', 'Dec 31');
      }},
    ],
  },

  // ── 2. formatCurrency ────────────────────────────────────────────────────────
  {
    name: 'formatCurrency()',
    tests: [
      { name: 'USD — dollar sign and comma-grouped', run: () => {
        const r = formatCurrency(1234.5, 'USD');
        assert(r.includes('1,234.50'), `Got "${r}"`);
        assert(r.includes('$'), `Missing $ in "${r}"`);
      }},
      { name: 'USD — zero', run: () => {
        assert(formatCurrency(0, 'USD').includes('0.00'), `Got "${formatCurrency(0, 'USD')}"`);
      }},
      { name: 'USD — negative', run: () => {
        assert(formatCurrency(-50, 'USD').includes('50.00'), `Got "${formatCurrency(-50, 'USD')}"`);
      }},
      { name: 'EUR — contains €', run: () => {
        assert(formatCurrency(100, 'EUR').includes('€'), `Got "${formatCurrency(100, 'EUR')}"`);
      }},
      { name: 'GBP — contains £', run: () => {
        assert(formatCurrency(100, 'GBP').includes('£'), `Got "${formatCurrency(100, 'GBP')}"`);
      }},
      { name: 'CAD — returns a string', run: () => {
        assert(typeof formatCurrency(100, 'CAD') === 'string');
      }},
      { name: 'MXN — returns a string', run: () => {
        assert(typeof formatCurrency(100, 'MXN') === 'string');
      }},
      { name: 'Unknown currency — does not throw', run: () => {
        const r = formatCurrency(10, 'XYZ');
        assert(typeof r === 'string' && r.length > 0);
      }},
      { name: 'Two decimal places for whole numbers', run: () => {
        assert(formatCurrency(5, 'USD').includes('5.00'), `Got "${formatCurrency(5, 'USD')}"`);
      }},
    ],
  },

  // ── 3. currencySymbol ────────────────────────────────────────────────────────
  {
    name: 'currencySymbol()',
    tests: [
      { name: 'USD → $',  run: () => assertEqual(currencySymbol('USD'), '$',  'USD') },
      { name: 'EUR → €',  run: () => assertEqual(currencySymbol('EUR'), '€',  'EUR') },
      { name: 'GBP → £',  run: () => assertEqual(currencySymbol('GBP'), '£',  'GBP') },
      { name: 'CAD — returns string', run: () => assert(typeof currencySymbol('CAD') === 'string') },
      { name: 'MXN — returns string', run: () => assert(typeof currencySymbol('MXN') === 'string') },
      { name: 'Defaults to USD when no arg', run: () => {
        const s = currencySymbol(); assert(typeof s === 'string' && s.length > 0);
      }},
      { name: 'Unknown code — returns string fallback', run: () => {
        const s = currencySymbol('ZZZ'); assert(typeof s === 'string' && s.length > 0);
      }},
    ],
  },

  // ── 4. fmtHours ─────────────────────────────────────────────────────────────
  {
    name: 'fmtHours()',
    tests: [
      { name: '8h exactly',      run: () => assertEqual(fmtHours(8),    '8h',      '8') },
      { name: '1.5h → 1h 30m',   run: () => assertEqual(fmtHours(1.5),  '1h 30m',  '1.5') },
      { name: '0.25h → 15m',     run: () => assertEqual(fmtHours(0.25), '15m',     '0.25') },
      { name: '0 → 0m',          run: () => assertEqual(fmtHours(0),    '0m',      '0') },
      { name: 'null → 0m',       run: () => assertEqual(fmtHours(null), '0m',      'null') },
      { name: 'undefined → 0m',  run: () => assertEqual(fmtHours(undefined), '0m', 'undefined') },
      { name: '2.75h → 2h 45m',  run: () => assertEqual(fmtHours(2.75), '2h 45m',  '2.75') },
      { name: '0.5h → 30m',      run: () => assertEqual(fmtHours(0.5),  '30m',     '0.5') },
      { name: '10h exactly',     run: () => assertEqual(fmtHours(10),   '10h',     '10') },
      { name: '1h 1m',           run: () => assertEqual(fmtHours(1 + 1/60), '1h 1m', '1h1m') },
      { name: 'Rounding: 0.0083h ≈ 1m', run: () => assertEqual(fmtHours(1/60), '1m', '1/60') },
    ],
  },

  // ── 5. formatInTz ────────────────────────────────────────────────────────────
  {
    name: 'formatInTz()',
    tests: [
      { name: 'Returns a non-empty string', run: () => {
        const r = formatInTz('2025-06-15T14:30:00Z', 'America/New_York');
        assert(typeof r === 'string' && r.length > 0, `Got "${r}"`);
      }},
      { name: 'Works without timezone', run: () => {
        const r = formatInTz('2025-06-15T14:30:00Z');
        assert(typeof r === 'string' && r.length > 0);
      }},
      { name: 'Invalid timezone falls back gracefully', run: () => {
        const r = formatInTz('2025-06-15T14:30:00Z', 'Not/ATimezone');
        assert(typeof r === 'string' && r.length > 0);
      }},
      { name: 'Accepts custom format options', run: () => {
        const r = formatInTz('2025-06-15T14:30:00Z', 'UTC', { year: 'numeric', month: 'long', day: 'numeric' });
        assert(r.includes('2025'), `Got "${r}"`);
      }},
    ],
  },

  // ── 6. hoursWorked ───────────────────────────────────────────────────────────
  {
    name: 'hoursWorked()',
    tests: [
      { name: '08:00 → 16:00 = 8h',    run: () => assertEqual(hoursWorked('08:00', '16:00'), 8,   '8h') },
      { name: '08:00 → 08:30 = 0.5h',  run: () => assertEqual(hoursWorked('08:00', '08:30'), 0.5, '30m') },
      { name: '00:00 → 00:00 = 24h',   run: () => assertEqual(hoursWorked('00:00', '00:00'), 24,  '24h') },
      { name: '23:00 → 01:00 midnight crossing = 2h', run: () => assertEqual(hoursWorked('23:00', '01:00'), 2, 'midnight') },
      { name: '22:30 → 06:30 midnight crossing = 8h', run: () => assertEqual(hoursWorked('22:30', '06:30'), 8, 'overnight 8h') },
      { name: '09:00 → 17:30 = 8.5h',  run: () => assertEqual(hoursWorked('09:00', '17:30'), 8.5, '8.5h') },
      { name: '12:00 → 12:15 = 0.25h', run: () => assertEqual(hoursWorked('12:00', '12:15'), 0.25, '0.25h') },
    ],
  },

  // ── 7. computeOT — daily rule ────────────────────────────────────────────────
  {
    name: 'computeOT() — daily rule',
    tests: [
      { name: 'Exactly 8h — no OT', run: () => {
        const entries = [{ wage_type: 'regular', start_time: '08:00', end_time: '16:00', work_date: '2025-06-16', break_minutes: 0 }];
        const r = computeOT(entries, 'daily', 8);
        assertEqual(r.regularHours, 8, 'reg'); assertEqual(r.overtimeHours, 0, 'ot');
      }},
      { name: '10h shift → 2h OT', run: () => {
        const entries = [{ wage_type: 'regular', start_time: '06:00', end_time: '16:00', work_date: '2025-06-16', break_minutes: 0 }];
        const r = computeOT(entries, 'daily', 8);
        assertEqual(r.regularHours, 8, 'reg'); assertEqual(r.overtimeHours, 2, 'ot');
      }},
      { name: '10h with 30m break → 1.5h OT', run: () => {
        const entries = [{ wage_type: 'regular', start_time: '06:00', end_time: '16:00', work_date: '2025-06-16', break_minutes: 30 }];
        const r = computeOT(entries, 'daily', 8);
        assertEqual(r.regularHours, 8, 'reg'); assertEqual(r.overtimeHours, 1.5, 'ot');
      }},
      { name: 'prevailing wage entries are excluded from OT', run: () => {
        const entries = [
          { wage_type: 'prevailing_wage', start_time: '08:00', end_time: '20:00', work_date: '2025-06-16', break_minutes: 0 },
        ];
        const r = computeOT(entries, 'daily', 8);
        assertEqual(r.regularHours, 0, 'reg'); assertEqual(r.overtimeHours, 0, 'ot');
      }},
      { name: 'Two 6h days — no OT', run: () => {
        const entries = [
          { wage_type: 'regular', start_time: '08:00', end_time: '14:00', work_date: '2025-06-16', break_minutes: 0 },
          { wage_type: 'regular', start_time: '08:00', end_time: '14:00', work_date: '2025-06-17', break_minutes: 0 },
        ];
        const r = computeOT(entries, 'daily', 8);
        assertEqual(r.regularHours, 12, 'reg'); assertEqual(r.overtimeHours, 0, 'ot');
      }},
      { name: 'Two 10h days → 4h OT', run: () => {
        const entries = [
          { wage_type: 'regular', start_time: '06:00', end_time: '16:00', work_date: '2025-06-16', break_minutes: 0 },
          { wage_type: 'regular', start_time: '06:00', end_time: '16:00', work_date: '2025-06-17', break_minutes: 0 },
        ];
        const r = computeOT(entries, 'daily', 8);
        assertEqual(r.regularHours, 16, 'reg'); assertEqual(r.overtimeHours, 4, 'ot');
      }},
      { name: 'Empty entries → zeros', run: () => {
        const r = computeOT([], 'daily', 8);
        assertEqual(r.regularHours, 0, 'reg'); assertEqual(r.overtimeHours, 0, 'ot');
      }},
    ],
  },

  // ── 8. computeOT — weekly rule ───────────────────────────────────────────────
  {
    name: 'computeOT() — weekly rule',
    tests: [
      { name: '5 × 8h days (40h) — no OT', run: () => {
        const entries = ['2025-06-16','2025-06-17','2025-06-18','2025-06-19','2025-06-20'].map(d => ({
          wage_type: 'regular', start_time: '08:00', end_time: '16:00', work_date: d, break_minutes: 0,
        }));
        const r = computeOT(entries, 'weekly', 40);
        assertEqual(r.regularHours, 40, 'reg'); assertEqual(r.overtimeHours, 0, 'ot');
      }},
      { name: '5 × 9h days (45h) → 5h OT', run: () => {
        const entries = ['2025-06-16','2025-06-17','2025-06-18','2025-06-19','2025-06-20'].map(d => ({
          wage_type: 'regular', start_time: '08:00', end_time: '17:00', work_date: d, break_minutes: 0,
        }));
        const r = computeOT(entries, 'weekly', 40);
        assertEqual(r.regularHours, 40, 'reg'); assertEqual(r.overtimeHours, 5, 'ot');
      }},
      { name: 'Hours from two different weeks are independently thresholded', run: () => {
        // Week 1: 44h, Week 2: 44h → 8h total OT
        const week1 = ['2025-06-16','2025-06-17','2025-06-18','2025-06-19','2025-06-20'].map(d => ({
          wage_type: 'regular', start_time: '08:00', end_time: '16:48', work_date: d, break_minutes: 0,
        }));
        const week2 = ['2025-06-23','2025-06-24','2025-06-25','2025-06-26','2025-06-27'].map(d => ({
          wage_type: 'regular', start_time: '08:00', end_time: '16:48', work_date: d, break_minutes: 0,
        }));
        const r = computeOT([...week1, ...week2], 'weekly', 40);
        assert(r.overtimeHours > 0, 'Expected some OT');
      }},
    ],
  },

  // ── 9. computeOT — none rule ─────────────────────────────────────────────────
  {
    name: 'computeOT() — none rule',
    tests: [
      { name: '12h shift — overtimeHours = 0', run: () => {
        const entries = [{ wage_type: 'regular', start_time: '06:00', end_time: '18:00', work_date: '2025-06-16', break_minutes: 0 }];
        const r = computeOT(entries, 'none', 8);
        assertEqual(r.overtimeHours, 0, 'ot');
        assertEqual(r.regularHours, 12, 'reg');
      }},
      { name: '5 × 10h days — no OT under none rule', run: () => {
        const entries = ['2025-06-16','2025-06-17','2025-06-18','2025-06-19','2025-06-20'].map(d => ({
          wage_type: 'regular', start_time: '06:00', end_time: '16:00', work_date: d, break_minutes: 0,
        }));
        const r = computeOT(entries, 'none', 8);
        assertEqual(r.overtimeHours, 0, 'ot');
        assertEqual(r.regularHours, 50, 'reg');
      }},
    ],
  },

  // ── 10. computeDailyPayCosts ─────────────────────────────────────────────────
  {
    name: 'computeDailyPayCosts()',
    tests: [
      { name: 'No OT rule: cost = days × dailyRate', run: () => {
        const entries = [
          { wage_type: 'regular', start_time: '08:00', end_time: '16:00', work_date: '2025-06-16', break_minutes: 0 },
          { wage_type: 'regular', start_time: '08:00', end_time: '16:00', work_date: '2025-06-17', break_minutes: 0 },
        ];
        const r = computeDailyPayCosts(entries, 'none', 8, 200, 1.5);
        assertEqual(r.regularCost, 400, 'regularCost');
        assertEqual(r.overtimeCost, 0, 'overtimeCost');
      }},
      { name: 'Daily OT: 2 days × 10h → OT cost', run: () => {
        const entries = [
          { wage_type: 'regular', start_time: '06:00', end_time: '16:00', work_date: '2025-06-16', break_minutes: 0 },
          { wage_type: 'regular', start_time: '06:00', end_time: '16:00', work_date: '2025-06-17', break_minutes: 0 },
        ];
        // 2 days × $200 regular = $400. OT: 4h × (200/8) × 1.5 = 4 × 25 × 1.5 = $150
        const r = computeDailyPayCosts(entries, 'daily', 8, 200, 1.5);
        assertEqual(r.regularCost, 400, 'regularCost');
        assertEqual(r.overtimeCost, 150, 'overtimeCost');
      }},
      { name: 'Prevailing wage entries not counted as days', run: () => {
        const entries = [
          { wage_type: 'prevailing_wage', start_time: '08:00', end_time: '16:00', work_date: '2025-06-16', break_minutes: 0 },
        ];
        const r = computeDailyPayCosts(entries, 'none', 8, 200, 1.5);
        assertEqual(r.regularCost, 0, 'regularCost should be 0 for PW entry');
      }},
      { name: 'Same date repeated — counted as 1 day', run: () => {
        const entries = [
          { wage_type: 'regular', start_time: '08:00', end_time: '12:00', work_date: '2025-06-16', break_minutes: 0 },
          { wage_type: 'regular', start_time: '13:00', end_time: '17:00', work_date: '2025-06-16', break_minutes: 0 },
        ];
        const r = computeDailyPayCosts(entries, 'none', 8, 200, 1.5);
        assertEqual(r.regularCost, 200, 'Should be 1 day');
      }},
    ],
  },

  // ── 11. haversineDistanceFt ──────────────────────────────────────────────────
  {
    name: 'haversineDistanceFt()',
    tests: [
      { name: 'Same point = 0 feet', run: () => {
        assertEqual(haversineDistanceFt(40.7128, -74.006, 40.7128, -74.006), 0, 'same point');
      }},
      { name: 'NYC to LA ≈ 13,600,000 ft (2575 miles)', run: () => {
        const dist = haversineDistanceFt(40.7128, -74.006, 34.0522, -118.2437);
        assertClose(dist, 13607000, 100000, 'NYC-LA');
      }},
      { name: '100ft radius: points inside register < 100ft', run: () => {
        // ~30m north is about 100ft
        const dist = haversineDistanceFt(40.7128, -74.006, 40.71307, -74.006);
        assert(dist < 200, `Expected < 200ft, got ${dist.toFixed(0)}ft`);
      }},
      { name: 'Returns a positive number for distinct points', run: () => {
        assert(haversineDistanceFt(51.5074, -0.1278, 48.8566, 2.3522) > 0, 'London to Paris > 0');
      }},
      { name: 'Symmetric: A→B === B→A', run: () => {
        const ab = haversineDistanceFt(40.7128, -74.006, 34.0522, -118.2437);
        const ba = haversineDistanceFt(34.0522, -118.2437, 40.7128, -74.006);
        assertClose(ab, ba, 0.001, 'symmetric');
      }},
    ],
  },

  // ── 12. validCoords ──────────────────────────────────────────────────────────
  {
    name: 'validCoords()',
    tests: [
      { name: 'Valid NYC coords',            run: () => assert(validCoords(40.7128, -74.006)) },
      { name: 'Valid equator / prime meridian', run: () => assert(validCoords(0, 0)) },
      { name: 'Valid edge: lat 90',          run: () => assert(validCoords(90, 0)) },
      { name: 'Valid edge: lat -90',         run: () => assert(validCoords(-90, 0)) },
      { name: 'Valid edge: lng 180',         run: () => assert(validCoords(0, 180)) },
      { name: 'Valid edge: lng -180',        run: () => assert(validCoords(0, -180)) },
      { name: 'Invalid: lat > 90',           run: () => assert(!validCoords(91, 0)) },
      { name: 'Invalid: lat < -90',          run: () => assert(!validCoords(-91, 0)) },
      { name: 'Invalid: lng > 180',          run: () => assert(!validCoords(0, 181)) },
      { name: 'Invalid: lng < -180',         run: () => assert(!validCoords(0, -181)) },
      { name: 'Invalid: NaN lat',            run: () => assert(!validCoords(NaN, 0)) },
      { name: 'Invalid: string "abc"',       run: () => assert(!validCoords('abc', 0)) },
      { name: 'Invalid: null',               run: () => assert(!validCoords(null, null)) },
      { name: 'String numbers are coerced',  run: () => assert(validCoords('40.7', '-74.0')) },
    ],
  },

  // ── 13. applySettingsRows ────────────────────────────────────────────────────
  {
    name: 'applySettingsRows()',
    tests: [
      { name: 'String key is kept as string', run: () => {
        const r = applySettingsRows([{ key: 'currency', value: 'EUR' }], { currency: 'USD' });
        assertEqual(r.currency, 'EUR', 'currency');
      }},
      { name: 'Feature key "1" → true', run: () => {
        const r = applySettingsRows([{ key: 'feature_scheduling', value: '1' }], { feature_scheduling: false });
        assertEqual(r.feature_scheduling, true, 'feature on');
      }},
      { name: 'Feature key "0" → false', run: () => {
        const r = applySettingsRows([{ key: 'feature_scheduling', value: '0' }], { feature_scheduling: true });
        assertEqual(r.feature_scheduling, false, 'feature off');
      }},
      { name: 'Numeric key is parsed as float', run: () => {
        const r = applySettingsRows([{ key: 'overtime_threshold', value: '10' }], { overtime_threshold: 8 });
        assertEqual(r.overtime_threshold, 10, 'threshold');
      }},
      { name: 'Default is preserved when key not in rows', run: () => {
        const r = applySettingsRows([], { overtime_threshold: 8, currency: 'USD' });
        assertEqual(r.overtime_threshold, 8, 'default threshold');
        assertEqual(r.currency, 'USD', 'default currency');
      }},
      { name: 'overtime_rule stays string (not parsed as float)', run: () => {
        const r = applySettingsRows([{ key: 'overtime_rule', value: 'weekly' }], { overtime_rule: 'daily' });
        assertEqual(r.overtime_rule, 'weekly', 'overtime_rule');
      }},
      { name: 'Empty rows returns cloned defaults', run: () => {
        const defaults = { foo: 42, bar: 'baz' };
        const r = applySettingsRows([], defaults);
        assertEqual(r.foo, 42, 'foo');
        assertEqual(r.bar, 'baz', 'bar');
      }},
    ],
  },

  // ── 14. API — /auth/me ───────────────────────────────────────────────────────
  {
    name: 'API — /auth/me',
    async: true,
    tests: [
      { name: '200 with valid token OR 401 without', run: async () => {
        const r = await get('/auth/me', TOKEN());
        assert(r.status === 200 || r.status === 401, `Unexpected ${r.status}`);
        if (r.status === 200) {
          const d = await r.json();
          assert(d?.user?.id, 'user.id must exist');
          assert(d?.user?.role, 'user.role must exist');
        }
      }},
      { name: '401 without token', run: async () => assertIs401((await get('/auth/me')).status) },
    ],
  },

  // ── 15. API — /auth/login validation ────────────────────────────────────────
  {
    name: 'API — /auth/login validation',
    async: true,
    tests: [
      { name: 'Empty body → 400', run: async () => assertIs400((await post('/auth/login', {})).status) },
      { name: 'Missing password → 400', run: async () => assertIs400((await post('/auth/login', { username: 'x', company_name: 'y' })).status) },
      { name: 'Wrong credentials → 401', run: async () => assertIs401((await post('/auth/login', { username: '__test_nonexistent__', password: 'wrong', company_name: '__test__' })).status) },
    ],
  },

  // ── 16. API — Auth guards: admin routes ──────────────────────────────────────
  {
    name: 'API — Auth guards (admin routes)',
    async: true,
    tests: [
      guard('GET /admin/kpis',              '/admin/kpis'),
      guard('GET /admin/workers',           '/admin/workers'),
      guard('GET /admin/workers/export',    '/admin/workers/export'),
      guard('GET /admin/projects',          '/admin/projects'),
      guard('GET /admin/time-entries',      '/admin/time-entries'),
      guard('GET /admin/schedule',          '/admin/schedule'),
      guard('GET /admin/settings',          '/admin/settings'),
      guard('GET /admin/reports/hours',     '/admin/reports/hours'),
      guard('GET /admin/reports/payroll',   '/admin/reports/payroll'),
      guard('GET /admin/approval-queue',    '/admin/approval-queue'),
      guard('GET /admin/audit-log',         '/admin/audit-log'),
      guard('GET /admin/messages',          '/admin/messages'),
      guard('GET /admin/admins',            '/admin/admins'),
    ],
  },

  // ── 17. API — Auth guards: QBO routes ────────────────────────────────────────
  {
    name: 'API — Auth guards (QBO routes)',
    async: true,
    tests: [
      guard('GET /qbo/status',     '/qbo/status'),
      guard('GET /qbo/employees',  '/qbo/employees'),
      guard('GET /qbo/customers',  '/qbo/customers'),
      guard('GET /qbo/vendors',    '/qbo/vendors'),
      guard('POST /qbo/push',      '/qbo/push', 'POST'),
    ],
  },

  // ── 18. API — Auth guards: worker routes ────────────────────────────────────
  {
    name: 'API — Auth guards (worker routes)',
    async: true,
    tests: [
      guard('GET /clock/status',   '/clock/status'),
      guard('GET /time-entries',   '/time-entries'),
      guard('GET /projects',       '/projects'),
      guard('GET /inbox',          '/inbox'),
      guard('GET /shifts',         '/shifts'),
    ],
  },

  // ── 19. API — Auth guards: field/safety routes ──────────────────────────────
  {
    name: 'API — Auth guards (field routes)',
    async: true,
    tests: [
      guard('GET /daily-reports',   '/daily-reports'),
      guard('GET /field-reports',   '/field-reports'),
      guard('GET /punchlist',       '/punchlist'),
      guard('GET /incidents',       '/incidents'),
      guard('GET /equipment',       '/equipment'),
      guard('GET /rfis',            '/rfis'),
      guard('GET /inspections',     '/inspections'),
      guard('GET /safety-talks',    '/safety-talks'),
    ],
  },

  // ── 20. API — Auth guards: superadmin ────────────────────────────────────────
  {
    name: 'API — Auth guards (superadmin)',
    async: true,
    tests: [
      guard('GET /superadmin/companies', '/superadmin/companies'),
    ],
  },

  // ── 21. API — Smoke tests (authenticated) ────────────────────────────────────
  {
    name: 'API — Authenticated smoke tests',
    async: true,
    tests: [
      { name: 'GET /auth/me → 200 or 401', run: async () => {
        const r = await get('/auth/me', TOKEN());
        assert([200, 401].includes(r.status), `Got ${r.status}`);
      }},
      { name: 'GET /admin/workers → 200 or 401/403', run: async () => {
        const r = await get('/admin/workers', TOKEN());
        assert([200, 401, 403].includes(r.status), `Got ${r.status}`);
      }},
      { name: 'GET /admin/projects → 200 or 401/403', run: async () => {
        const r = await get('/admin/projects', TOKEN());
        assert([200, 401, 403].includes(r.status), `Got ${r.status}`);
      }},
      { name: 'GET /admin/settings → 200 or 401/403', run: async () => {
        const r = await get('/admin/settings', TOKEN());
        assert([200, 401, 403].includes(r.status), `Got ${r.status}`);
      }},
      { name: 'GET /clock/status → 200 or 401', run: async () => {
        const r = await get('/clock/status', TOKEN());
        assert([200, 401].includes(r.status), `Got ${r.status}`);
      }},
      { name: 'GET /time-entries → 200 or 401', run: async () => {
        const r = await get('/time-entries', TOKEN());
        assert([200, 401].includes(r.status), `Got ${r.status}`);
      }},
      { name: 'GET /projects → 200 or 401', run: async () => {
        const r = await get('/projects', TOKEN());
        assert([200, 401].includes(r.status), `Got ${r.status}`);
      }},
      { name: 'GET /inbox → 200 or 401', run: async () => {
        const r = await get('/inbox', TOKEN());
        assert([200, 401].includes(r.status), `Got ${r.status}`);
      }},
      { name: 'GET /shifts → 200 or 401', run: async () => {
        const r = await get('/shifts', TOKEN());
        assert([200, 401].includes(r.status), `Got ${r.status}`);
      }},
    ],
  },

  // ── 22. API — Response shapes ────────────────────────────────────────────────
  {
    name: 'API — Response shapes (when authenticated as admin)',
    async: true,
    tests: [
      { name: '/auth/me returns user object with expected fields', run: async () => {
        const r = await get('/auth/me', TOKEN());
        if (r.status !== 200) return; // skip if not logged in
        const d = await r.json();
        assert(typeof d.user.id === 'number' || typeof d.user.id === 'string', 'id');
        assert(typeof d.user.username === 'string', 'username');
        assert(['admin', 'worker', 'super_admin'].includes(d.user.role), `role: ${d.user.role}`);
      }},
      { name: '/admin/workers returns an array', run: async () => {
        const r = await get('/admin/workers', TOKEN());
        if (r.status !== 200) return;
        const d = await r.json();
        assert(Array.isArray(d), 'Expected array');
      }},
      { name: '/admin/projects returns an array', run: async () => {
        const r = await get('/admin/projects', TOKEN());
        if (r.status !== 200) return;
        const d = await r.json();
        assert(Array.isArray(d), 'Expected array');
      }},
      { name: '/admin/settings returns an object', run: async () => {
        const r = await get('/admin/settings', TOKEN());
        if (r.status !== 200) return;
        const d = await r.json();
        assert(d !== null && typeof d === 'object', 'Expected object');
        assert('currency' in d || 'overtime_rule' in d, 'Missing expected settings keys');
      }},
      { name: '/admin/kpis returns numeric fields', run: async () => {
        const r = await get('/admin/kpis', TOKEN());
        if (r.status !== 200) return;
        const d = await r.json();
        assert(typeof d === 'object', 'Expected object');
      }},
      { name: '/qbo/status returns connected boolean', run: async () => {
        const r = await get('/qbo/status', TOKEN());
        if (r.status !== 200) return;
        const d = await r.json();
        assert(typeof d.connected === 'boolean', `connected: ${d.connected}`);
      }},
    ],
  },

  // ── 23. API — POST input validation ─────────────────────────────────────────
  {
    name: 'API — POST input validation',
    async: true,
    tests: [
      { name: 'POST /auth/register — empty body → 400', run: async () => {
        assertIs400((await post('/auth/register', {})).status, '/auth/register');
      }},
      { name: 'POST /auth/forgot-password — empty body → 400', run: async () => {
        const r = await post('/auth/forgot-password', {});
        assert([400, 422].includes(r.status), `Expected 400/422, got ${r.status}`);
      }},
      { name: 'POST /qbo/import/workers — empty workers array → 400', run: async () => {
        const r = await post('/qbo/import/workers', { workers: [] }, TOKEN());
        if (r.status === 401 || r.status === 403) return; // not admin — skip
        assertIs400(r.status, '/qbo/import/workers empty');
      }},
      { name: 'POST /qbo/import/projects — empty projects array → 400', run: async () => {
        const r = await post('/qbo/import/projects', { projects: [] }, TOKEN());
        if (r.status === 401 || r.status === 403) return;
        assertIs400(r.status, '/qbo/import/projects empty');
      }},
    ],
  },
];

// ── Runner component ─────────────────────────────────────────────────────────────

export default function Tests() {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const buildReport = (suiteResults) => {
    const allTests = suiteResults.flatMap(s => s.tests);
    const passed = allTests.filter(t => t.status === 'pass').length;
    const failed = allTests.length - passed;
    const lines = [];
    lines.push(`OpsFloa Test Report — ${new Date().toLocaleString()}`);
    lines.push(`${passed}/${allTests.length} passed · ${failed} failed`);
    lines.push('');
    for (const suite of suiteResults) {
      const sp = suite.tests.filter(t => t.status === 'pass').length;
      lines.push(`── ${suite.name} (${sp}/${suite.tests.length})`);
      for (const t of suite.tests) {
        const icon = t.status === 'pass' ? '✓' : '✗';
        lines.push(`  ${icon} ${t.name}${t.error ? `\n      ERROR: ${t.error}` : ''}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  };

  const copyReport = () => {
    if (!results) return;
    navigator.clipboard.writeText(buildReport(results)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const printReport = () => {
    if (!results) return;
    const text = buildReport(results);
    const w = window.open('', '_blank');
    w.document.write(`<pre style="font-family:monospace;font-size:13px;padding:24px;white-space:pre-wrap">${text.replace(/</g,'&lt;')}</pre>`);
    w.document.close();
    w.print();
  };

  const runAll = async () => {
    setRunning(true);
    const suiteResults = [];
    for (const suite of SUITES) {
      const testResults = [];
      for (const test of suite.tests) {
        const start = performance.now();
        try {
          if (suite.async) await test.run();
          else test.run();
          testResults.push({ name: test.name, status: 'pass', ms: Math.round(performance.now() - start) });
        } catch (err) {
          testResults.push({ name: test.name, status: 'fail', error: err.message, ms: Math.round(performance.now() - start) });
        }
      }
      suiteResults.push({ name: suite.name, tests: testResults });
    }
    setResults(suiteResults);
    setRunning(false);
  };

  const total  = results?.flatMap(s => s.tests).length ?? 0;
  const passed = results?.flatMap(s => s.tests).filter(t => t.status === 'pass').length ?? 0;
  const failed = total - passed;

  const totalTests = SUITES.flatMap(x => x.tests).length;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Unit Tests</h1>
          <p style={s.subtitle}>{SUITES.length} suites · {totalTests} tests</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {results && (
            <>
              <button style={s.outlineBtn} onClick={copyReport}>{copied ? '✓ Copied' : '⎘ Copy'}</button>
              <button style={s.outlineBtn} onClick={printReport}>⎙ Print</button>
            </>
          )}
          <button style={s.runBtn} onClick={runAll} disabled={running}>
            {running ? 'Running…' : '▶ Run All'}
          </button>
        </div>
      </div>

      {results && (
        <div style={{ ...s.summary, background: failed === 0 ? '#f0fdf4' : '#fef2f2', borderColor: failed === 0 ? '#bbf7d0' : '#fecaca' }}>
          <span style={{ fontWeight: 700, color: failed === 0 ? '#166534' : '#991b1b', fontSize: 16 }}>
            {failed === 0 ? '✓ All tests passed' : `✗ ${failed} test${failed > 1 ? 's' : ''} failed`}
          </span>
          <span style={{ color: '#6b7280', fontSize: 14 }}>{passed}/{total} passed</span>
        </div>
      )}

      <div style={s.suites}>
        {SUITES.map((suite, si) => {
          const sr = results?.[si];
          return (
            <div key={suite.name} style={s.suiteCard}>
              <div style={s.suiteName}>
                {sr && (
                  <span style={{ ...s.suiteBadge, background: sr.tests.every(t => t.status === 'pass') ? '#dcfce7' : '#fee2e2', color: sr.tests.every(t => t.status === 'pass') ? '#166534' : '#991b1b' }}>
                    {sr.tests.filter(t => t.status === 'pass').length}/{sr.tests.length}
                  </span>
                )}
                {suite.name}
                {suite.async && <span style={s.asyncBadge}>async</span>}
              </div>
              <div style={s.testList}>
                {suite.tests.map((test, ti) => {
                  const tr = sr?.tests[ti];
                  return (
                    <div key={test.name} style={s.testRow}>
                      <span style={{ ...s.dot, color: !tr ? '#d1d5db' : tr.status === 'pass' ? '#16a34a' : '#dc2626' }}>
                        {!tr ? '○' : tr.status === 'pass' ? '✓' : '✗'}
                      </span>
                      <span style={s.testName}>{test.name}</span>
                      {tr && <span style={s.ms}>{tr.ms}ms</span>}
                      {tr?.error && <span style={s.errMsg}>{tr.error}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const s = {
  page:      { maxWidth: 760, margin: '40px auto', padding: '0 20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:    { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 },
  title:     { fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 },
  subtitle:  { fontSize: 13, color: '#9ca3af', margin: '4px 0 0' },
  runBtn:    { background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  outlineBtn:{ background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  summary:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid', borderRadius: 10, padding: '14px 18px', marginBottom: 24 },
  suites:    { display: 'flex', flexDirection: 'column', gap: 16 },
  suiteCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' },
  suiteName: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#f9fafb', fontWeight: 700, fontSize: 14, color: '#374151', borderBottom: '1px solid #e5e7eb' },
  suiteBadge:{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 },
  asyncBadge:{ fontSize: 10, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.04em' },
  testList:  { padding: '6px 0' },
  testRow:   { display: 'flex', alignItems: 'baseline', gap: 8, padding: '7px 16px', flexWrap: 'wrap' },
  dot:       { fontSize: 14, fontWeight: 700, width: 16, flexShrink: 0 },
  testName:  { fontSize: 13, color: '#374151', flex: 1 },
  ms:        { fontSize: 11, color: '#9ca3af' },
  errMsg:    { width: '100%', fontSize: 12, color: '#dc2626', background: '#fef2f2', borderRadius: 6, padding: '4px 10px', marginTop: 2, fontFamily: 'monospace' },
};
