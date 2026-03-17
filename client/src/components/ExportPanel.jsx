import React, { useState } from 'react';
import api from '../api';

function today() {
  return new Date().toISOString().substring(0, 10);
}
function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function ExportPanel({ workers, projects }) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [workerId, setWorkerId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    setError('');
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (workerId) params.set('worker_id', workerId);
      if (projectId) params.set('project_id', projectId);
      if (status) params.set('status', status);

      const r = await api.get(`/admin/export?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([r.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `timecrunch-${from}-to-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Export failed. Check your date range and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.card}>
      <h3 style={styles.title}>Export Time Entries</h3>
      <p style={styles.sub}>Download a CSV of time entries for any date range. Open in Excel, Google Sheets, or import into your payroll system.</p>

      <div style={styles.filters} className="export-filters">
        <div style={styles.filterGroup}>
          <label style={styles.label}>From</label>
          <input style={styles.input} type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div style={styles.filterGroup}>
          <label style={styles.label}>To</label>
          <input style={styles.input} type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div style={styles.filterGroup}>
          <label style={styles.label}>Worker</label>
          <select style={styles.input} value={workerId} onChange={e => setWorkerId(e.target.value)}>
            <option value="">All workers</option>
            {workers.map(w => <option key={w.id} value={w.id}>{w.full_name}</option>)}
          </select>
        </div>
        <div style={styles.filterGroup}>
          <label style={styles.label}>Project</label>
          <select style={styles.input} value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={styles.filterGroup}>
          <label style={styles.label}>Status</label>
          <select style={styles.input} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.actions}>
        <button style={styles.downloadBtn} onClick={download} disabled={loading || !from || !to}>
          {loading ? 'Preparing...' : '⬇ Download CSV'}
        </button>
        <span style={styles.hint}>Columns: Worker, Project, Date, Start, End, Break, Net Hours, Wage Type, Mileage, Status, Notes</span>
      </div>
    </div>
  );
}

const styles = {
  card: { background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 24 },
  title: { fontSize: 17, fontWeight: 700, marginBottom: 6 },
  sub: { fontSize: 13, color: '#6b7280', marginBottom: 20, lineHeight: 1.5 },
  filters: { display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 },
  filterGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' },
  input: { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13 },
  error: { color: '#ef4444', fontSize: 13, marginBottom: 10 },
  actions: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  downloadBtn: { background: '#059669', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  hint: { fontSize: 12, color: '#9ca3af' },
};
