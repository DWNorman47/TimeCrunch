import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';

function today() {
  return new Date().toLocaleDateString('en-CA');
}

const BLANK = {
  report_date: today(), project_id: '', sub_company: '',
  foreman_name: '', headcount: '', work_performed: '', notes: '',
};

// ── Form (create or edit) ─────────────────────────────────────────────────────

function SubReportForm({ projects, initial = BLANK, onSaved, onCancel }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isEdit = !!initial.id;

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.sub_company.trim()) { setError('Sub-contractor company name is required.'); return; }
    setSaving(true); setError('');
    try {
      const r = isEdit
        ? await api.patch(`/sub-reports/${initial.id}`, form)
        : await api.post('/sub-reports', form);
      onSaved(r.data, isEdit);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save report');
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <h3 style={styles.formTitle}>{isEdit ? 'Edit Sub Report' : 'New Sub Report'}</h3>

      <div style={styles.row}>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Date *</label>
          <input style={styles.input} type="date" value={form.report_date} onChange={e => set('report_date', e.target.value)} required />
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
      </div>

      <div style={styles.row}>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Sub-Contractor Company *</label>
          <input style={styles.input} type="text" placeholder="Company name" value={form.sub_company} onChange={e => set('sub_company', e.target.value)} required />
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Foreman / Supervisor</label>
          <input style={styles.input} type="text" placeholder="Name on site" value={form.foreman_name} onChange={e => set('foreman_name', e.target.value)} />
        </div>
      </div>

      <div style={styles.fieldGroup}>
        <label style={styles.label}>Headcount <span style={styles.optional}>(workers on site)</span></label>
        <input style={{ ...styles.input, maxWidth: 120 }} type="number" min="0" placeholder="0" value={form.headcount} onChange={e => set('headcount', e.target.value)} />
      </div>

      <div style={styles.fieldGroup}>
        <label style={styles.label}>Work Performed</label>
        <textarea style={styles.textarea} rows={3} placeholder="What work did this sub perform today?" value={form.work_performed} onChange={e => set('work_performed', e.target.value)} />
      </div>

      <div style={styles.fieldGroup}>
        <label style={styles.label}>Notes <span style={styles.optional}>(optional)</span></label>
        <textarea style={styles.textarea} rows={2} placeholder="Issues, delays, anything else to note…" value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.formActions}>
        <button style={styles.submitBtn} type="submit" disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Report'}</button>
        <button style={styles.cancelBtn} type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function SubCard({ report, onEdit, onDeleted }) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Delete this sub report?')) return;
    setDeleting(true);
    try {
      await api.delete(`/sub-reports/${report.id}`);
      onDeleted(report.id);
    } finally { setDeleting(false); }
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader} onClick={() => setExpanded(e => !e)}>
        <div style={styles.cardLeft}>
          <div style={styles.subName}>{report.sub_company}</div>
          <div style={styles.cardMeta}>
            <span>{report.report_date?.toString().substring(0, 10)}</span>
            {report.project_name && <span style={styles.projectTag}>{report.project_name}</span>}
            {report.headcount > 0 && <span style={styles.headcountTag}>👷 {report.headcount}</span>}
            {report.foreman_name && <span style={styles.foremanTag}>{report.foreman_name}</span>}
          </div>
        </div>
        <span style={styles.chevron}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={styles.cardBody}>
          {report.work_performed && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Work Performed</div>
              <p style={styles.sectionText}>{report.work_performed}</p>
            </div>
          )}
          {report.notes && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Notes</div>
              <p style={styles.sectionText}>{report.notes}</p>
            </div>
          )}
          <div style={styles.cardActions}>
            <button style={styles.editBtn} onClick={() => onEdit(report)}>Edit</button>
            <button style={styles.deleteBtn} onClick={handleDelete} disabled={deleting}>{deleting ? '…' : 'Delete'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SubReports({ projects }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({});

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const loadReports = async (f = filters) => {
    try {
      const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
      const r = await api.get('/sub-reports', { params });
      setReports(r.data);
    } catch {}
  };

  useEffect(() => { loadReports().finally(() => setLoading(false)); }, []);
  useEffect(() => { if (!loading) loadReports(filters); }, [filters]);

  const handleSaved = (report, isEdit) => {
    if (isEdit) {
      setReports(prev => prev.map(r => r.id === report.id ? report : r));
      setEditing(null);
    } else {
      setReports(prev => [report, ...prev]);
      setShowForm(false);
    }
  };

  // Unique sub company names for filter
  const subNames = [...new Set(reports.map(r => r.sub_company))].sort();

  return (
    <div>
      <div style={styles.topRow}>
        <h1 style={styles.heading}>Sub Reports</h1>
        {!showForm && !editing && (
          <button style={styles.newBtn} onClick={() => setShowForm(true)}>+ Add Report</button>
        )}
      </div>

      {(showForm || editing) && (
        <div style={styles.formCard}>
          <SubReportForm
            projects={projects}
            initial={editing || BLANK}
            onSaved={handleSaved}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        </div>
      )}

      <div style={styles.filterBar}>
        {projects.length > 0 && (
          <select style={styles.filterSelect} value={filters.project_id || ''} onChange={e => setFilter('project_id', e.target.value)}>
            <option value="">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        {subNames.length > 1 && (
          <select style={styles.filterSelect} value={filters.sub_company || ''} onChange={e => setFilter('sub_company', e.target.value)}>
            <option value="">All subs</option>
            {subNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
        <input style={styles.filterInput} type="date" value={filters.from || ''} onChange={e => setFilter('from', e.target.value)} title="From date" />
        <input style={styles.filterInput} type="date" value={filters.to || ''} onChange={e => setFilter('to', e.target.value)} title="To date" />
      </div>

      {loading ? (
        <p style={styles.hint}>Loading…</p>
      ) : reports.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>🏗️</div>
          <p style={styles.emptyText}>No sub reports yet. Log what each sub-contractor did on site.</p>
        </div>
      ) : (
        <div style={styles.list}>
          {reports.map(r => (
            <SubCard
              key={r.id}
              report={r}
              onEdit={r => { setEditing({ ...r, project_id: r.project_id || '', headcount: r.headcount ?? '' }); setShowForm(false); }}
              onDeleted={id => setReports(prev => prev.filter(r => r.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  topRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  heading: { fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 },
  newBtn: { background: '#059669', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  formCard: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 20 },
  filterBar: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  filterSelect: { padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff', color: '#374151', flex: 1, minWidth: 130 },
  filterInput: { padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff', color: '#374151' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  hint: { color: '#9ca3af', fontSize: 14 },
  empty: { textAlign: 'center', padding: '60px 20px' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  // Card
  card: { background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 16px', cursor: 'pointer', gap: 12 },
  cardLeft: { flex: 1, minWidth: 0 },
  subName: { fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 4 },
  cardMeta: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6b7280', flexWrap: 'wrap' },
  projectTag: { background: '#ede9fe', color: '#6d28d9', padding: '1px 7px', borderRadius: 10, fontWeight: 600 },
  headcountTag: { background: '#fef3c7', color: '#92400e', padding: '1px 7px', borderRadius: 10, fontWeight: 600 },
  foremanTag: { color: '#059669', fontWeight: 600 },
  chevron: { fontSize: 10, color: '#9ca3af', flexShrink: 0 },
  cardBody: { padding: '0 16px 14px', borderTop: '1px solid #f3f4f6' },
  section: { marginTop: 12 },
  sectionLabel: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 4 },
  sectionText: { fontSize: 14, color: '#374151', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' },
  cardActions: { display: 'flex', gap: 8, marginTop: 14 },
  editBtn: { background: '#f3f4f6', border: 'none', color: '#374151', padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  deleteBtn: { background: 'none', border: '1px solid #fca5a5', color: '#ef4444', padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  // Form
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
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
};
