import React, { useState, useEffect } from 'react';
import api from '../api';
import MessageThread from './MessageThread';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../hooks/useT';
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
  const t = useT();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [working, setWorking] = useState(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [openMessageId, setOpenMessageId] = useState(null);
  const [fetchError, setFetchError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [workerFilter, setWorkerFilter] = useState('');

  const fetch = () => {
    setLoading(true);
    setFetchError(false);
    api.get('/admin/entries/pending')
      .then(r => { setEntries(r.data.entries); setHasMore(r.data.has_more); })
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

  const visibleEntries = workerFilter
    ? entries.filter(e => e.worker_name === workerFilter)
    : entries;

  const workerNames = [...new Set(entries.map(e => e.worker_name))].sort();

  const approveAll = async () => {
    const targets = visibleEntries;
    if (!confirm(`Approve ${targets.length} entr${targets.length === 1 ? 'y' : 'ies'}${workerFilter ? ` for ${workerFilter}` : ''}? This cannot be undone.`)) return;
    setApprovingAll(true);
    try {
      if (workerFilter) {
        for (const e of targets) await api.patch(`/admin/entries/${e.id}/approve`);
        setEntries(prev => prev.filter(e => e.worker_name !== workerFilter));
      } else {
        await api.post('/admin/entries/approve-all');
        setEntries([]);
      }
    } finally { setApprovingAll(false); }
  };

  if (loading) return <div style={styles.card}><p style={{ color: '#888' }}>{t.loading}</p></div>;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h3 style={styles.title}>{t.approvalQueue}</h3>
        {entries.length > 0 && (
          <>
            <span style={styles.badge}>{visibleEntries.length}{workerFilter ? '' : ' pending'}</span>
            {workerNames.length > 1 && (
              <select
                style={styles.filterSelect}
                value={workerFilter}
                onChange={e => setWorkerFilter(e.target.value)}
              >
                <option value="">{t.allWorkers}</option>
                {workerNames.map(n => (
                  <option key={n} value={n}>{n} ({entries.filter(e => e.worker_name === n).length})</option>
                ))}
              </select>
            )}
            <button style={styles.approveAllBtn} onClick={approveAll} disabled={approvingAll || visibleEntries.length === 0}>
              {approvingAll ? 'Approving...' : `✓ Approve${workerFilter ? ` ${workerFilter.split(' ')[0]}'s` : ' All'}`}
            </button>
          </>
        )}
      </div>

      {fetchError ? (
        <p style={styles.fetchError}>{t.failedLoadPending} <button style={styles.retryBtn} onClick={fetch}>{t.retry}</button></p>
      ) : entries.length === 0 ? (
        <p style={styles.empty}>{t.allCaughtUp}</p>
      ) : (
        <div style={styles.list}>
          {hasMore && (
            <p style={{ color: '#b45309', fontSize: 13, marginBottom: 8 }}>
              {t.showingOldest200}
            </p>
          )}
          {visibleEntries.length === 0 && workerFilter && (
            <p style={styles.empty}>No pending entries for {workerFilter}.</p>
          )}
          {visibleEntries.map(e => (
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
                  <span style={styles.signedTag}>{t.workerSigned}</span>
                )}
                {e.notes && <div style={styles.notes}>{e.notes}</div>}
                {(e.clock_in_lat || e.clock_out_lat) && (
                  <div style={styles.locationRow}>
                    {e.clock_in_lat && (
                      <a
                        href={`https://www.google.com/maps?q=${e.clock_in_lat},${e.clock_in_lng}`}
                        target="_blank" rel="noopener noreferrer"
                        style={styles.locationLink}
                      >{t.clockInLocation}</a>
                    )}
                    {e.clock_out_lat && (
                      <a
                        href={`https://www.google.com/maps?q=${e.clock_out_lat},${e.clock_out_lng}`}
                        target="_blank" rel="noopener noreferrer"
                        style={styles.locationLink}
                      >{t.clockOutLocation}</a>
                    )}
                  </div>
                )}
                <button
                  style={styles.msgBtn}
                  onClick={() => setOpenMessageId(openMessageId === e.id ? null : e.id)}
                >
                  {openMessageId === e.id ? `💬 ${t.hideComments}` : t.commentsOpen}
                </button>
                {openMessageId === e.id && (
                  <MessageThread entryId={e.id} currentUserId={user?.id} />
                )}
              </div>

              {rejectingId === e.id ? (
                <div style={styles.rejectForm}>
                  <input
                    style={styles.rejectInput}
                    placeholder={t.reasonOptional}
                    value={rejectNote}
                    onChange={ev => setRejectNote(ev.target.value)}
                    autoFocus
                  />
                  <button style={styles.confirmRejectBtn} onClick={() => submitReject(e.id)} disabled={working === e.id}>
                    {working === e.id ? '...' : t.confirmReject}
                  </button>
                  <button style={styles.cancelBtn} onClick={() => { setRejectingId(null); setRejectNote(''); }}>{t.cancel}</button>
                </div>
              ) : (
                <div style={styles.actions}>
                  <button style={styles.approveBtn} onClick={() => approve(e.id)} disabled={working === e.id}>
                    {working === e.id ? '...' : t.approve}
                  </button>
                  <button style={styles.rejectBtn} onClick={() => { setRejectingId(e.id); setRejectNote(''); }}>
                    {t.reject}
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
  filterSelect: { padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', background: '#fff' },
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
