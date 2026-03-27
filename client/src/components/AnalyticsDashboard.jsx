import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line,
} from 'recharts';
import api from '../api';
import { useT } from '../hooks/useT';

const BLUE = '#1a56db';
const GREEN = '#059669';
const ORANGE = '#d97706';

function StatCard({ label, value, sub, color }) {
  return (
    <div style={styles.statCard}>
      <div style={{ ...styles.statValue, color: color || '#111827' }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
      {sub && <div style={styles.statSub}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }) {
  return <h3 style={styles.sectionTitle}>{children}</h3>;
}

function HorizontalBars({ data, color, noDataLabel }) {
  if (!data || data.length === 0) return <p style={styles.empty}>{noDataLabel}</p>;
  const max = Math.max(...data.map(d => d.hours));
  return (
    <div style={styles.hBarList}>
      {data.map((d, i) => (
        <div key={i} style={styles.hBarRow}>
          <div style={styles.hBarLabel} title={d.name}>{d.name}</div>
          <div style={styles.hBarTrack}>
            <div style={{ ...styles.hBarFill, width: `${(d.hours / max) * 100}%`, background: color }} />
          </div>
          <div style={styles.hBarValue}>{d.hours}h</div>
        </div>
      ))}
    </div>
  );
}

function formatDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AnalyticsDashboard() {
  const t = useT();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/analytics')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: '#888' }}>{t.loadingAnalytics}</p>;
  if (!data) return <p style={{ color: '#e53e3e' }}>{t.failedLoadAnalytics}</p>;

  const { summary, daily_hours, weekly_hours, project_hours, worker_hours } = data;

  // Fill in any missing weeks in the last 12
  const weeklyMap = Object.fromEntries((weekly_hours || []).map(d => [d.week_start, parseFloat(d.hours)]));
  const weeklyFilled = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() - i * 7); // Monday of each week
    const key = d.toLocaleDateString('en-CA');
    weeklyFilled.push({ week_start: key, hours: weeklyMap[key] || 0 });
  }

  // Fill in any missing days in the last 14
  const dailyMap = Object.fromEntries(daily_hours.map(d => [d.date, parseFloat(d.hours)]));
  const dailyFilled = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('en-CA');
    dailyFilled.push({ date: key, hours: dailyMap[key] || 0 });
  }

  return (
    <div style={styles.wrap}>
      {/* Summary cards */}
      <div style={styles.statRow}>
        <StatCard
          label={t.hoursThisWeek}
          value={`${summary.hours_this_week}h`}
          sub={`${summary.active_workers_this_week} ${t.workersActive}`}
          color={BLUE}
        />
        <StatCard
          label={t.hoursThisMonth}
          value={`${summary.hours_this_month}h`}
          sub={`${summary.active_workers_this_month} ${t.workersActive}`}
          color={GREEN}
        />
        <StatCard
          label={t.pendingApprovalsAnalytics}
          value={summary.pending_approvals}
          sub={summary.pending_approvals > 0 ? t.needsReview : t.allCaughtUpAnalytics}
          color={summary.pending_approvals > 0 ? ORANGE : GREEN}
        />
      </div>

      {/* Daily hours bar chart */}
      <div style={styles.card}>
        <SectionTitle>{t.dailyHoursChart}</SectionTitle>
        {dailyFilled.every(d => d.hours === 0) ? (
          <p style={styles.empty}>{t.noEntries14Days}</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyFilled} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <XAxis
                dataKey="date"
                tickFormatter={formatDay}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                interval={1}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                formatter={v => [`${v}h`, t.chartHoursLabel]}
                labelFormatter={formatDay}
                contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' }}
              />
              <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                {dailyFilled.map((d, i) => (
                  <Cell key={i} fill={d.hours > 0 ? BLUE : '#e5e7eb'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Weekly hours trend */}
      <div style={styles.card}>
        <SectionTitle>{t.weeklyHoursChart}</SectionTitle>
        {weeklyFilled.every(d => d.hours === 0) ? (
          <p style={styles.empty}>{t.noEntries12Weeks}</p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={weeklyFilled} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <XAxis
                dataKey="week_start"
                tickFormatter={formatWeek}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                interval={1}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                formatter={v => [`${v}h`, t.chartHoursLabel]}
                labelFormatter={d => `Week of ${formatWeek(d)}`}
                contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e5e7eb' }}
              />
              <Line
                type="monotone"
                dataKey="hours"
                stroke={BLUE}
                strokeWidth={2}
                dot={{ fill: BLUE, r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Project and worker breakdown */}
      <div style={styles.twoCol}>
        <div style={styles.card}>
          <SectionTitle>{t.hoursByProject}</SectionTitle>
          <HorizontalBars data={project_hours} color={BLUE} noDataLabel={t.noDataYet} />
        </div>
        <div style={styles.card}>
          <SectionTitle>{t.hoursByWorker}</SectionTitle>
          <HorizontalBars data={worker_hours} color={GREEN} noDataLabel={t.noDataYet} />
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 20 },
  statRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 },
  statCard: { background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  statValue: { fontSize: 32, fontWeight: 800, lineHeight: 1, marginBottom: 6 },
  statLabel: { fontSize: 13, fontWeight: 600, color: '#374151' },
  statSub: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  card: { background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 16, margin: '0 0 16px' },
  empty: { color: '#9ca3af', fontSize: 13 },
  hBarList: { display: 'flex', flexDirection: 'column', gap: 10 },
  hBarRow: { display: 'flex', alignItems: 'center', gap: 10 },
  hBarLabel: { width: 120, fontSize: 13, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 },
  hBarTrack: { flex: 1, height: 10, background: '#f3f4f6', borderRadius: 5, overflow: 'hidden' },
  hBarFill: { height: '100%', borderRadius: 5, transition: 'width 0.4s ease' },
  hBarValue: { width: 40, fontSize: 12, color: '#6b7280', textAlign: 'right', flexShrink: 0 },
};
