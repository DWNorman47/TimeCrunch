import React, { useState, useEffect, useRef } from 'react';
import api from '../api';

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

export default function ReimbursementsView() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState({ active: [], known: [] });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: '', description: '', category: '', expense_date: new Date().toLocaleDateString('en-CA'), project_id: '' });
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [noReceipt, setNoReceipt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef();

  const resolveCategory = cat => cat && categories.known.includes(cat) ? cat : cat ? 'Other' : null;

  const load = () => {
    api.get('/reimbursements').then(r => setItems(r.data)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { api.get('/projects').then(r => setProjects(r.data)).catch(() => {}); }, []);
  useEffect(() => { api.get('/reimbursements/categories').then(r => setCategories(r.data)).catch(() => {}); }, []);

  const handleFileChange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      setReceiptFile(ev.target.result); // base64 data URL
      setReceiptPreview(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!noReceipt && !receiptFile) { setError('Please attach a receipt or check "No Receipt Available".'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      await api.post('/reimbursements', {
        amount: form.amount,
        description: form.description || null,
        category: form.category || null,
        expense_date: form.expense_date,
        project_id: form.project_id || null,
        receipt: receiptFile || null,
      });
      setSuccess('Reimbursement submitted successfully.');
      setShowForm(false);
      setForm({ amount: '', description: '', category: '', expense_date: new Date().toLocaleDateString('en-CA'), project_id: '' });
      setReceiptFile(null); setReceiptPreview(null); setNoReceipt(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit reimbursement');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async id => {
    if (!confirm('Delete this reimbursement?')) return;
    try {
      await api.delete(`/reimbursements/${id}`);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete');
    }
  };

  if (loading) return null;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.title}>Reimbursements</div>
        <button style={s.addBtn} onClick={() => { setShowForm(v => !v); setError(''); setSuccess(''); }}>
          {showForm ? '✕ Cancel' : '+ New Request'}
        </button>
      </div>

      {success && <div style={s.successMsg}>{success}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} style={s.form}>
          <div style={s.formRow}>
            <div style={s.field}>
              <label style={s.label}>Date *</label>
              <input style={s.input} type="date" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} required />
            </div>
            <div style={s.field}>
              <label style={s.label}>Amount *</label>
              <input style={{ ...s.input, width: 110 }} type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
            </div>
            <div style={s.field}>
              <label style={s.label}>Category</label>
              <select style={s.input} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">Select…</option>
                {categories.active.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {projects.length > 0 && (
              <div style={s.field}>
                <label style={s.label}>Project</label>
                <select style={s.input} value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
                  <option value="">No project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div style={s.field}>
            <label style={s.label}>Description</label>
            <input style={{ ...s.input, width: '100%' }} type="text" maxLength={500} placeholder="What was this expense for? (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div style={s.field}>
            <label style={s.label}>Receipt (photo or PDF)</label>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => { handleFileChange(e); setNoReceipt(false); }} />
            {!noReceipt && (
              <button type="button" style={s.uploadBtn} onClick={() => fileRef.current.click()}>
                {receiptFile ? '✓ Receipt attached — change' : '📎 Attach Receipt'}
              </button>
            )}
            {receiptPreview && !noReceipt && receiptPreview.startsWith('data:image') && (
              <img src={receiptPreview} alt="Receipt preview" style={s.preview} />
            )}
            {receiptPreview && !noReceipt && receiptPreview.startsWith('data:application/pdf') && (
              <div style={s.pdfHint}>PDF attached</div>
            )}
            <label style={s.checkLabel}>
              <input type="checkbox" checked={noReceipt} onChange={e => { setNoReceipt(e.target.checked); if (e.target.checked) { setReceiptFile(null); setReceiptPreview(null); } }} />
              {' '}No receipt available
            </label>
          </div>
          {error && <div style={s.errorMsg}>{error}</div>}
          <button style={s.submitBtn} type="submit" disabled={saving}>
            {saving ? 'Submitting…' : 'Submit Request'}
          </button>
        </form>
      )}

      {items.length === 0 && !showForm ? (
        <div style={s.empty}>No reimbursements submitted yet.</div>
      ) : (
        <div style={s.list}>
          {items.map(item => (
            <div key={item.id} style={s.card}>
              <div style={s.cardTop}>
                <div style={s.cardLeft}>
                  <span style={s.amount}>{fmtMoney(item.amount)}</span>
                  {item.category && <span style={s.category}>{resolveCategory(item.category)}</span>}
                  {item.project_name && <span style={s.projectTag}>{item.project_name}</span>}
                </div>
                <div style={s.cardRight}>
                  <StatusBadge status={item.status} />
                  {item.status === 'pending' && (
                    <button style={s.deleteBtn} onClick={() => handleDelete(item.id)}>✕</button>
                  )}
                </div>
              </div>
              <div style={s.desc}>{item.description}</div>
              <div style={s.meta}>
                <span>{fmtDate(item.expense_date)}</span>
                {item.receipt_url && (
                  <a href={item.receipt_url} target="_blank" rel="noopener noreferrer" style={s.receiptLink}>View Receipt</a>
                )}
              </div>
              {item.admin_notes && (
                <div style={s.adminNote}>Admin note: {item.admin_notes}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: 700, color: '#111827' },
  addBtn: { padding: '8px 16px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  successMsg: { color: '#059669', fontWeight: 600, fontSize: 13, padding: '8px 12px', background: '#d1fae5', borderRadius: 7 },
  errorMsg: { color: '#dc2626', fontSize: 13 },
  form: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 },
  formRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: '#666' },
  input: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 14 },
  uploadBtn: { padding: '8px 14px', background: '#f9fafb', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', alignSelf: 'flex-start' },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280', cursor: 'pointer', marginTop: 6 },
  preview: { marginTop: 8, maxWidth: 220, maxHeight: 180, borderRadius: 6, border: '1px solid #e5e7eb', objectFit: 'cover' },
  pdfHint: { marginTop: 8, fontSize: 12, color: '#6b7280' },
  submitBtn: { padding: '10px 24px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', alignSelf: 'flex-start' },
  empty: { color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: '24px 0' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  cardRight: { display: 'flex', alignItems: 'center', gap: 8 },
  amount: { fontSize: 18, fontWeight: 700, color: '#111827' },
  category: { fontSize: 11, fontWeight: 600, background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: 8 },
  projectTag: { fontSize: 11, fontWeight: 600, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: 8 },
  badge: { fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 8 },
  deleteBtn: { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14, padding: '2px 4px' },
  desc: { fontSize: 14, color: '#374151' },
  meta: { display: 'flex', gap: 14, fontSize: 12, color: '#6b7280', alignItems: 'center' },
  receiptLink: { color: '#1a56db', textDecoration: 'none', fontWeight: 600 },
  adminNote: { fontSize: 12, color: '#6b7280', fontStyle: 'italic', background: '#f9fafb', borderRadius: 6, padding: '5px 10px', marginTop: 2 },
};
