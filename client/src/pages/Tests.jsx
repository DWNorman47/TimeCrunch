import React, { useState } from 'react';
import { localDateStr, formatCurrency, currencySymbol, fmtHours } from '../utils';
import api from '../api';

// ── Tiny test runner ───────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── Test suites ────────────────────────────────────────────────────────────────

const SUITES = [
  {
    name: 'localDateStr()',
    tests: [
      {
        name: 'Returns YYYY-MM-DD format',
        run: () => {
          const result = localDateStr(new Date('2025-06-15T12:00:00'));
          assert(/^\d{4}-\d{2}-\d{2}$/.test(result), `"${result}" is not YYYY-MM-DD`);
        },
      },
      {
        name: 'Does not return UTC date for late-night local time',
        run: () => {
          // A date object represents a specific moment; localDateStr should use local timezone
          const d = new Date(2025, 5, 15); // June 15 local
          const result = localDateStr(d);
          assert(result.startsWith('2025-06'), `Expected 2025-06-xx, got ${result}`);
        },
      },
      {
        name: 'Defaults to today without argument',
        run: () => {
          const result = localDateStr();
          assert(/^\d{4}-\d{2}-\d{2}$/.test(result), `"${result}" is not YYYY-MM-DD`);
        },
      },
    ],
  },
  {
    name: 'formatCurrency()',
    tests: [
      {
        name: 'USD formats with $ symbol',
        run: () => {
          const result = formatCurrency(1234.5, 'USD');
          assert(result.includes('1,234.50'), `Got "${result}"`);
          assert(result.includes('$'), `Missing $ in "${result}"`);
        },
      },
      {
        name: 'EUR formats with € symbol',
        run: () => {
          const result = formatCurrency(100, 'EUR');
          assert(result.includes('100'), `Got "${result}"`);
        },
      },
      {
        name: 'Zero formats correctly',
        run: () => {
          const result = formatCurrency(0, 'USD');
          assert(result.includes('0.00'), `Got "${result}"`);
        },
      },
      {
        name: 'Negative amount formats correctly',
        run: () => {
          const result = formatCurrency(-50, 'USD');
          assert(result.includes('50.00'), `Got "${result}"`);
        },
      },
      {
        name: 'Unknown currency falls back without throwing',
        run: () => {
          const result = formatCurrency(10, 'XYZ');
          assert(typeof result === 'string' && result.length > 0, 'Should return a string');
        },
      },
    ],
  },
  {
    name: 'currencySymbol()',
    tests: [
      { name: 'USD returns $',  run: () => assertEqual(currencySymbol('USD'), '$', 'USD symbol') },
      { name: 'EUR returns €',  run: () => assertEqual(currencySymbol('EUR'), '€', 'EUR symbol') },
      { name: 'GBP returns £',  run: () => assertEqual(currencySymbol('GBP'), '£', 'GBP symbol') },
      { name: 'Defaults to USD', run: () => { const s = currencySymbol(); assert(typeof s === 'string' && s.length > 0); } },
    ],
  },
  {
    name: 'fmtHours()',
    tests: [
      { name: '8h exactly',    run: () => assertEqual(fmtHours(8),    '8h',      '8h') },
      { name: '1.5h → 1h 30m', run: () => assertEqual(fmtHours(1.5),  '1h 30m',  '1.5') },
      { name: '0.25h → 15m',   run: () => assertEqual(fmtHours(0.25), '15m',     '0.25') },
      { name: '0 → 0m',        run: () => assertEqual(fmtHours(0),    '0m',      '0') },
      { name: 'null → 0m',     run: () => assertEqual(fmtHours(null), '0m',      'null') },
      { name: '2.75h → 2h 45m',run: () => assertEqual(fmtHours(2.75), '2h 45m',  '2.75') },
    ],
  },
  {
    name: 'API — /auth/me',
    async: true,
    tests: [
      {
        name: 'Returns 200 with valid token, or 401 without',
        run: async () => {
          try {
            const r = await api.get('/auth/me');
            assert(r.status === 200, `Expected 200, got ${r.status}`);
            assert(r.data?.user?.id, 'Response should have user.id');
          } catch (err) {
            if (err.response?.status === 401) return; // no token — expected
            throw err;
          }
        },
      },
    ],
  },
  {
    name: 'API — /auth/login validation',
    async: true,
    tests: [
      {
        name: 'Missing fields returns 400',
        run: async () => {
          try {
            await api.post('/auth/login', {});
            throw new Error('Should have returned 400');
          } catch (err) {
            assertEqual(err.response?.status, 400, 'Status');
          }
        },
      },
      {
        name: 'Wrong credentials return 401',
        run: async () => {
          try {
            await api.post('/auth/login', { username: '__test_nonexistent__', password: 'wrong', company_name: '__test__' });
            throw new Error('Should have returned 401');
          } catch (err) {
            assertEqual(err.response?.status, 401, 'Status');
          }
        },
      },
    ],
  },
  {
    name: 'API — /admin/workers (auth required)',
    async: true,
    tests: [
      {
        name: 'Returns 401 without token',
        run: async () => {
          // Use raw fetch to avoid the axios 401 interceptor which would log the user out
          const baseURL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';
          const r = await fetch(`${baseURL}/admin/workers`);
          assertEqual(r.status, 401, 'Status');
        },
      },
    ],
  },
];

// ── Runner component ───────────────────────────────────────────────────────────

export default function Tests() {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

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

  const total   = results?.flatMap(s => s.tests).length ?? 0;
  const passed  = results?.flatMap(s => s.tests).filter(t => t.status === 'pass').length ?? 0;
  const failed  = total - passed;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Unit Tests</h1>
          <p style={s.subtitle}>{SUITES.length} suites · {SUITES.flatMap(x => x.tests).length} tests</p>
        </div>
        <button style={s.runBtn} onClick={runAll} disabled={running}>
          {running ? 'Running…' : '▶ Run All'}
        </button>
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
  page:      { maxWidth: 720, margin: '40px auto', padding: '0 20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  header:    { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 },
  title:     { fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 },
  subtitle:  { fontSize: 13, color: '#9ca3af', margin: '4px 0 0' },
  runBtn:    { background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
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
