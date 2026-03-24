import React, { useState, useMemo } from 'react';
import { fmtHours, formatCurrency } from '../utils';

const RANGES = [
  { label: 'This week', key: 'this_week' },
  { label: 'Last week', key: 'last_week' },
  { label: 'This month', key: 'this_month' },
  { label: 'Last 30 days', key: 'last_30' },
  { label: 'All time', key: 'all' },
];

function getDateRange(key) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (key === 'all') return { from: null, to: null };
  if (key === 'last_30') {
    const from = new Date(today); from.setDate(from.getDate() - 29);
    return { from, to: today };
  }
  if (key === 'this_month') {
    return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
  }
  if (key === 'this_week') {
    const day = today.getDay(); // 0=Sun
    const from = new Date(today); from.setDate(from.getDate() - ((day + 6) % 7));
    return { from, to: today };
  }
  if (key === 'last_week') {
    const day = today.getDay();
    const startOfThisWeek = new Date(today); startOfThisWeek.setDate(startOfThisWeek.getDate() - ((day + 6) % 7));
    const from = new Date(startOfThisWeek); from.setDate(from.getDate() - 7);
    const to = new Date(startOfThisWeek); to.setDate(to.getDate() - 1);
    return { from, to };
  }
  return { from: null, to: null };
}

function entryHours(e) {
  const s = new Date(`1970-01-01T${e.start_time}`);
  const en = new Date(`1970-01-01T${e.end_time}`);
  return (en - s) / 3600000 - (e.break_minutes || 0) / 60;
}

function computeOT(entries, rule, threshold) {
  const regular = entries.filter(e => e.wage_type === 'regular');
  if (rule === 'weekly') {
    const weekly = {};
    regular.forEach(e => {
      const d = new Date(e.work_date.substring(0, 10) + 'T00:00:00');
      const jan4 = new Date(d.getFullYear(), 0, 4);
      const week = Math.ceil(((d - jan4) / 86400000 + jan4.getDay() + 1) / 7);
      const key = `${d.getFullYear()}-W${week}`;
      weekly[key] = (weekly[key] || 0) + entryHours(e);
    });
    return {
      regularHours: Object.values(weekly).reduce((s, h) => s + Math.min(h, threshold), 0),
      overtimeHours: Object.values(weekly).reduce((s, h) => s + Math.max(h - threshold, 0), 0),
    };
  }
  const daily = {};
  regular.forEach(e => { daily[e.work_date.substring(0, 10)] = (daily[e.work_date.substring(0, 10)] || 0) + entryHours(e); });
  return {
    regularHours: Object.values(daily).reduce((s, h) => s + Math.min(h, threshold), 0),
    overtimeHours: Object.values(daily).reduce((s, h) => s + Math.max(h - threshold, 0), 0),
  };
}

