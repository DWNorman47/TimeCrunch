import React, { useState, useEffect } from 'react';
import api from '../api';

const ACTION_META = {
  'worker.created':       { label: 'Worker added',        color: '#059669', bg: '#d1fae5' },
  'worker.invited':       { label: 'Worker invited',       color: '#7c3aed', bg: '#ede9fe' },
  'worker.updated':       { label: 'Worker updated',       color: '#1a56db', bg: '#dbeafe' },
  'worker.deleted':       { label: 'Worker removed',       color: '#ef4444', bg: '#fee2e2' },
  'worker.restored':      { label: 'Worker restored',      color: '#059669', bg: '#d1fae5' },
  'project.created':      { label: 'Project created',      color: '#059669', bg: '#d1fae5' },
  'project.updated':      { label: 'Project updated',      color: '#1a56db', bg: '#dbeafe' },
  'project.deleted':      { label: 'Project removed',      color: '#ef4444', bg: '#fee2e2' },
  'project.restored':     { label: 'Project restored',     color: '#059669', bg: '#d1fae5' },
  'entry.approved':       { label: 'Entry approved',       color: '#059669', bg: '#d1fae5' },
  'entry.rejected':       { label: 'Entry rejected',       color: '#dc2626', bg: '#fee2e2' },
  'pay_period.locked':    { label: 'Pay period locked',    color: '#d97706', bg: '#fef3c7' },
  'pay_period.unlocked':  { label: 'Pay period unlocked',  color: '#6b7280', bg: '#f3f4f6' },
  'settings.updated':     { label: 'Settings updated',     color: '#d97706', bg: '#fef3c7' },
};

const ACTION_GROUPS = {
  '': 'All actions',
  worker: 'Workers',
  project: 'Projects',
  entry: 'Entries',
  pay_period: 'Pay periods',
  settings: 'Settings',
};

function formatDt(str) {
  const d = new Date(str);
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

function ActionBadge({ action }) {
  const meta = ACTION_META[action] || { label: action, color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: meta.color, background: meta.bg }}>
      {meta.label}
    </span>
  );
}

export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const LIMIT = 30;

  const load = async (off = 0, reset = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset: off });
      if (group) params.set('group', group);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const r = await api.get(`/admin/audit-log?${params}`);
      setEntries(prev => off === 0 || reset ? r.data.entries : [...prev, ...r.data.entries]);
      setTotal(r.data.total);
      setOffset(off);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(0, true); }, [group, from, to]);

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h3 style={styles.title}>Audit Log</h3>
        <span style={styles.totalBadge}>{total} events</span>
      </div>

      <div style={styles.filters}>
        <select style={styles.filterSelect} value={group} onChange={e => setGroup(e.target.value)}>
          {Object.entries(ACTION_GROUPS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <input style={styles.filterDate} type="date" value={from} onChange={e => setFrom(e.target.value)} placeholder="From" title="From date" />
        <input style={styles.filterDate} type="date" value={to} onChange={e => setTo(e.target.value)} placeholder="To" title="To date" />
        {(group || from || to) && (
          <button style={styles.clearBtn} onClick={() => { setGroup(''); setFrom(''); setTo(''); }}>Clear</button>
        )}
      </div>

      {loading && entries.length === 0 ? (
        <p style={styles.empty}>Loading...</p>
      ) : entries.length === 0 ? (
        <p style={styles.empty}>No matching activity.</p>
      ) : (
        <>
          <div style={styles.list}>
            {entries.map(e => {
              const dt = formatDt(e.created_at);
              return (
                <div key={e.id} style={styles.row}>
                  <div style={styles.rowTime}>
                    <span style={styles.rowDate}>{dt.date}</span>
                    <span style={styles.rowClock}>{dt.time}</span>
                  </div>
                  <div style={styles.rowBody}>
                    <div style={styles.rowTop}>
                      <ActionBadge action={e.action} />
                      {e.entity_name && <span style={styles.entityName}>{e.entity_name}</span>}
                    </div>
                    <div style={styles.rowActor}>by {e.actor_name}</div>
                    {e.details && Object.keys(e.details).length > 0 && (
                      <div style={styles.details}>
                        {Object.entries(e.details).map(([k, v]) => (
                          <span key={k} style={styles.detailChip}>{k}: {String(v)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

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
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' },
  header: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 },
  title: { fontSize: 17, fontWeight: 700, margin: 0 },
  totalBadge: { fontSize: 12, background: '#f3f4f6', color: '#6b7280', padding: '2px 10px', borderRadius: 20, fontWeight: 600 },
  filters: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  filterSelect: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, background: '#fff' },
  filterDate: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13 },
  clearBtn: { background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer' },
  empty: { color: '#9ca3af', fontSize: 14, padding: '16px 0' },
  list: { display: 'flex', flexDirection: 'column', gap: 1 },
  row: { display: 'flex', gap: 16, padding: '12px 4px', borderBottom: '1px solid #f3f4f6', alignItems: 'flex-start' },
  rowTime: { display: 'flex', flexDirection: 'column', minWidth: 90, flexShrink: 0 },
  rowDate: { fontSize: 13, fontWeight: 500, color: '#374151' },
  rowClock: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 },
  entityName: { fontSize: 13, fontWeight: 600, color: '#111827' },
  rowActor: { fontSize: 12, color: '#9ca3af' },
  details: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  detailChip: { fontSize: 11, background: '#f9fafb', border: '1px solid #e5e7eb', color: '#6b7280', padding: '1px 7px', borderRadius: 4 },
  loadMore: { marginTop: 16, background: 'none', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: '#374151', cursor: 'pointer', width: '100%' },
};
