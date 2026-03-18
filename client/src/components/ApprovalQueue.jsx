import React, { useState, useEffect } from 'react';
import api from '../api';
import MessageThread from './MessageThread';
import { useAuth } from '../contexts/AuthContext';
import { fmtHours } from '../utils';

function formatDate(dateStr) {
  const d = new Date(dateStr.substring(0, 10) + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(t) {
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m} ${hour < 12 ? 'AM' : 'PM'}`;
}

function formatHours(start, end) {
  const s = new Date(`1970-01-01T${start}`);
  const e = new Date(`1970-01-01T${end}`);
  return fmtHours((e - s) / 3600000);
}

export default function ApprovalQueue() {
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [working, setWorking] = useState(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [openMessageId, setOpenMessageId] = useState(null);
  const [fetchError, setFetchError] = useState(false);

  const fetch = () => {
    setLoading(true);
    setFetchError(false);
    api.get('/admin/entries/pending')
      .then(r => setEntries(r.data))
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  const approve = async id => {
    setWorking(id);
    try {
      await api.patch(`/admin/entries/${id}/approve`);
      setEntries(prev => prev.filter(e => e.id !== id));
    } finally { setWorking(null); }
  };

  const submitReject = async id => {
    setWorking(id);
    try {
      await api.patch(`/admin/entries/${id}/reject`, { note: rejectNote });
      setEntries(prev => prev.filter(e => e.id !== id));
      setRejectingId(null);
      setRejectNote('');
    } finally { setWorking(null); }
  };

  const approveAll = async () => {
    if (!confirm(`Approve all ${entries.length} pending entr${entries.length === 1 ? 'y' : 'ies'}? This cannot be undone.`)) return;
    setApprovingAll(true);
    try {
      await api.post('/admin/entries/approve-all');
      setEntries([]);
    } finally { setApprovingAll(false); }
  };

  if (loading) return <div style={styles.card}><p style={{ color: '#888' }}>Loading...</p></div>;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h3 style={styles.title}>Approval Queue</h3>
        {entries.length > 0 && (
          <>
            <span style={styles.badge}>{entries.length} pending</span>
            <button style={styles.approveAllBtn} onClick={approveAll} disabled={approvingAll}>
              {approvingAll ? 'Approving...' : '✓ Approve All'}
            </button>
          </>
        )}
      </div>

      {fetchError ? (
        <p style={styles.fetchError}>Failed to load pending entries. <button style={styles.retryBtn} onClick={fetch}>Retry</button></p>
      ) : entries.length === 0 ? (
        <p style={styles.empty}>All caught up — no pending entries.</p>
      ) : (
        <div style={styles.list}>
          {entries.map(e => (
            <div key={e.id} style={styles.row}>
              <div style={styles.rowMain}>
                <div style={styles.worker}>{e.worker_name}</div>
                <div style={styles.detail}>
                  <span style={styles.project}>{e.project_name}</span>
                  <span style={styles.sep}>·</span>
                  <span>{formatDate(e.work_date)}</span>
                  <span style={styles.sep}>·</span>
                  <span>{formatTime(e.start_time)} – {formatTime(e.end_time)} ({formatHours(e.start_time, e.end_time)})</span>
                  <span style={{ ...styles.wageTag, background: e.wage_type === 'prevailing' ? '#d97706' : '#2563eb' }}>
                    {e.wage_type === 'prevailing' ? 'Prevailing' : 'Regular'}
                  </span>
                </div>
                {e.worker_signed_at && (
                  <span style={styles.signedTag}>✍ Worker signed</span>
                )}
                {e.notes && <div style={styles.notes}>{e.notes}</div>}
                {(e.clock_in_lat || e.clock_out_lat) && (
                  <div style={styles.locationRow}>
                    {e.clock_in_lat && (
                      <a
                        href={`https://www.google.com/maps?q=${e.clock_in_lat},${e.clock_in_lng}`}
                        target="_blank" rel="noopener noreferrer"
                        style={styles.locationLink}
                      >📍 Clock-in location</a>
                    )}
                    {e.clock_out_lat && (
                      <a
                        href={`https://www.google.com/maps?q=${e.clock_out_lat},${e.clock_out_lng}`}
                        target="_blank" rel="noopener noreferrer"
                        style={styles.locationLink}
                      >📍 Clock-out location</a>
                    )}
                  </div>
                )}
                <button
                  style={styles.msgBtn}
                  onClick={() => setOpenMessageId(openMessageId === e.id ? null : e.id)}
                >
                  💬 {openMessageId === e.id ? 'Hide comments' : 'Comments'}
                </button>
                {openMessageId === e.id && (
                  <MessageThread entryId={e.id} currentUserId={user?.id} />
                )}
              </div>

              {rejectingId === e.id ? (
                <div style={styles.rejectForm}>
                  <input
                    style={styles.rejectInput}
                    placeholder="Reason (optional)"
                    value={rejectNote}
                    onChange={ev => setRejectNote(ev.target.value)}
                    autoFocus
                  />
                  <button style={styles.confirmRejectBtn} onClick={() => submitReject(e.id)} disabled={working === e.id}>
                    {working === e.id ? '...' : 'Confirm Reject'}
                  </button>
                  <button style={styles.cancelBtn} onClick={() => { setRejectingId(null); setRejectNote(''); }}>Cancel</button>
                </div>
              ) : (
                <div style={styles.actions}>
                  <button style={styles.approveBtn} onClick={() => approve(e.id)} disabled={working === e.id}>
                    {working === e.id ? '...' : '✓ Approve'}
                  </button>
                  <button style={styles.rejectBtn} onClick={() => { setRejectingId(e.id); setRejectNote(''); }}>
                    ✕ Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 24 },
  header: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 },
  title: { fontSize: 17, fontWeight: 700, margin: 0 },
  badge: { background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 },
  empty: { color: '#059669', fontSize: 14, fontWeight: 500 },
  fetchError: { color: '#991b1b', fontSize: 14 },
  retryBtn: { background: 'none', border: 'none', color: '#1a56db', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 14 },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  row: { border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  rowMain: { flex: 1, minWidth: 200 },
  worker: { fontWeight: 700, fontSize: 15, marginBottom: 4 },
  detail: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#555', flexWrap: 'wrap' },
  project: { fontWeight: 600, color: '#374151' },
  sep: { color: '#d1d5db' },
  wageTag: { color: '#fff', padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 700 },
  notes: { marginTop: 4, fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
  actions: { display: 'flex', gap: 8, alignItems: 'center' },
  approveBtn: { background: '#059669', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  rejectBtn: { background: 'none', border: '1px solid #fca5a5', color: '#ef4444', padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  rejectForm: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rejectInput: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, minWidth: 160 },
  confirmRejectBtn: { background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { background: 'none', border: '1px solid #d1d5db', color: '#6b7280', padding: '6px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  approveAllBtn: { background: '#059669', color: '#fff', border: 'none', padding: '5px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' },
  msgBtn: { background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', padding: '3px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer', marginTop: 6 },
  signedTag: { display: 'inline-block', marginTop: 4, background: '#ede9fe', color: '#5b21b6', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 },
  locationRow: { display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' },
  locationLink: { fontSize: 11, color: '#2563eb', textDecoration: 'none', fontWeight: 600 },
};