export default function WorkerSummary({ entries, hourlyRate, rateType = 'hourly', overtimeMultiplier = 1.5, prevailingRate = 45, overtimeRule = 'daily', overtimeThreshold = 8, showWages = false, currency = 'USD' }) {
  const [range, setRange] = useState('this_week');
  const { from, to } = getDateRange(range);

  const filtered = useMemo(() => {
    return entries.filter(e => {
      const d = new Date(e.work_date.substring(0, 10) + 'T00:00:00');
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [entries, from, to]);

  const totalHours = filtered.reduce((sum, e) => sum + entryHours(e), 0);
  const { regularHours, overtimeHours } = computeOT(filtered, overtimeRule, overtimeThreshold);
  const prevailingHours = filtered.filter(e => e.wage_type === 'prevailing').reduce((s, e) => s + entryHours(e), 0);

  const rate = parseFloat(hourlyRate) || 30;
  let estimatedPay;
  if (rateType === 'daily') {
    const regularDays = new Set(filtered.filter(e => e.wage_type === 'regular').map(e => e.work_date.toString().substring(0, 10))).size;
    const otCost = overtimeHours * (rate / overtimeThreshold) * overtimeMultiplier;
    estimatedPay = (regularDays * rate) + otCost + (prevailingHours * prevailingRate);
  } else {
    estimatedPay = (regularHours * rate) + (overtimeHours * rate * overtimeMultiplier) + (prevailingHours * prevailingRate);
  }

  const byProject = {};
  filtered.forEach(e => {
    const name = e.project_name || 'Unknown';
    byProject[name] = (byProject[name] || 0) + entryHours(e);
  });

  return (
    <div style={styles.card} className="mobile-card">
      <div style={styles.header}>
        <h2 style={styles.heading}>My Summary</h2>
        <div style={styles.rangeTabs} className="range-tabs">
          {RANGES.map(r => (
            <button
              key={r.key}
              style={range === r.key ? styles.rangeActive : styles.rangeBtn}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p style={styles.empty}>No entries for this period.</p>
      ) : (
        <>
          <div style={styles.statsGrid} className="stats-grid">
            <div style={styles.stat}>
              <div style={styles.statValue}>{fmtHours(totalHours)}</div>
              <div style={styles.statLabel}>Total hours</div>
            </div>
            <div style={styles.stat}>
              <div style={styles.statValue}>{fmtHours(regularHours)}</div>
              <div style={styles.statLabel}>Regular</div>
            </div>
            {overtimeHours > 0 && (
              <div style={{ ...styles.stat, borderColor: '#fbbf24' }}>
                <div style={{ ...styles.statValue, color: '#d97706' }}>{fmtHours(overtimeHours)}</div>
                <div style={styles.statLabel}>Overtime</div>
              </div>
            )}
            {prevailingHours > 0 && (
              <div style={{ ...styles.stat, borderColor: '#a78bfa' }}>
                <div style={{ ...styles.statValue, color: '#7c3aed' }}>{fmtHours(prevailingHours)}</div>
                <div style={styles.statLabel}>Prevailing</div>
              </div>
            )}
            {showWages && (
              <div style={{ ...styles.stat, borderColor: '#6ee7b7' }}>
                <div style={{ ...styles.statValue, color: '#059669' }}>{formatCurrency(estimatedPay, currency)}</div>
                <div style={styles.statLabel}>Est. earnings</div>
              </div>
            )}
          </div>

          {Object.keys(byProject).length > 1 && (
            <div style={styles.projectBreakdown}>
              <div style={styles.breakdownTitle}>By project</div>
              {Object.entries(byProject).sort((a, b) => b[1] - a[1]).map(([name, hours]) => (
                <div key={name} style={styles.projectRow}>
                  <span style={styles.projectName}>{name}</span>
                  <div style={styles.barWrap}>
                    <div style={{ ...styles.bar, width: `${(hours / totalHours) * 100}%` }} />
                  </div>
                  <span style={styles.projectHours}>{fmtHours(hours)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  heading: { fontSize: 18, fontWeight: 700 },
  rangeTabs: { display: 'flex', gap: 4, flexWrap: 'nowrap' },
  rangeBtn: { padding: '5px 10px', background: '#f3f4f6', border: 'none', borderRadius: 6, fontSize: 12, color: '#6b7280', cursor: 'pointer', fontWeight: 500 },
  rangeActive: { padding: '5px 10px', background: '#1a56db', border: 'none', borderRadius: 6, fontSize: 12, color: '#fff', cursor: 'pointer', fontWeight: 700 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12, marginBottom: 20 },
  stat: { background: '#f9fafb', borderRadius: 10, padding: '14px 16px', border: '2px solid #e5e7eb' },
  statValue: { fontSize: 22, fontWeight: 800, color: '#1a1a1a', marginBottom: 2 },
  statLabel: { fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' },
  empty: { color: '#888', fontSize: 14 },
  projectBreakdown: { borderTop: '1px solid #f0f0f0', paddingTop: 16 },
  breakdownTitle: { fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 10 },
  projectRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  projectName: { fontSize: 13, fontWeight: 600, minWidth: 100, flex: 1 },
  barWrap: { flex: 2, height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' },
  bar: { height: '100%', background: '#1a56db', borderRadius: 4, transition: 'width 0.3s ease' },
  projectHours: { fontSize: 13, color: '#555', minWidth: 36, textAlign: 'right' },
};
