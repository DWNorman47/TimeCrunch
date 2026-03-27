import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';

const TYPE_LABELS = {
  'injury': '🤕 Injury',
  'near-miss': '⚠️ Near-Miss',
  'property-damage': '🔧 Property Damage',
  'environmental': '🌿 Environmental',
  'other': '📝 Other',
};

const TREATMENT_LABELS = {
  'none': 'No treatment needed',
  'first-aid': 'First aid on-site',
  'medical-attention': 'Medical attention (off-site)',
  'hospitalization': 'Hospitalization',
};

function today() {
  return new Date().toLocaleDateString('en-CA');
}

// ── Incident Form ─────────────────────────────────────────────────────────────

function IncidentForm({ projects, onSubmitted, onCancel }) {
  const [form, setForm] = useState({
    incident_date: today(),
    incident_time: '',
    type: 'near-miss',
    project_id: '',
    injured_name: '',
    body_part: '',
    treatment: 'none',
    work_stopped: false,
    description: '',
    witnesses: '',
    corrective_action: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isInjury = form.type === 'injury';

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.description.trim()) { setError('Description is required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = { ...form };
      if (!isInjury) { delete payload.injured_name; delete payload.body_part; delete payload.treatment; }
      if (!payload.project_id) delete payload.project_id;
      if (!payload.incident_time) delete payload.incident_time;
      const r = await api.post('/incidents', payload);
      onSubmitted(r.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit report');
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <h3 style={styles.formTitle}>New Incident Report</h3>

      <div style={styles.row}>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Date *</label>
          <input style={styles.input} type="date" value={form.incident_date} onChange={e => set('incident_date', e.target.value)} required />
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Time <span style={styles.optional}>(optional)</span></label>
          <input style={styles.input} type="time" value={form.incident_time} onChange={e => set('incident_time', e.target.value)} />
        </div>
      </div>

      <div style={styles.row}>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Incident Type *</label>
          <select style={styles.input} value={form.type} onChange={e => set('type', e.target.value)}>
            {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {projects.length > 0 && (
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Project <span style={styles.optional}>(optional)</span></label>
            <select style={styles.input} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {isInjury && (
        <>
          <div style={styles.row}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Injured Person's Name</label>
              <input style={styles.input} type="text" placeholder="Full name" value={form.injured_name} onChange={e => set('injured_name', e.target.value)} />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Body Part Affected</label>
              <input style={styles.input} type="text" placeholder="e.g. Left hand, lower back" value={form.body_part} onChange={e => set('body_part', e.target.value)} />
            </div>
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Treatment</label>
            <select style={styles.input} value={form.treatment} onChange={e => set('treatment', e.target.value)}>
              {Object.entries(TREATMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </>
      )}

      <div style={styles.fieldGroup}>
        <label style={styles.label}>Description *</label>
        <textarea style={styles.textarea} rows={4} placeholder="Describe what happened, where, and how…" value={form.description} onChange={e => set('description', e.target.value)} required />
      </div>

      <div style={styles.fieldGroup}>
        <label style={styles.label}>Witnesses <span style={styles.optional}>(optional)</span></label>
        <input style={styles.input} type="text" placeholder="Names of any witnesses" value={form.witnesses} onChange={e => set('witnesses', e.target.value)} />
      </div>

      <div style={styles.fieldGroup}>
        <label style={styles.label}>Corrective Action Taken <span style={styles.optional}>(optional)</span></label>
        <textarea style={styles.textarea} rows={3} placeholder="What was done to address the situation…" value={form.corrective_action} onChange={e => set('corrective_action', e.target.value)} />
      </div>

      <label style={styles.checkRow}>
        <input type="checkbox" checked={form.work_stopped} onChange={e => set('work_stopped', e.target.checked)} />
        <span style={styles.checkLabel}>Work was stopped as a result of this incident</span>
      </label>

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.formActions}>
        <button style={styles.submitBtn} type="submit" disabled={saving}>
          {saving ? 'Submitting…' : 'Submit Report'}
        </button>
        <button style={styles.cancelBtn} type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ── Incident Card ─────────────────────────────────────────────────────────────

function IncidentCard({ incident, isAdmin, onClosed, onDeleted }) {
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleClose = async () => {
    setClosing(true);
    try {
      await api.patch(`/incidents/${incident.id}/close`);
      onClosed(incident.id);
    } finally { setClosing(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this incident report?')) return;
    setDeleting(true);
    try {
      await api.delete(`/incidents/${incident.id}`);
      onDeleted(incident.id);
    } finally { setDeleting(false); }
  };

  const typeLabel = TYPE_LABELS[incident.type] || incident.type;
  const isInjury = incident.type === 'injury';

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader} onClick={() => setExpanded(e => !e)}>
        <div style={styles.cardLeft}>
          {isAdmin && <div style={styles.workerName}>{incident.reporter_name}</div>}
          <div style={styles.cardTitle}>{typeLabel}</div>
          <div style={styles.cardMeta}>
            <span>{incident.incident_date?.toString().substring(0, 10)}{incident.incident_time ? ` · ${incident.incident_time.substring(0, 5)}` : ''}</span>
            {incident.project_name && <span style={styles.projectTag}>{incident.project_name}</span>}
            {incident.work_stopped && <span style={styles.stoppedTag}>Work Stopped</span>}
          </div>
        </div>
        <div style={styles.cardRight}>
          <span style={incident.status === 'closed' ? styles.badgeClosed : styles.badgeOpen}>
            {incident.status === 'closed' ? 'Closed' : 'Open'}
          </span>
          <span style={styles.chevron}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={styles.cardBody}>
          {isInjury && (incident.injured_name || incident.body_part || incident.treatment) && (
            <div style={styles.injuryBox}>
              {incident.injured_name && <div><strong>Injured:</strong> {incident.injured_name}</div>}
              {incident.body_part && <div><strong>Body part:</strong> {incident.body_part}</div>}
              {incident.treatment && <div><strong>Treatment:</strong> {TREATMENT_LABELS[incident.treatment] || incident.treatment}</div>}
            </div>
          )}

          <div style={styles.section}>
            <div style={styles.sectionLabel}>Description</div>
            <p style={styles.sectionText}>{incident.description}</p>
          </div>

          {incident.witnesses && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Witnesses</div>
              <p style={styles.sectionText}>{incident.witnesses}</p>
            </div>
          )}

          {incident.corrective_action && (
            <div style={styles.section}>
              <div style={styles.sectionLabel}>Corrective Action</div>
              <p style={styles.sectionText}>{incident.corrective_action}</p>
            </div>
          )}

          <div style={styles.cardActions}>
            {isAdmin && incident.status !== 'closed' && (
              <button style={styles.closeBtn} onClick={handleClose} disabled={closing}>
                {closing ? '…' : '✓ Close Incident'}
              </button>
            )}
            {(!isAdmin || incident.status !== 'closed') && (
              <button style={styles.deleteBtn} onClick={handleDelete} disabled={deleting}>
                {deleting ? '…' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function IncidentReports({ projects }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({});

  const loadIncidents = async (f = filters) => {
    try {
      const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
      const r = await api.get('/incidents', { params });
      setIncidents(r.data);
    } catch {}
  };

  useEffect(() => { loadIncidents().finally(() => setLoading(false)); }, []);
  useEffect(() => { if (!loading) loadIncidents(filters); }, [filters]);

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const openCount = incidents.filter(i => i.status === 'open').length;

  return (
    <div>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.heading}>Incident Reports</h1>
          {openCount > 0 && (
            <p style={styles.openNote}>{openCount} open incident{openCount !== 1 ? 's' : ''}</p>
          )}
        </div>
        {!showForm && (
          <button style={styles.newBtn} onClick={() => setShowForm(true)}>+ New Incident</button>
        )}
      </div>

      {showForm && (
        <div style={styles.formCard}>
          <IncidentForm
            projects={projects}
            onSubmitted={r => { setIncidents(prev => [r, ...prev]); setShowForm(false); }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {isAdmin && (
        <div style={styles.filterBar}>
          <select style={styles.filterSelect} value={filters.type || ''} onChange={e => setFilter('type', e.target.value)}>
            <option value="">All types</option>
            {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select style={styles.filterSelect} value={filters.status || ''} onChange={e => setFilter('status', e.target.value)}>
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
          <input style={styles.filterInput} type="date" value={filters.from || ''} onChange={e => setFilter('from', e.target.value)} title="From date" />
          <input style={styles.filterInput} type="date" value={filters.to || ''} onChange={e => setFilter('to', e.target.value)} title="To date" />
        </div>
      )}

      {loading ? (
        <p style={styles.hint}>Loading…</p>
      ) : incidents.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>🦺</div>
          <p style={styles.emptyText}>{isAdmin ? 'No incident reports yet.' : 'No incidents reported. Tap + New Incident to file a report.'}</p>
        </div>
      ) : (
        <div style={styles.list}>
          {incidents.map(i => (
            <IncidentCard
              key={i.id}
              incident={i}
              isAdmin={isAdmin}
              onClosed={id => setIncidents(prev => prev.map(r => r.id === id ? { ...r, status: 'closed' } : r))}
              onDeleted={id => setIncidents(prev => prev.filter(r => r.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  topRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12 },
  heading: { fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 },
  openNote: { fontSize: 13, color: '#d97706', fontWeight: 600, margin: '4px 0 0' },
  newBtn: { background: '#059669', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0 },
  formCard: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 20 },
  filterBar: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  filterSelect: { padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff', color: '#374151', flex: 1, minWidth: 120 },
  filterInput: { padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff', color: '#374151' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  empty: { textAlign: 'center', padding: '60px 20px' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  hint: { color: '#9ca3af', fontSize: 14 },
  // Card
  card: { background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 16px', cursor: 'pointer', gap: 12 },
  cardLeft: { flex: 1, minWidth: 0 },
  cardRight: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  workerName: { fontSize: 12, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 2 },
  cardTitle: { fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 4 },
  cardMeta: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6b7280', flexWrap: 'wrap' },
  projectTag: { background: '#ede9fe', color: '#6d28d9', padding: '1px 7px', borderRadius: 10, fontWeight: 600 },
  stoppedTag: { background: '#fee2e2', color: '#dc2626', padding: '1px 7px', borderRadius: 10, fontWeight: 700 },
  chevron: { fontSize: 10, color: '#9ca3af' },
  badgeOpen: { fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: 10 },
  badgeClosed: { fontSize: 11, fontWeight: 700, color: '#065f46', background: '#d1fae5', padding: '2px 8px', borderRadius: 10 },
  cardBody: { padding: '0 16px 14px', borderTop: '1px solid #f3f4f6' },
  injuryBox: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', margin: '12px 0', fontSize: 13, lineHeight: 1.8, color: '#374151' },
  section: { marginTop: 12 },
  sectionLabel: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 4 },
  sectionText: { fontSize: 14, color: '#374151', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' },
  cardActions: { display: 'flex', gap: 8, marginTop: 14 },
  closeBtn: { background: '#059669', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' },
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
  checkRow: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' },
  checkLabel: { fontSize: 14, color: '#374151' },
  error: { color: '#ef4444', fontSize: 13, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', margin: 0 },
  formActions: { display: 'flex', gap: 10 },
  submitBtn: { background: '#059669', color: '#fff', border: 'none', padding: '11px 22px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  cancelBtn: { background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', padding: '11px 22px', borderRadius: 8, fontSize: 14, cursor: 'pointer' },
};
