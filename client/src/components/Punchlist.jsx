import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';

const STATUSES = [
  { value: 'open', label: 'Open', color: '#92400e', bg: '#fef3c7' },
  { value: 'done', label: 'Done', color: '#1e40af', bg: '#dbeafe' },
  { value: 'verified', label: 'Verified ✓', color: '#065f46', bg: '#d1fae5' },
];
const PRIORITIES = [
  { value: 'high', label: '🔴 High' },
  { value: 'normal', label: '🟡 Normal' },
  { value: 'low', label: '⚪ Low' },
];

function statusStyle(status) {
  const s = STATUSES.find(x => x.value === status) || STATUSES[0];
  return { color: s.color, background: s.bg };
}

function AddItemForm({ projects, workers, onAdded, onCancel, isAdmin }) {
  const [form, setForm] = useState({ title: '', description: '', location: '', project_id: '', priority: 'normal', assigned_to: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async e => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      const r = await api.post('/punchlist', form);
      onAdded(r.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} style={styles.form}>
      <h3 style={styles.formTitle}>New Punchlist Item</h3>
      <div style={styles.formGrid}>
        <div style={{ ...styles.fieldGroup, gridColumn: '1 / -1' }}>
          <label style={styles.label}>Title *</label>
          <input style={styles.input} type="text" placeholder="e.g. Patch drywall in office 2B" value={form.title} onChange={e => set('title', e.target.value)} />
        </div>
        {projects.length > 0 && (
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Project</label>
            <select style={styles.input} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Priority</label>
          <select style={styles.input} value={form.priority} onChange={e => set('priority', e.target.value)}>
            {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        {isAdmin && workers.length > 0 && (
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Assign to</label>
            <select style={styles.input} value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
              <option value="">Unassigned</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.full_name}</option>)}
            </select>
          </div>
        )}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Location</label>
          <input style={styles.input} type="text" placeholder="e.g. 2nd floor, north wing" value={form.location} onChange={e => set('location', e.target.value)} />
        </div>
        <div style={{ ...styles.fieldGroup, gridColumn: '1 / -1' }}>
          <label style={styles.label}>Description</label>
          <textarea style={styles.textarea} rows={3} placeholder="Additional details..." value={form.description} onChange={e => set('description', e.target.value)} />
        </div>
      </div>
      {error && <p style={styles.error}>{error}</p>}
      <div style={styles.formActions}>
        <button style={styles.submitBtn} type="submit" disabled={saving}>{saving ? 'Saving...' : 'Add Item'}</button>
        <button style={styles.cancelBtn} type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function PunchItem({ item, isAdmin, workers, onUpdated, onDeleted }) {
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);

  const nextStatus = { open: 'done', done: 'verified', verified: 'open' };
  const nextLabel = { open: 'Mark Done', done: 'Verify', verified: 'Reopen' };

  const advance = async () => {
    setUpdating(true);
    try {
      const r = await api.patch(`/punchlist/${item.id}`, { status: nextStatus[item.status] });
      onUpdated(r.data);
    } finally { setUpdating(false); }
  };

  const assignTo = async workerId => {
    try {
      const r = await api.patch(`/punchlist/${item.id}`, { assigned_to: workerId || null });
      onUpdated(r.data);
    } catch {}
  };

  const handleDelete = async () => {
    if (!confirm('Delete this item?')) return;
    try { await api.delete(`/punchlist/${item.id}`); onDeleted(item.id); } catch {}
  };

  const priorityDot = { high: '🔴', normal: '🟡', low: '⚪' }[item.priority] || '🟡';

  return (
    <div style={{ ...styles.item, opacity: item.status === 'verified' ? 0.65 : 1 }}>
      <div style={styles.itemRow} onClick={() => setExpanded(e => !e)}>
        <span style={styles.priorityDot} title={`Priority: ${item.priority}`}>{priorityDot}</span>
        <div style={styles.itemMain}>
          <span style={{ ...styles.itemTitle, textDecoration: item.status === 'verified' ? 'line-through' : 'none' }}>
            {item.title}
          </span>
          <div style={styles.itemMeta}>
            {item.project_name && <span style={styles.metaTag}>{item.project_name}</span>}
            {item.location && <span style={styles.metaLoc}>📍 {item.location}</span>}
            {item.assigned_to_name && <span style={styles.metaAssign}>👤 {item.assigned_to_name}</span>}
          </div>
        </div>
        <div style={styles.itemRight}>
          <span style={{ ...styles.statusBadge, ...statusStyle(item.status) }}>
            {STATUSES.find(s => s.value === item.status)?.label || item.status}
          </span>
          <span style={styles.chevron}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={styles.itemBody}>
          {item.description && <p style={styles.desc}>{item.description}</p>}
          {item.resolved_at && item.status === 'verified' && (
            <p style={styles.resolvedNote}>Verified {new Date(item.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
          )}
          {isAdmin && (
            <div style={styles.assignRow}>
              <label style={styles.label}>Assign to: </label>
              <select style={styles.smallSelect} value={item.assigned_to || ''} onChange={e => assignTo(e.target.value)}>
                <option value="">Unassigned</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.full_name}</option>)}
              </select>
            </div>
          )}
          <div style={styles.itemActions}>
            <button style={styles.advanceBtn} onClick={advance} disabled={updating}>
              {updating ? '...' : nextLabel[item.status] || 'Update'}
            </button>
            <button style={styles.deleteBtn} onClick={handleDelete}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Punchlist({ projects }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const [items, setItems] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const load = async (proj = filterProject, stat = filterStatus) => {
    try {
      const params = {};
      if (proj) params.project_id = proj;
      if (stat) params.status = stat;
      const r = await api.get('/punchlist', { params });
      setItems(r.data);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const init = async () => {
      if (isAdmin) {
        const w = await api.get('/admin/workers');
        setWorkers(w.data);
      }
      await load();
    };
    init();
  }, []);

  useEffect(() => { if (!loading) load(filterProject, filterStatus); }, [filterProject, filterStatus]);

  const openCount = items.filter(i => i.status === 'open').length;
  const doneCount = items.filter(i => i.status === 'done').length;
  const verifiedCount = items.filter(i => i.status === 'verified').length;

  return (
    <div>
      <div style={styles.topRow}>
        <div>
          <h2 style={styles.heading}>Punchlist</h2>
          {items.length > 0 && (
            <p style={styles.summary}>
              {openCount} open · {doneCount} done · {verifiedCount} verified
            </p>
          )}
        </div>
        <button style={styles.newBtn} onClick={() => setShowForm(true)}>+ Add Item</button>
      </div>

      {showForm && (
        <div style={styles.formCard}>
          <AddItemForm
            projects={projects}
            workers={workers}
            isAdmin={isAdmin}
            onAdded={item => { setItems(prev => [item, ...prev]); setShowForm(false); }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <div style={styles.filters}>
        <select style={styles.filterSelect} value={filterProject} onChange={e => setFilterProject(e.target.value)}>
          <option value="">All projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select style={styles.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {loading ? (
        <p style={styles.hint}>Loading...</p>
      ) : items.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>✅</div>
          <p style={styles.emptyText}>No punchlist items. Add items that need to be corrected before project closeout.</p>
        </div>
      ) : (
        <div style={styles.list}>
          {items.map(item => (
            <PunchItem
              key={item.id}
              item={item}
              isAdmin={isAdmin}
              workers={workers}
              onUpdated={updated => setItems(prev => prev.map(i => i.id === updated.id ? updated : i))}
              onDeleted={id => setItems(prev => prev.filter(i => i.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  topRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 },
  heading: { fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 },
  summary: { fontSize: 13, color: '#6b7280', margin: '4px 0 0' },
  newBtn: { background: '#059669', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0 },
  filters: { display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  filterSelect: { padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff', flex: 1, minWidth: 140 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: { background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' },
  itemRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer' },
  priorityDot: { fontSize: 14, flexShrink: 0 },
  itemMain: { flex: 1, minWidth: 0 },
  itemTitle: { fontWeight: 600, fontSize: 14, color: '#111827', display: 'block', marginBottom: 4 },
  itemMeta: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  metaTag: { background: '#ede9fe', color: '#6d28d9', padding: '1px 7px', borderRadius: 10, fontWeight: 600, fontSize: 11 },
  metaLoc: { fontSize: 12, color: '#6b7280' },
  metaAssign: { fontSize: 12, color: '#6b7280' },
  itemRight: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  statusBadge: { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 10 },
  chevron: { fontSize: 10, color: '#9ca3af' },
  itemBody: { padding: '0 14px 14px', borderTop: '1px solid #f3f4f6' },
  desc: { fontSize: 13, color: '#374151', lineHeight: 1.6, margin: '10px 0', whiteSpace: 'pre-wrap' },
  resolvedNote: { fontSize: 12, color: '#059669', margin: '0 0 10px', fontWeight: 600 },
  assignRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  smallSelect: { padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, background: '#fff' },
  itemActions: { display: 'flex', gap: 8 },
  advanceBtn: { background: '#059669', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' },
  deleteBtn: { background: 'none', border: '1px solid #fca5a5', color: '#ef4444', padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  // Form
  formCard: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 20 },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  formTitle: { fontSize: 17, fontWeight: 700, margin: 0 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: '#6b7280' },
  input: { padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, width: '100%' },
  textarea: { padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, width: '100%' },
  error: { color: '#ef4444', fontSize: 13, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', margin: 0 },
  formActions: { display: 'flex', gap: 10 },
  submitBtn: { background: '#059669', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  cancelBtn: { background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', padding: '10px 20px', borderRadius: 8, fontSize: 14, cursor: 'pointer' },
  // Empty / misc
  empty: { textAlign: 'center', padding: '60px 20px' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  hint: { color: '#9ca3af', fontSize: 14 },
};
