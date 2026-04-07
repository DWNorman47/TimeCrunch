import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

const CATEGORIES = ['Fuel', 'Tools & Equipment', 'Supplies', 'Meals', 'Travel', 'Lodging', 'Parking', 'Other'];

function fmtDate(str) {
  const d = new Date(String(str).substring(0, 10) + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMoney(v) {
  return `$${Number(v).toFixed(2)}`;
}

function StatusBadge({ status }) {
  const colors = {
    pending:  { background: '#fef3c7', color: '#92400e' },
    approved: { background: '#d1fae5', color: '#065f46' },
    rejected: { background: '#fee2e2', color: '#991b1b' },
  };
  return (
    <span style={{ ...s.badge, ...(colors[status] || colors.pending) }}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function ReimbursementRow({ item, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(item.admin_notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const act = async status => {
    setSaving(true); setError('');
    try {
      const r = await api.patch(`/reimbursements/admin/${item.id}`, { status, admin_notes: notes || null });
      onUpdate(r.data);
      setExpanded(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.card}>
      <div style={s.row} onClick={() => setExpanded(e => !e)}>
        <div style={s.workerName}>{item.full_name} <span style={s.username}>@{item.username}</span></div>
        <div style={s.rowMid}>
          <span style={s.amount}>{fmtMoney(item.amount)}</span>
          {item.category && <span style={s.cat}>{item.category}</span>}
          <span style={s.date}>{fmtDate(item.expense_date)}</span>
        </div>
        <div style={s.rowRight}>
          <StatusBadge status={item.status} />
          <span style={s.chevron}>{expanded ? '▾' : '▸'}</span>
        </div>
      </div>

      {expanded && (
        <div style={s.detail}>
          <div style={s.desc}>{item.description}</div>
          {item.receipt_url && (
            <div style={{ marginBottom: 10 }}>
              <a href={item.receipt_url} target="_blank" rel="noopener noreferrer" style={s.receiptLink}>
                📄 View Receipt
              </a>
            </div>
          )}
          <div style={s.notesRow}>
            <label style={s.notesLabel}>Notes for worker (optional)</label>
            <textarea
              style={s.textarea}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Reason for approval or rejection…"
              rows={2}
            />
          </div>
          {error && <div style={s.error}>{error}</div>}
          <div style={s.actions}>
            {item.status !== 'approved' && (
              <button style={s.approveBtn} onClick={() => act('approved')} disabled={saving}>
                {saving ? '…' : '✓ Approve'}
              </button>
            )}
            {item.status !== 'rejected' && (
              <button style={s.rejectBtn} onClick={() => act('rejected')} disabled={saving}>
                {saving ? '…' : '✕ Reject'}
              </button>
            )}
            {item.status !== 'pending' && (
              <button style={s.resetBtn} onClick={() => act('pending')} disabled={saving}>
                Reset to Pending
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReimbursementsAdmin() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');

  const load = useCallback(() => {
    const params = filter !== 'all' ? `?status=${filter}` : '';
    api.get(`/reimbursements/admin${params}`)
      .then(r => setItems(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const handleUpdate = updated => {
    setItems(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i));
  };

  const totals = items.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + parseFloat(i.amount);
    return acc;
  }, {});

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.title}>Expense Reimbursements</div>
        <div style={s.filters}>
          {['pending', 'approved', 'rejected', 'all'].map(f => (
            <button key={f} style={filter === f ? s.filterActive : s.filter} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {!loading && items.length > 0 && filter !== 'all' && (
        <div style={s.summary}>
          <span style={{ fontWeight: 600 }}>{items.length} request{items.length !== 1 ? 's' : ''}</span>
          <span>Total: <b>{fmtMoney(Object.values(totals).reduce((a, b) => a + b, 0))}</b></span>
        </div>
      )}

      {loading ? null : items.length === 0 ? (
        <div style={s.empty}>No {filter !== 'all' ? filter : ''} reimbursements.</div>
      ) : (
        <div style={s.list}>
          {items.map(item => (
            <ReimbursementRow key={item.id} item={item} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  title: { fontSize: 17, fontWeight: 700, color: '#111827' },
  filters: { display: 'flex', gap: 6 },
  filter: { padding: '6px 14px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, fontWeight: 600, color: '#6b7280', cursor: 'pointer' },
  filterActive: { padding: '6px 14px', background: '#1a56db', border: '1px solid #1a56db', borderRadius: 7, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer' },
  summary: { display: 'flex', gap: 16, fontSize: 13, color: '#6b7280' },
  empty: { color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: '24px 0' },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer', flexWrap: 'wrap' },
  workerName: { fontSize: 14, fontWeight: 700, color: '#111827', minWidth: 130 },
  username: { fontWeight: 400, color: '#9ca3af', fontSize: 12 },
  rowMid: { display: 'flex', gap: 10, alignItems: 'center', flex: 1, flexWrap: 'wrap' },
  rowRight: { display: 'flex', gap: 10, alignItems: 'center', marginLeft: 'auto' },
  amount: { fontSize: 16, fontWeight: 700, color: '#111827' },
  cat: { fontSize: 11, fontWeight: 600, background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: 8 },
  date: { fontSize: 12, color: '#6b7280' },
  badge: { fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 8 },
  chevron: { fontSize: 13, color: '#6b7280' },
  detail: { padding: '0 16px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 10 },
  desc: { fontSize: 14, color: '#374151', paddingTop: 12 },
  receiptLink: { color: '#1a56db', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  notesRow: { display: 'flex', flexDirection: 'column', gap: 4 },
  notesLabel: { fontSize: 12, fontWeight: 600, color: '#666' },
  textarea: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 13, resize: 'vertical', fontFamily: 'inherit' },
  error: { color: '#dc2626', fontSize: 13 },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  approveBtn: { padding: '8px 18px', background: '#059669', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  rejectBtn: { padding: '8px 18px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  resetBtn: { padding: '8px 18px', background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
};
