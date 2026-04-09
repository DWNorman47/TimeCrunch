import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../hooks/useT';

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

const DEFAULT_CATEGORIES = ['Fuel', 'Tools & Equipment', 'Supplies', 'Meals', 'Travel', 'Lodging', 'Parking', 'Other'];

function ReimbursementRow({ item, onUpdate, knownCategories = DEFAULT_CATEGORIES }) {
  const t = useT();
  const resolveCategory = cat => cat && knownCategories.includes(cat) ? cat : cat ? 'Other' : null;
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
      setError(err.response?.data?.error || t.failedSave);
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
          {item.category && <span style={s.cat}>{resolveCategory(item.category)}</span>}
          {item.project_name && <span style={s.projectTag}>{item.project_name}</span>}
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
                {t.viewReceiptAdmin}
              </a>
            </div>
          )}
          <div style={s.notesRow}>
            <label style={s.notesLabel}>{t.notesForWorker}</label>
            <textarea
              style={s.textarea}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={t.reasonPlaceholder}
              rows={2}
              maxLength={1000}
            />
          </div>
          {error && <div style={s.error}>{error}</div>}
          <div style={s.actions}>
            {item.status !== 'approved' && (
              <button style={s.approveBtn} onClick={() => act('approved')} disabled={saving}>
                {saving ? '…' : t.approveBtn}
              </button>
            )}
            {item.status !== 'rejected' && (
              <button style={s.rejectBtn} onClick={() => act('rejected')} disabled={saving}>
                {saving ? '…' : t.rejectBtn}
              </button>
            )}
            {item.status !== 'pending' && (
              <button style={s.resetBtn} onClick={() => act('pending')} disabled={saving}>
                {t.resetPending}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReimbursementsAdmin() {
  const t = useT();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [workers, setWorkers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState({ active: [], known: [] });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ user_id: '', amount: '', description: '', category: '', expense_date: new Date().toLocaleDateString('en-CA'), status: 'approved', project_id: '' });
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [noReceipt, setNoReceipt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const fileRef = useRef();

  const filterLabels = {
    pending:  t.filterPending || t.statusPendingLabel,
    approved: t.filterApproved || t.statusApprovedLabel,
    rejected: t.filterRejected || t.statusRejectedLabel,
    all:      t.filterAllLabel,
  };

  const load = useCallback(() => {
    const params = filter !== 'all' ? `?status=${filter}` : '';
    api.get(`/reimbursements/admin${params}`)
      .then(r => setItems(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  useEffect(() => {
    api.get('/admin/workers').then(r => setWorkers(r.data)).catch(() => {});
    api.get('/projects').then(r => setProjects(r.data)).catch(() => {});
    api.get('/reimbursements/categories').then(r => setCategories(r.data)).catch(() => {});
  }, []);

  const handleFileChange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setReceiptFile(ev.target.result); setReceiptPreview(ev.target.result); };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!noReceipt && !receiptFile) { setFormError(t.receiptRequired); return; }
    setSaving(true); setFormError(''); setFormSuccess('');
    try {
      await api.post('/reimbursements/admin', {
        user_id: form.user_id,
        amount: form.amount,
        description: form.description || null,
        category: form.category || null,
        expense_date: form.expense_date,
        project_id: form.project_id || null,
        status: form.status,
        receipt: receiptFile || null,
      });
      setFormSuccess(t.expenseAdded);
      setShowForm(false);
      setForm({ user_id: '', amount: '', description: '', category: '', expense_date: new Date().toLocaleDateString('en-CA'), status: 'approved', project_id: '' });
      setReceiptFile(null); setReceiptPreview(null); setNoReceipt(false);
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || t.failedAddExpense);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = updated => {
    setItems(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i));
  };

  const totals = items.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + parseFloat(i.amount);
    return acc;
  }, {});

  const allWorkers = [{ id: user?.id, full_name: `${user?.full_name || 'Me'} (you)` }, ...workers.filter(w => w.id !== user?.id)];

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.title}>{t.expenseReimbursements}</div>
        <div style={s.headerRight}>
          <button style={s.addBtn} onClick={() => { setShowForm(v => !v); setFormError(''); setFormSuccess(''); }}>
            {showForm ? `✕ ${t.cancel}` : t.addExpense}
          </button>
          <div style={s.filters}>
            {['pending', 'approved', 'rejected', 'all'].map(f => (
              <button key={f} style={filter === f ? s.filterActive : s.filter} onClick={() => setFilter(f)}>
                {filterLabels[f]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {formSuccess && <div style={s.successMsg}>{formSuccess}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} style={s.form}>
          <div style={s.formRow}>
            <div style={s.field}>
              <label style={s.fieldLabel}>{t.workerLabel}</label>
              <select style={s.input} value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} required>
                <option value="">{t.selectWorker}</option>
                {allWorkers.map(w => <option key={w.id} value={w.id}>{w.full_name}</option>)}
              </select>
            </div>
            <div style={s.field}>
              <label style={s.fieldLabel}>{t.date} *</label>
              <input style={s.input} type="date" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} required />
            </div>
            <div style={s.field}>
              <label style={s.fieldLabel}>{t.amountLabel}</label>
              <input style={{ ...s.input, width: 100 }} type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
            </div>
            <div style={s.field}>
              <label style={s.fieldLabel}>{t.categoryLabel}</label>
              <select style={s.input} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">{t.selectPlaceholder}</option>
                {categories.active.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={s.field}>
              <label style={s.fieldLabel}>{t.statusLabel}</label>
              <select style={s.input} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="approved">{t.statusApprovedLabel}</option>
                <option value="pending">{t.statusPendingLabel}</option>
              </select>
            </div>
            {projects.length > 0 && (
              <div style={s.field}>
                <label style={s.fieldLabel}>{t.project}</label>
                <select style={s.input} value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
                  <option value="">{t.noProject}</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div style={s.field}>
            <label style={s.fieldLabel}>{t.descriptionLabel}</label>
            <input style={{ ...s.input, width: '100%' }} type="text" maxLength={500} placeholder={t.descriptionPlaceholder} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div style={s.field}>
            <label style={s.fieldLabel}>{t.receiptLabel}</label>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => { handleFileChange(e); setNoReceipt(false); }} />
            {!noReceipt && (
              <button type="button" style={s.uploadBtn} onClick={() => fileRef.current.click()}>
                {receiptFile ? t.receiptAttached : t.attachReceipt}
              </button>
            )}
            {receiptPreview && !noReceipt && receiptPreview.startsWith('data:image') && (
              <img src={receiptPreview} alt="Receipt" style={s.preview} />
            )}
            <label style={s.checkLabel}>
              <input type="checkbox" checked={noReceipt} onChange={e => { setNoReceipt(e.target.checked); if (e.target.checked) { setReceiptFile(null); setReceiptPreview(null); } }} />
              {' '}{t.noReceiptAvailable}
            </label>
          </div>
          {formError && <div style={s.errorMsg}>{formError}</div>}
          <button style={s.submitBtn} type="submit" disabled={saving}>{saving ? t.saving : t.addExpenseBtn}</button>
        </form>
      )}

      {!loading && items.length > 0 && filter !== 'all' && (
        <div style={s.summary}>
          <span style={{ fontWeight: 600 }}>{items.length} request{items.length !== 1 ? 's' : ''}</span>
          <span>Total: <b>{fmtMoney(Object.values(totals).reduce((a, b) => a + b, 0))}</b></span>
        </div>
      )}

      {loading ? null : items.length === 0 ? (
        <div style={s.empty}>{t.noReimbursementsFilter}</div>
      ) : (
        <div style={s.list}>
          {items.map(item => (
            <ReimbursementRow key={item.id} item={item} onUpdate={handleUpdate} knownCategories={categories.known} />
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  headerRight: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  title: { fontSize: 17, fontWeight: 700, color: '#111827' },
  addBtn: { padding: '7px 16px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  successMsg: { color: '#059669', fontWeight: 600, fontSize: 13, padding: '8px 12px', background: '#d1fae5', borderRadius: 7 },
  errorMsg: { color: '#dc2626', fontSize: 13 },
  form: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 },
  formRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: { fontSize: 12, fontWeight: 600, color: '#666' },
  input: { padding: '7px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 13 },
  uploadBtn: { padding: '7px 12px', background: '#f9fafb', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', alignSelf: 'flex-start' },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280', cursor: 'pointer', marginTop: 6 },
  preview: { marginTop: 6, maxWidth: 180, maxHeight: 140, borderRadius: 6, border: '1px solid #e5e7eb', objectFit: 'cover' },
  submitBtn: { padding: '9px 22px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start' },
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
  projectTag: { fontSize: 11, fontWeight: 600, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: 8 },
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
