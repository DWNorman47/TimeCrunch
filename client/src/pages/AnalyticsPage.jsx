import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import AppSwitcher from '../components/AppSwitcher';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

function delta(current, prev) {
  const c = parseFloat(current || 0);
  const p = parseFloat(prev || 0);
  if (p === 0) return null;
  const pct = ((c - p) / p) * 100;
  return pct;
}

function DeltaBadge({ pct, invert = false }) {
  if (pct === null) return null;
  const positive = invert ? pct < 0 : pct >= 0;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700,
      color: positive ? '#059669' : '#ef4444',
      background: positive ? '#d1fae5' : '#fee2e2',
      padding: '2px 7px', borderRadius: 10, marginLeft: 6,
    }}>
      {pct >= 0 ? '+' : ''}{pct.toFixed(0)}% vs last month
    </span>
  );
}

function SummaryCard({ label, value, subLabel, deltaPct, invert }) {
  return (
    <div style={styles.summaryCard}>
      <div style={styles.summaryValue}>{value}</div>
      <div style={styles.summaryLabel}>
        {label}
        {deltaPct !== undefined && <DeltaBadge pct={deltaPct} invert={invert} />}
      </div>
      {subLabel && <div style={styles.summarySub}>{subLabel}</div>}
    </div>
  );
}

function HorizBar({ label, value, max, workers }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={styles.horizRow}>
      <div style={styles.horizLabel} title={label}>{label}</div>
      <div style={styles.horizTrack}>
        <div style={{ ...styles.horizFill, width: `${pct}%` }} />
      </div>
      <div style={styles.horizValue}>{value}h</div>
    </div>
  );
}

const STATUS_COLORS = {
  planning: '#1d4ed8',
  in_progress: '#059669',
  on_hold: '#d97706',
  completed: '#6b7280',
};
const STATUS_LABELS = {
  planning: 'Planning',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
};

