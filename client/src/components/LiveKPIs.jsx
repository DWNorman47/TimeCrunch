import React, { useState, useEffect } from 'react';
import api from '../api';

export default function LiveKPIs() {
  const [kpis, setKpis] = useState(null);

  const load = () =>
    api.get('/admin/kpis').then(r => setKpis(r.data)).catch(() => {});

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  if (!kpis) return null;

  const cards = [
    { label: 'Pending Approvals', value: kpis.pending_approvals, color: kpis.pending_approvals > 0 ? '#d97706' : '#059669' },
    { label: 'Clocked In Now', value: kpis.clocked_in_count, color: '#1a56db' },
    { label: 'Hours This Week', value: kpis.company_hours_this_week, color: '#1a56db' },
    { label: 'Workers with OT', value: kpis.overtime_workers_this_week, color: kpis.overtime_workers_this_week > 0 ? '#dc2626' : '#059669' },
  ];

  return (
    <div style={styles.grid} className="kpi-grid">
      {cards.map(c => (
        <div key={c.label} style={styles.card}>
          <div style={{ ...styles.value, color: c.color }}>{c.value}</div>
          <div style={styles.label}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

const styles = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 },
  card: { background: '#fff', borderRadius: 10, padding: '14px 16px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', textAlign: 'center' },
  value: { fontSize: 28, fontWeight: 800, lineHeight: 1.1, marginBottom: 4 },
  label: { fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em' },
};
