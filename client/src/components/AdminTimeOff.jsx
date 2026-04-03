import React, { useState, useEffect } from 'react';
import api from '../api';

const TYPE_LABELS = { vacation: 'Vacation', sick: 'Sick', personal: 'Personal', other: 'Other' };
const TYPE_COLORS = { vacation: '#1d4ed8', sick: '#dc2626', personal: '#7c3aed', other: '#6b7280' };
const STATUS_COLORS = { pending: '#d97706', approved: '#059669', denied: '#ef4444' };

function fmt(d) {
  if (!d) return '';
  return new Date(d.toString().substring(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function days(start, end) {
  const s = new Date(start.substring(0, 10) + 'T00:00:00');
  const e = new Date(end.substring(0, 10) + 'T00:00:00');
  return Math.round((e - s) / 86400000) + 1;
}

export default function AdminTimeOff() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [reviewNote, setReviewNote] = useState({});
  const [acting, setActing] = useState(null);

  const load = (status) => {
    setLoading(true);
    const params = status !== 'all' ? { status } : {};
    api.get('/time-off', { params })
      .then(r => setRequests(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(filter); }, [filter]);

  const act = async (id, action) => {
    setActing(id + action);
    try {
      const r = await api.patch(`/time-off/${id}/${action}`, { review_note: reviewNote[id] || null });
      setRequests(prev => prev.map(x => x.id === id ? r.data : x));
      setReviewNote(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch (err) {
      alert(err.response?.data?.error || 'Action failed.');
    } finally { setActing(null); }
  };

  const pending = requests.filter(r => r.status === 'pending');
  const rest = requests.filter(r => r.status !== 'pending');

  return (
    <div>
      <div style={s.headerRow}>
        <h2 style={s.title}>Time Off Requests</h2>
        <div style={s.filterGroup}>
          {['pending', 'approved', 'denied', 'all'].map(f => (
            <button key={f} style={{ ...s.filterBtn, ...(filter === f ? s.filterBtnActive : {}) }} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p style={s.empty}>Loading…</p>
      ) : requests.length === 0 ? (
        <p style={s.empty}>No {filter === 'all' ? '' : filter + ' '}requests.</p>
      ) : (
        <div style={s.list}>
          {[...pending, ...rest].map(r => (
            <div key={r.id} style={s.card}>
              <div style={s.cardTop}>
                <div style={s.workerName}>{r.worker_name}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ ...s.typeBadge, background: TYPE_COLORS[r.type] + '22', color: TYPE_COLORS[r.type] }}>
                    {TYPE_LABELS[r.type] || r.type}
                  </span>
                  <span style={{ ...s.statusBadge, color: STATUS_COLORS[r.status] }}>
                    {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </span>
                </div>
              </div>

              <div style={s.dates}>
                {fmt(r.start_date)} – {fmt(r.end_date)}
                <span style={s.dayCount}>
                  {days(r.start_date.toString(), r.end_date.toString())} day{days(r.start_date.toString(), r.end_date.toString()) !== 1 ? 's' : ''}
                </span>
              </div>

              {r.note && <p style={s.note}>{r.note}</p>}

              {r.status === 'pending' && (
                <div style={s.actionRow}>
                  <input
                    style={s.noteInput}
                    placeholder="Note (optional)"
                    value={reviewNote[r.id] || ''}
                    onChange={e => setReviewNote(prev => ({ ...prev, [r.id]: e.target.value }))}
                  />
                  <button
                    style={s.approveBtn}
                    disabled={acting === r.id + 'approve'}
                    onClick={() => act(r.id, 'approve')}
                  >
                    {acting === r.id + 'approve' ? '…' : '✓ Approve'}
                  </button>
                  <button
                    style={s.denyBtn}
                    disabled={acting === r.id + 'deny'}
                    onClick={() => act(r.id, 'deny')}
                  >
                    {acting === r.id + 'deny' ? '…' : '✕ Deny'}
                  </button>
                </div>
              )}

              {r.review_note && (
                <p style={{ ...s.note, color: STATUS_COLORS[r.status] }}>Note: {r.review_note}</p>
              )}

              <div style={s.meta}>
                Submitted {fmt(r.created_at)}
                {r.reviewer_name && ` · ${r.status} by ${r.reviewer_name}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 },
  title: { fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 },
  filterGroup: { display: 'flex', gap: 4 },
  filterBtn: { padding: '6px 14px', border: '1px solid #e5e7eb', borderRadius: 7, background: '#f9fafb', color: '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  filterBtnActive: { background: '#1a56db', color: '#fff', border: '1px solid #1a56db' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { background: '#fff', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 },
  workerName: { fontSize: 15, fontWeight: 700, color: '#111827' },
  typeBadge: { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.04em' },
  statusBadge: { fontSize: 12, fontWeight: 700 },
  dates: { fontSize: 15, fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 },
  dayCount: { fontSize: 12, color: '#9ca3af', fontWeight: 400 },
  note: { fontSize: 13, color: '#6b7280', margin: '6px 0 0' },
  actionRow: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' },
  noteInput: { flex: 1, minWidth: 160, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13 },
  approveBtn: { background: '#059669', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },
  denyBtn: { background: '#ef4444', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },
  meta: { fontSize: 12, color: '#9ca3af', marginTop: 8 },
  empty: { color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: '40px 0' },
};
