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
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return Math.round((e - s) / 86400000) + 1;
}

export default function TimeOffTab() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ type: 'vacation', start_date: '', end_date: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/time-off/mine')
      .then(r => setRequests(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.start_date || !form.end_date) { setError('Please select a date range.'); return; }
    if (form.end_date < form.start_date) { setError('End date must be on or after start date.'); return; }
    setSaving(true); setError('');
    try {
      const r = await api.post('/time-off', form);
      setRequests(prev => [r.data, ...prev]);
      setForm({ type: 'vacation', start_date: '', end_date: '', note: '' });
      setShowForm(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit request.');
    } finally { setSaving(false); }
  };

  const handleCancel = async (id) => {
    if (!confirm('Cancel this time off request?')) return;
    try {
      await api.delete(`/time-off/${id}`);
      setRequests(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      alert(err.response?.data?.error || 'Could not cancel.');
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <h2 style={s.title}>Time Off Requests</h2>
        <button style={s.addBtn} onClick={() => setShowForm(o => !o)}>
          {showForm ? 'Cancel' : '+ New Request'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={s.form}>
          <div style={s.row}>
            <div style={s.fieldGroup}>
              <label style={s.label}>Type</label>
              <select style={s.input} value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="vacation">Vacation</option>
                <option value="sick">Sick</option>
                <option value="personal">Personal</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Start Date</label>
              <input style={s.input} type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} required />
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>End Date</label>
              <input style={s.input} type="date" value={form.end_date} min={form.start_date} onChange={e => set('end_date', e.target.value)} required />
            </div>
          </div>
          <div style={s.fieldGroup}>
            <label style={s.label}>Note (optional)</label>
            <textarea style={{ ...s.input, resize: 'vertical', minHeight: 56 }} value={form.note} onChange={e => set('note', e.target.value)} placeholder="Any additional details…" />
          </div>
          {error && <p style={s.error}>{error}</p>}
          <button style={s.submitBtn} type="submit" disabled={saving}>
            {saving ? 'Submitting…' : 'Submit Request'}
          </button>
        </form>
      )}

      {loading ? (
        <p style={s.empty}>Loading…</p>
      ) : requests.length === 0 ? (
        <p style={s.empty}>No time off requests yet.</p>
      ) : (
        <div style={s.list}>
          {requests.map(r => (
            <div key={r.id} style={s.card}>
              <div style={s.cardTop}>
                <span style={{ ...s.typeBadge, background: TYPE_COLORS[r.type] + '22', color: TYPE_COLORS[r.type] }}>
                  {TYPE_LABELS[r.type] || r.type}
                </span>
                <span style={{ ...s.statusBadge, color: STATUS_COLORS[r.status] || '#6b7280' }}>
                  {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                </span>
              </div>
              <div style={s.dates}>
                {fmt(r.start_date)} – {fmt(r.end_date)}
                <span style={s.dayCount}>{days(r.start_date?.toString().substring(0,10), r.end_date?.toString().substring(0,10))} day{days(r.start_date?.toString().substring(0,10), r.end_date?.toString().substring(0,10)) !== 1 ? 's' : ''}</span>
              </div>
              {r.note && <p style={s.note}>{r.note}</p>}
              {r.review_note && (
                <p style={{ ...s.note, color: STATUS_COLORS[r.status] || '#6b7280' }}>
                  Admin: {r.review_note}
                </p>
              )}
              <div style={s.meta}>
                Submitted {fmt(r.created_at)}
                {r.status === 'pending' && (
                  <button style={s.cancelBtn} onClick={() => handleCancel(r.id)}>Cancel</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: { padding: '16px 16px 32px' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 },
  addBtn: { background: '#1a56db', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  form: { background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 120 },
  label: { fontSize: 12, fontWeight: 600, color: '#374151' },
  input: { padding: '9px 11px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 14, background: '#fafafa' },
  error: { color: '#ef4444', fontSize: 13, margin: 0 },
  submitBtn: { background: '#1a56db', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', alignSelf: 'flex-start' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { background: '#fff', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  typeBadge: { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.04em' },
  statusBadge: { fontSize: 12, fontWeight: 700 },
  dates: { fontSize: 15, fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 },
  dayCount: { fontSize: 12, color: '#9ca3af', fontWeight: 400 },
  note: { fontSize: 13, color: '#6b7280', margin: '6px 0 0' },
  meta: { fontSize: 12, color: '#9ca3af', marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cancelBtn: { background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  empty: { color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: '32px 0' },
};
