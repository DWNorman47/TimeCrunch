import React, { useState } from 'react';
import api from '../api';
import MessageThread from './MessageThread';
import { fmtHours } from '../utils';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isEditable(dateStr) {
  const d = new Date(dateStr.substring(0, 10) + 'T00:00:00');
  return Date.now() - d.getTime() <= SEVEN_DAYS_MS;
}

function formatHours(start, end, breakMinutes) {
  let ms = new Date(`1970-01-01T${end}`) - new Date(`1970-01-01T${start}`);
  if (ms < 0) ms += 86400000; // midnight-crossing shift
  const h = ms / 3600000 - (breakMinutes || 0) / 60;
  return fmtHours(h);
}

function formatDate(dateStr, language) {
  const d = new Date(dateStr.substring(0, 10) + 'T00:00:00');
  const locale = language === 'Spanish' ? 'es-MX' : 'en-US';
  return d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(t) {
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m} ${hour < 12 ? 'AM' : 'PM'}`;
}

export default function EntryList({ entries, onDeleted, onUpdated, t, language, currentUserId }) {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [openMessageId, setOpenMessageId] = useState(null);

  const handleDelete = async id => {
    if (!confirm(t.confirmDelete)) return;
    try {
      await api.delete(`/time-entries/${id}`);
      onDeleted(id);
    } catch {
      alert(t.failedDeleteEntry);
    }
  };

  const startEdit = e => {
    setEditingId(e.id);
    setEditForm({
      start_time: e.start_time.substring(0, 5),
      end_time: e.end_time.substring(0, 5),
      notes: e.notes || '',
      break_minutes: e.break_minutes || 0,
      mileage: e.mileage || '',
    });
    setEditError('');
  };

  const handleSaveEdit = async () => {
    setEditSaving(true); setEditError('');
    try {
      const r = await api.patch(`/time-entries/${editingId}`, editForm);
      if (onUpdated) onUpdated(r.data);
      setEditingId(null);
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  };

  if (entries.length === 0) {
    return <div style={styles.empty}>{t.noEntries}</div>;
  }

  return (
    <div style={styles.card} className="mobile-card">
      <h2 style={styles.heading}>{t.yourEntries}</h2>
      <div style={styles.list}>
        {entries.map(e => (
          <div key={e.id} style={styles.entry}>
            {editingId === e.id ? (
              <div style={styles.editForm}>
                <div style={styles.editRow}>
                  <div style={styles.editField}>
                    <label style={styles.editLabel}>{t.start}</label>
                    <input style={styles.editInput} type="time" value={editForm.start_time} onChange={ev => setEditForm(f => ({ ...f, start_time: ev.target.value }))} />
                  </div>
                  <div style={styles.editField}>
                    <label style={styles.editLabel}>{t.end}</label>
                    <input style={styles.editInput} type="time" value={editForm.end_time} onChange={ev => setEditForm(f => ({ ...f, end_time: ev.target.value }))} />
                  </div>
                  <div style={styles.editField}>
                    <label style={styles.editLabel}>{t.breakMin}</label>
                    <input style={styles.editInput} type="number" min="0" max="480" value={editForm.break_minutes} onChange={ev => setEditForm(f => ({ ...f, break_minutes: ev.target.value }))} />
                  </div>
                  <div style={styles.editField}>
                    <label style={styles.editLabel}>{t.mileageMi}</label>
                    <input style={styles.editInput} type="number" min="0" step="0.1" value={editForm.mileage} onChange={ev => setEditForm(f => ({ ...f, mileage: ev.target.value }))} placeholder={t.optional} />
                  </div>
                  <div style={{ ...styles.editField, flex: 2 }}>
                    <label style={styles.editLabel}>{t.notes}</label>
                    <input style={styles.editInput} type="text" value={editForm.notes} onChange={ev => setEditForm(f => ({ ...f, notes: ev.target.value }))} placeholder={t.optionalNotes} />
                  </div>
                </div>
                {editError && <p style={styles.editError}>{editError}</p>}
                <div style={styles.editActions}>
                  <button style={styles.saveEditBtn} onClick={handleSaveEdit} disabled={editSaving}>{editSaving ? t.saving : t.save}</button>
                  <button style={styles.cancelEditBtn} onClick={() => setEditingId(null)}>{t.cancel}</button>
                </div>
              </div>
            ) : (
              <>
                <div style={styles.entryMain} className="entry-main">
                  <span style={styles.project}>{e.project_name}</span>
                  <div style={styles.entryRight}>
                    <span style={styles.date}>{formatDate(e.work_date, language)}</span>
                    {e.locked
                      ? <span style={styles.lockIcon} title="Approved and locked by admin">🔒</span>
                      : isEditable(e.work_date)
                        ? <button style={styles.editBtn} onClick={() => startEdit(e)}>{t.edit}</button>
                        : <span style={styles.lockIcon} title="Entries older than 7 days cannot be edited">🔒</span>
                    }
                    {!e.locked && <button style={styles.deleteBtn} onClick={() => handleDelete(e.id)}>{t.delete}</button>}
                  </div>
                </div>
                <div style={styles.entryDetail} className="entry-detail">
                  <span>{formatTime(e.start_time)} – {formatTime(e.end_time)} ({formatHours(e.start_time, e.end_time, e.break_minutes)})</span>
                  {e.break_minutes > 0 && <span style={styles.breakTag}>☕ {e.break_minutes}m break</span>}
                  {e.mileage > 0 && <span style={styles.mileageTag}>🚗 {parseFloat(e.mileage).toFixed(1)} mi</span>}
                  <span style={{ ...styles.badge, background: e.wage_type === 'prevailing' ? '#d97706' : '#2563eb' }}>
                    {e.wage_type === 'prevailing' ? t.prevailing : t.regular}
                  </span>
                  {e.status === 'approved' && <span style={styles.statusApproved}>{t.approved}</span>}
                  {e.locked && <span style={styles.lockedBadge}>🔒 Locked</span>}
                  {e.status === 'rejected' && <span style={styles.statusRejected}>{t.rejected}{e.approval_note ? `: ${e.approval_note}` : ''}</span>}
                  {(!e.status || e.status === 'pending') && <span style={styles.statusPending}>{t.pending}</span>}
                </div>
                {e.notes && <div style={styles.notes}>{e.notes}</div>}
                <button
                  style={styles.msgBtn}
                  onClick={() => setOpenMessageId(openMessageId === e.id ? null : e.id)}
                >
                  💬 {openMessageId === e.id ? t.hideComments : t.comments}
                </button>
                {openMessageId === e.id && (
                  <MessageThread entryId={e.id} currentUserId={currentUserId} />
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' },
  heading: { marginBottom: 16, fontSize: 18, fontWeight: 700 },
  empty: { textAlign: 'center', color: '#888', padding: 32 },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  entry: { border: '1px solid #eee', borderRadius: 8, padding: 14 },
  entryMain: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  entryRight: { display: 'flex', alignItems: 'center', gap: 10 },
  project: { fontWeight: 700, fontSize: 15 },
  date: { color: '#666', fontSize: 13 },
  entryDetail: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#555' },
  badge: { color: '#fff', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 },
  notes: { marginTop: 6, fontSize: 12, color: '#888', fontStyle: 'italic' },
  deleteBtn: { background: 'none', border: '1px solid #fca5a5', color: '#ef4444', padding: '3px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer' },
  editBtn: { background: 'none', border: '1px solid #93c5fd', color: '#2563eb', padding: '3px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer', marginRight: 4 },
  lockIcon: { fontSize: 12, marginRight: 4, opacity: 0.5, cursor: 'default' },
  editForm: { padding: '8px 0' },
  editRow: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 },
  editField: { display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 100 },
  editLabel: { fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' },
  editInput: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 },
  editError: { color: '#ef4444', fontSize: 12, margin: '4px 0' },
  editActions: { display: 'flex', gap: 8 },
  saveEditBtn: { background: '#059669', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  cancelEditBtn: { background: 'none', border: '1px solid #d1d5db', color: '#6b7280', padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  statusApproved: { fontSize: 11, fontWeight: 700, color: '#059669', background: '#d1fae5', padding: '1px 7px', borderRadius: 10 },
  statusRejected: { fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '1px 7px', borderRadius: 10 },
  statusPending: { fontSize: 11, color: '#92400e', background: '#fef3c7', padding: '1px 7px', borderRadius: 10 },
  breakTag: { fontSize: 11, color: '#6b7280', background: '#f3f4f6', padding: '1px 7px', borderRadius: 10 },
  mileageTag: { fontSize: 11, color: '#6b7280', background: '#f3f4f6', padding: '1px 7px', borderRadius: 10 },
  msgBtn: { background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', padding: '3px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer', marginTop: 6 },
  lockedBadge: { fontSize: 11, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', padding: '1px 7px', borderRadius: 10 },
};
