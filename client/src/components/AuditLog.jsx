import React, { useState, useEffect } from 'react';
import api from '../api';

const ACTION_LABELS = {
  'worker.created': 'Added worker',
  'worker.updated': 'Updated worker',
  'worker.deleted': 'Removed worker',
  'worker.restored': 'Restored worker',
  'worker.invited': 'Invited worker',
  'project.created': 'Created project',
  'project.updated': 'Updated project',
  'project.deleted': 'Removed project',
  'project.restored': 'Restored project',
  'settings.updated': 'Updated settings',
};

const ACTION_COLORS = {
  'worker.created': '#059669',
  'worker.invited': '#7c3aed',
  'worker.updated': '#1a56db',
  'worker.deleted': '#ef4444',
  'worker.restored': '#059669',
  'project.created': '#059669',
  'project.updated': '#1a56db',
  'project.deleted': '#ef4444',
  'project.restored': '#059669',
  'settings.updated': '#d97706',
};

export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const LIMIT = 25;

  const load = async (off = 0) => {
    setLoading(true);
    try {
      const r = await api.get(`/admin/audit-log?limit=${LIMIT}&offset=${off}`);
      setEntries(off === 0 ? r.data.entries : prev => [...prev, ...r.data.entries]);
      setTotal(r.data.total);
      setOffset(off);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(0); }, []);

  return (
    <div style={styles.card}>
      <h3 style={styles.title}>Audit Log</h3>
      {loading && entries.length === 0 ? (
        <p style={styles.empty}>Loading...</p>
      ) : entries.length === 0 ? (
        <p style={styles.empty}>No activity recorded yet.</p>
      ) : (
        <>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>When</th>
                <th style={styles.th}>Who</th>
                <th style={styles.th}>Action</th>
                <th style={styles.th}>Target</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} style={styles.tr}>
                  <td style={styles.td}>
                    <span style={styles.time}>{new Date(e.created_at).toLocaleDateString()}</span>
                    <span style={styles.timeSmall}>{new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </td>
                  <td style={styles.td}>{e.actor_name}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, background: (ACTION_COLORS[e.action] || '#6b7280') + '18', color: ACTION_COLORS[e.action] || '#6b7280' }}>
                      {ACTION_LABELS[e.action] || e.action}
                    </span>
                  </td>
                  <td style={styles.td}>{e.entity_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length < total && (
            <button style={styles.loadMore} onClick={() => load(offset + LIMIT)} disabled={loading}>
              {loading ? 'Loading...' : `Load more (${total - entries.length} remaining)`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginTop: 24 },
  title: { fontSize: 17, fontWeight: 700, marginBottom: 16 },
  empty: { color: '#888', fontSize: 14 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', fontSize: 12, color: '#999', fontWeight: 600, textTransform: 'uppercase', padding: '6px 8px', borderBottom: '1px solid #eee' },
  tr: { borderBottom: '1px solid #f5f5f5' },
  td: { padding: '10px 8px', fontSize: 14, verticalAlign: 'top' },
  time: { display: 'block', fontWeight: 500 },
  timeSmall: { display: 'block', fontSize: 12, color: '#9ca3af' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600 },
  loadMore: { marginTop: 16, background: 'none', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: '#374151', cursor: 'pointer', width: '100%' },
};
