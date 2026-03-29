import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { RFIDownloadLink } from './RFIPdf';

function today() { return new Date().toLocaleDateString('en-CA'); }

const STATUS_STYLES = {
  open:     { color: '#92400e', background: '#fef3c7' },
  answered: { color: '#065f46', background: '#d1fae5' },
  closed:   { color: '#374151', background: '#f3f4f6' },
};

const STATUS_LABELS = { open: 'Open', answered: 'Answered', closed: 'Closed' };

// ── RFI Form ──────────────────────────────────────────────────────────────────

function RFIForm({ initial, projects, onSaved, onCancel }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState({
    project_id: initial?.project_id ?? '',
    subject: initial?.subject ?? '',
    description: initial?.description ?? '',
    directed_to: initial?.directed_to ?? '',
    submitted_by: initial?.submitted_by ?? '',
    date_submitted: initial?.date_submitted?.toString().substring(0, 10) ?? today(),
    date_due: initial?.date_due?.toString().substring(0, 10) ?? '',
    response: initial?.response ?? '',
    status: initial?.status ?? 'open',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.subject.trim()) { setError('Subject is required.'); return; }
    setSaving(true); setError('');
    try {
      const r = isEdit
        ? await api.patch(`/rfis/${initial.id}`, form)
        : await api.post('/rfis', form);
      if (!isEdit && r.data?.offline) {
        onSaved({ id: 'pending-' + Date.now(), pending: true, ...form, rfi_number: '?', status: 'open' }, false);
        return;
      }
      onSaved(r.data, isEdit);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <h3 style={styles.formTitle}>{isEdit ? `Edit RFI #${initial.rfi_number}` : 'New RFI'}</h3>

      <div style={styles.row}>
        {projects.length > 0 && (
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Project</label>
            <select style={styles.input} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div style={{ ...styles.fieldGroup, flex: 3 }}>
          <label style={styles.label}>Subject *</label>
          <input style={styles.input} type="text" placeholder="Brief description of the question or request" value={form.subject} onChange={e => set('subject', e.target.value)} required />
        </div>
      </div>

      <div style={styles.fieldGroup}>
        <label style={styles.label}>Description <span style={styles.optional}>(optional)</span></label>
        <textarea style={styles.textarea} rows={3} placeholder="Detailed description, background, or relevant context…" value={form.description} onChange={e => set('description', e.target.value)} />
      </div>

      <div style={styles.row}>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Directed To</label>
          <input style={styles.input} type="text" placeholder="e.g. Architect, Structural Engineer, Owner" value={form.directed_to} onChange={e => set('directed_to', e.target.value)} />
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Submitted By</label>
          <input style={styles.input} type="text" placeholder="Name or company" value={form.submitted_by} onChange={e => set('submitted_by', e.target.value)} />
        </div>
      </div>

      <div style={styles.row}>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Date Submitted</label>
          <input style={styles.input} type="date" value={form.date_submitted} onChange={e => set('date_submitted', e.target.value)} />
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Response Due <span style={styles.optional}>(optional)</span></label>
          <input style={styles.input} type="date" value={form.date_due} onChange={e => set('date_due', e.target.value)} />
        </div>
        {isEdit && (
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Status</label>
            <select style={styles.input} value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="open">Open</option>
              <option value="answered">Answered</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        )}
      </div>

      {isEdit && (
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Response</label>
          <textarea style={styles.textarea} rows={3} placeholder="Enter the response or answer received…" value={form.response} onChange={e => set('response', e.target.value)} />
        </div>
      )}

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.formActions}>
        <button style={styles.submitBtn} type="submit" disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create RFI'}</button>
        <button style={styles.cancelBtn} type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ── RFI Card ──────────────────────────────────────────────────────────────────

function RFICard({ rfi, isAdmin, companyName, onEdit, onDeleted }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete RFI #${rfi.rfi_number}?`)) return;
    setDeleting(true);
    try { await api.delete(`/rfis/${rfi.id}`); onDeleted(rfi.id); }
    catch { alert('Failed to delete'); }
    finally { setDeleting(false); }
  };

  const isOverdue = rfi.date_due && rfi.status === 'open' && new Date(rfi.date_due) < new Date();
  const statusStyle = STATUS_STYLES[rfi.status] || STATUS_STYLES.open;

  return (
    <div style={{ ...styles.card, ...(isOverdue ? styles.cardOverdue : {}) }}>
      <div style={styles.cardHeader} onClick={() => setExpanded(e => !e)}>
        <div style={styles.rfiNumber}>#{rfi.rfi_number}</div>
        <div style={styles.cardMiddle}>
          <div style={styles.subject}>
            {rfi.subject}
            {rfi.pending && <span style={styles.pendingBadge}>⏳ Pending sync</span>}
          </div>
          <div style={styles.meta}>
            {rfi.project_name && <span style={styles.projectTag}>{rfi.project_name}</span>}
            {rfi.directed_to && <span>→ {rfi.directed_to}</span>}
            <span>{rfi.date_submitted?.toString().substring(0, 10)}</span>
            {rfi.date_due && (
              <span style={isOverdue ? styles.overdueDate : styles.dueDate}>
                {isOverdue ? '⚠ ' : ''}Due {rfi.date_due?.toString().substring(0, 10)}
              </span>
            )}
          </div>
        </div>
        <div style={styles.cardRight}>
          <span style={{ ...styles.statusBadge, ...statusStyle }}>{STATUS_LABELS[rfi.status]}</span>
          <span style={styles.chevron}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={styles.cardBody}>
          {rfi.description && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Description</div>
              <p style={styles.sectionText}>{rfi.description}</p>
            </div>
          )}

          {rfi.submitted_by && (
            <div style={styles.inlineMeta}>
              <span style={styles.metaKey}>Submitted by:</span> {rfi.submitted_by}
            </div>
          )}

          {rfi.response ? (
            <div style={styles.responseBox}>
              <div style={styles.responseLabel}>Response</div>
              <p style={styles.responseText}>{rfi.response}</p>
            </div>
          ) : rfi.status === 'open' ? (
            <p style={styles.noResponse}>No response yet.</p>
          ) : null}

          {!rfi.pending && (
            <div style={styles.cardActions}>
              <RFIDownloadLink rfi={rfi} companyName={companyName} />
              {isAdmin && (
                <>
                  <button style={styles.editBtn} onClick={() => onEdit(rfi)}>
                    {rfi.status === 'open' && !rfi.response ? '+ Add Response' : 'Edit'}
                  </button>
                  <button style={styles.deleteBtn} onClick={handleDelete} disabled={deleting}>{deleting ? '…' : 'Delete'}</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function RFITracking({ projects }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const { onSync } = useOffline() || {};

  const [rfis, setRfis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({});
  const [companyName, setCompanyName] = useState('');

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const loadRFIs = async (f = filters) => {
    try {
      const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
      const r = await api.get('/rfis', { params });
      setRfis(r.data);
    } catch {}
  };

  useEffect(() => {
    loadRFIs().finally(() => setLoading(false));
    api.get('/company-info').then(r => setCompanyName(r.data.name || '')).catch(() => {});
  }, []);
  useEffect(() => { if (!loading) loadRFIs(filters); }, [filters]);
  useEffect(() => { if (!onSync) return; return onSync(count => { if (count > 0) loadRFIs(); }); }, [onSync]);

  const handleSaved = (rfi, isEdit) => {
    if (isEdit) {
      setRfis(prev => prev.map(r => r.id === rfi.id ? rfi : r));
      setEditing(null);
    } else {
      setRfis(prev => [rfi, ...prev]);
      setShowForm(false);
    }
  };

  const openCount = rfis.filter(r => r.status === 'open').length;
  const overdueCount = rfis.filter(r => r.date_due && r.status === 'open' && new Date(r.date_due) < new Date()).length;

  return (
    <div>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.heading}>RFI Tracking</h1>
          <p style={styles.summary}>
            {rfis.length} RFI{rfis.length !== 1 ? 's' : ''} · {openCount} open
            {overdueCount > 0 && <span style={styles.overdueNote}> · {overdueCount} overdue</span>}
          </p>
        </div>
        {isAdmin && !showForm && !editing && (
          <button style={styles.newBtn} onClick={() => setShowForm(true)}>+ New RFI</button>
        )}
      </div>

      {(showForm || editing) && (
        <div style={styles.formCard}>
          <RFIForm
            initial={editing || null}
            projects={projects}
            onSaved={handleSaved}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        </div>
      )}

      <div style={styles.filterBar}>
        <select style={styles.filterSelect} value={filters.status || ''} onChange={e => setFilter('status', e.target.value)}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="answered">Answered</option>
          <option value="closed">Closed</option>
        </select>
        {projects.length > 0 && (
          <select style={styles.filterSelect} value={filters.project_id || ''} onChange={e => setFilter('project_id', e.target.value)}>
            <option value="">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <input style={styles.filterInput} type="date" value={filters.from || ''} onChange={e => setFilter('from', e.target.value)} title="From date" />
        <input style={styles.filterInput} type="date" value={filters.to || ''} onChange={e => setFilter('to', e.target.value)} title="To date" />
      </div>

      {loading ? (
        <p style={styles.hint}>Loading…</p>
      ) : rfis.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>📋</div>
          <p style={styles.emptyText}>{isAdmin ? 'No RFIs yet. Create one to start tracking.' : 'No RFIs on file.'}</p>
        </div>
      ) : (
        <div style={styles.list}>
          {rfis.map(r => (
            <RFICard
              key={r.id}
              rfi={r}
              isAdmin={isAdmin}
              companyName={companyName}
              onEdit={r => { setEditing(r); setShowForm(false); }}
              onDeleted={id => setRfis(prev => prev.filter(r => r.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  topRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 },
  heading: { fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 },
  summary: { fontSize: 13, color: '#6b7280', margin: '4px 0 0' },
  overdueNote: { color: '#ef4444', fontWeight: 700 },
  newBtn: { background: '#059669', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0 },
  formCard: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 20 },
  filterBar: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  filterSelect: { padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff', color: '#374151', flex: 1, minWidth: 120 },
  filterInput: { padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff', color: '#374151' },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  hint: { color: '#9ca3af', fontSize: 14 },
  empty: { textAlign: 'center', padding: '60px 20px' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  // Card
  card: { background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden' },
  cardOverdue: { boxShadow: '0 1px 6px rgba(0,0,0,0.07), inset 3px 0 0 #ef4444' },
  cardHeader: { display: 'flex', alignItems: 'flex-start', padding: '13px 16px', cursor: 'pointer', gap: 12 },
  rfiNumber: { fontSize: 13, fontWeight: 800, color: '#1a56db', flexShrink: 0, minWidth: 36, marginTop: 1 },
  cardMiddle: { flex: 1, minWidth: 0 },
  subject: { fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 4 },
  meta: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: '#6b7280' },
  projectTag: { background: '#ede9fe', color: '#6d28d9', padding: '1px 7px', borderRadius: 10, fontWeight: 600 },
  dueDate: { color: '#6b7280' },
  overdueDate: { color: '#ef4444', fontWeight: 700 },
  cardRight: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  statusBadge: { fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 },
  chevron: { fontSize: 10, color: '#9ca3af' },
  cardBody: { padding: '0 16px 14px', borderTop: '1px solid #f3f4f6' },
  section: { marginTop: 12 },
  sectionLabel: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 4 },
  sectionText: { fontSize: 14, color: '#374151', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' },
  inlineMeta: { fontSize: 13, color: '#374151', marginTop: 10 },
  metaKey: { fontWeight: 600, color: '#6b7280' },
  responseBox: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginTop: 12 },
  responseLabel: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#059669', marginBottom: 6 },
  responseText: { fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' },
  noResponse: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic', marginTop: 10 },
  cardActions: { display: 'flex', gap: 8, marginTop: 14 },
  editBtn: { background: '#f3f4f6', border: 'none', color: '#374151', padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  deleteBtn: { background: 'none', border: '1px solid #fca5a5', color: '#ef4444', padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  // Form
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  formTitle: { fontSize: 17, fontWeight: 700, margin: 0 },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 180 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151' },
  optional: { fontWeight: 400, color: '#9ca3af' },
  input: { padding: '9px 11px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, background: '#fff' },
  textarea: { padding: '9px 11px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 },
  error: { color: '#ef4444', fontSize: 13, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', margin: 0 },
  formActions: { display: 'flex', gap: 10 },
  submitBtn: { background: '#059669', color: '#fff', border: 'none', padding: '11px 22px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  cancelBtn: { background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', padding: '11px 22px', borderRadius: 8, fontSize: 14, cursor: 'pointer' },
  pendingBadge: { fontSize: 10, fontWeight: 600, color: '#92400e', background: '#fef3c7', padding: '1px 6px', borderRadius: 6, marginLeft: 8, verticalAlign: 'middle' },
};