export default function AnalyticsPage() {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState({});

  useEffect(() => {
    Promise.all([
      api.get('/admin/analytics'),
      api.get('/settings'),
    ]).then(([aRes, sRes]) => {
      setData(aRes.data);
      setFeatures(sRes.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const monthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;

  const s = data?.summary || {};
  const hoursDelta = delta(s.month_hours, s.prev_month_hours);
  const workersDelta = delta(s.month_workers, s.prev_month_workers);

  const byProject = data?.by_project || [];
  const topWorkers = data?.top_workers || [];
  const weekly = data?.weekly || [];
  const statuses = data?.project_statuses || [];

  const maxProjectHours = byProject.length > 0 ? parseFloat(byProject[0].hours) : 1;
  const maxWorkerHours = topWorkers.length > 0 ? parseFloat(topWorkers[0].hours) : 1;

  const weeklyMax = weekly.reduce((m, w) => Math.max(m, parseFloat(w.hours)), 0);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logoGroup}>
          <AppSwitcher currentApp="analytics" userRole={user?.role} features={features} />
          {user?.company_name && <span style={styles.companyName}>{user.company_name}</span>}
        </div>
        <button style={styles.headerBtn} onClick={logout}>Logout</button>
      </header>

      <main style={styles.main}>
        <div style={styles.pageHeader}>
          <h1 style={styles.pageTitle}>Analytics</h1>
          <p style={styles.pageSub}>{monthLabel} · approved time entries</p>
        </div>

        {loading ? (
          <p style={styles.loadingText}>Loading…</p>
        ) : (
          <>
            {/* Summary cards */}
            <div style={styles.summaryRow}>
              <SummaryCard
                label="Hours this month"
                value={`${parseFloat(s.month_hours || 0).toFixed(1)}h`}
                deltaPct={hoursDelta}
              />
              <SummaryCard
                label="Active workers"
                value={parseInt(s.month_workers || 0)}
                deltaPct={workersDelta}
              />
              <SummaryCard
                label="Projects with activity"
                value={parseInt(s.month_projects || 0)}
              />
              <SummaryCard
                label="Time entries"
                value={parseInt(s.month_entries || 0)}
              />
            </div>

            {/* Weekly trend */}
            {weekly.length > 0 && (
              <div style={styles.card}>
                <div style={styles.cardTitle}>Weekly Hours (last 8 weeks)</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={weekly} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="week_start" tickFormatter={fmtWeek} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(v) => [`${v}h`, 'Hours']}
                      labelFormatter={fmtWeek}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    />
                    <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                      {weekly.map((_, i) => (
                        <Cell key={i} fill={i === weekly.length - 1 ? '#0891b2' : '#bae6fd'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div style={styles.twoCol}>
              {/* Hours by project */}
              <div style={styles.card}>
                <div style={styles.cardTitle}>Hours by Project — {monthLabel}</div>
                {byProject.length === 0 ? (
                  <p style={styles.emptyText}>No approved entries with a project this month.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                    {byProject.map((p, i) => (
                      <HorizBar
                        key={i}
                        label={p.project_name}
                        value={parseFloat(p.hours)}
                        max={maxProjectHours}
                        workers={p.workers}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Top workers */}
              <div style={styles.card}>
                <div style={styles.cardTitle}>Top Workers — {monthLabel}</div>
                {topWorkers.length === 0 ? (
                  <p style={styles.emptyText}>No approved entries this month.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                    {topWorkers.map((w, i) => (
                      <HorizBar
                        key={i}
                        label={w.worker_name}
                        value={parseFloat(w.hours)}
                        max={maxWorkerHours}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Project status breakdown */}
            {statuses.length > 0 && (
              <div style={styles.card}>
                <div style={styles.cardTitle}>Active Projects by Status</div>
                <div style={styles.statusRow}>
                  {statuses.map(s => (
                    <div key={s.status} style={styles.statusChip}>
                      <div style={{ ...styles.statusDot, background: STATUS_COLORS[s.status] || '#9ca3af' }} />
                      <span style={styles.statusCount}>{s.count}</span>
                      <span style={styles.statusLabel}>{STATUS_LABELS[s.status] || s.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#f4f6f9', display: 'flex', flexDirection: 'column' },
  header: { background: '#0891b2', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 },
  logoGroup: { display: 'flex', alignItems: 'center', gap: 10 },
  companyName: { fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)' },
  headerBtn: { background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  main: { flex: 1, padding: '24px 20px', maxWidth: 1100, margin: '0 auto', width: '100%' },
  pageHeader: { marginBottom: 20 },
  pageTitle: { fontSize: 28, fontWeight: 800, color: '#111827', margin: 0 },
  pageSub: { fontSize: 14, color: '#6b7280', margin: '4px 0 0' },
  loadingText: { color: '#9ca3af', fontSize: 14 },
  // Summary
  summaryRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 },
  summaryCard: { background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', borderTop: '3px solid #0891b2' },
  summaryValue: { fontSize: 32, fontWeight: 800, color: '#111827', lineHeight: 1.1 },
  summaryLabel: { fontSize: 13, color: '#6b7280', marginTop: 4, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  summarySub: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  // Cards
  card: { background: '#fff', borderRadius: 12, padding: '20px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', marginBottom: 16 },
  cardTitle: { fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginBottom: 0 },
  emptyText: { fontSize: 13, color: '#9ca3af', margin: '8px 0 0' },
  // Horizontal bars
  horizRow: { display: 'flex', alignItems: 'center', gap: 10 },
  horizLabel: { width: 130, fontSize: 13, color: '#374151', fontWeight: 500, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  horizTrack: { flex: 1, height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' },
  horizFill: { height: '100%', background: '#0891b2', borderRadius: 4, transition: 'width 0.4s' },
  horizValue: { width: 44, fontSize: 13, fontWeight: 700, color: '#111827', textAlign: 'right', flexShrink: 0 },
  // Status
  statusRow: { display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 },
  statusChip: { display: 'flex', alignItems: 'center', gap: 7, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 20, padding: '6px 14px' },
  statusDot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  statusCount: { fontSize: 20, fontWeight: 800, color: '#111827', lineHeight: 1 },
  statusLabel: { fontSize: 13, color: '#6b7280', fontWeight: 500 },
};
