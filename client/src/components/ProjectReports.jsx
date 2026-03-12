import React, { useState, useEffect } from 'react';
import api from '../api';

export default function ProjectReports() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/projects/metrics')
      .then(r => setProjects(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading...</p>;

  if (projects.length === 0) {
    return <p style={{ color: '#666' }}>No projects yet. Add one in the Manage tab.</p>;
  }

  return (
    <div style={styles.list}>
      {projects.map(p => (
        <div key={p.id} style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={styles.name}>{p.name}</span>
            <span style={styles.sub}>{p.worker_count} worker{p.worker_count !== 1 ? 's' : ''} · {p.total_entries} entr{p.total_entries !== 1 ? 'ies' : 'y'}</span>
          </div>
          <div style={styles.metrics}>
            <Metric label="Total" value={`${parseFloat(p.total_hours).toFixed(2)}h`} />
            {parseFloat(p.regular_hours) > 0 && <Metric label="Regular" value={`${parseFloat(p.regular_hours).toFixed(2)}h`} color="#2563eb" />}
            {parseFloat(p.overtime_hours) > 0 && <Metric label="Overtime" value={`${parseFloat(p.overtime_hours).toFixed(2)}h`} color="#dc2626" />}
            {parseFloat(p.prevailing_hours) > 0 && <Metric label="Prevailing" value={`${parseFloat(p.prevailing_hours).toFixed(2)}h`} color="#d97706" />}
          </div>
          <div style={styles.barContainer}>
            <HoursBar regular={parseFloat(p.regular_hours)} overtime={parseFloat(p.overtime_hours)} prevailing={parseFloat(p.prevailing_hours)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value, color }) {
  return (
    <div style={styles.metric}>
      <span style={{ ...styles.metricVal, color: color || '#222' }}>{value}</span>
      <span style={styles.metricLabel}>{label}</span>
    </div>
  );
}

function HoursBar({ regular, overtime, prevailing }) {
  const total = regular + overtime + prevailing;
  if (total === 0) return null;
  const pct = v => `${((v / total) * 100).toFixed(1)}%`;
  return (
    <div style={styles.bar}>
      {regular > 0 && <div style={{ ...styles.barSegment, width: pct(regular), background: '#2563eb' }} title={`Regular: ${regular.toFixed(2)}h`} />}
      {overtime > 0 && <div style={{ ...styles.barSegment, width: pct(overtime), background: '#dc2626' }} title={`Overtime: ${overtime.toFixed(2)}h`} />}
      {prevailing > 0 && <div style={{ ...styles.barSegment, width: pct(prevailing), background: '#d97706' }} title={`Prevailing: ${prevailing.toFixed(2)}h`} />}
    </div>
  );
}

const styles = {
  list: { display: 'flex', flexDirection: 'column', gap: 16 },
  card: { background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 },
  name: { fontWeight: 700, fontSize: 17 },
  sub: { color: '#888', fontSize: 13 },
  metrics: { display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 },
  metric: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60 },
  metricVal: { fontWeight: 700, fontSize: 20 },
  metricLabel: { fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 },
  barContainer: { marginTop: 4 },
  bar: { display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#f0f0f0' },
  barSegment: { height: '100%', transition: 'width 0.3s' },
};
