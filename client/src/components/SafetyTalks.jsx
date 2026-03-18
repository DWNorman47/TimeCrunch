import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';

function fmtDate(str) {
  return new Date(str + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function NewTalkForm({ projects, onAdded, onCancel }) {
  const today = new Date().toLocaleDateString('en-CA');
  const [form, setForm] = useState({ title: '', content: '', given_by: '', talk_date: today, project_id: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async e => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      const r = await api.post('/safety-talks', form);
      onAdded(r.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} style={styles.form}>
      <h3 style={styles.formTitle}>New Toolbox Talk</h3>
      <div style={styles.formGrid}>
        <div style={{ ...styles.fieldGroup, gridColumn: '1 / -1' }}>
          <label style={styles.label}>Topic / Title *</label>
          <input style={styles.input} type="text" placeholder="e.g. Ladder Safety, PPE Requirements, Fall Protection" value={form.title} onChange={e => set('title', e.target.value)} />
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Date</label>
          <input style={styles.input} type="date" value={form.talk_date} onChange={e => set('talk_date', e.target.value)} />
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
          <label style={styles.label}>Given by</label>
          <input style={styles.input} type="text" placeholder="Foreman or safety officer name" value={form.given_by} onChange={e => set('given_by', e.target.value)} />
        </div>
        <div style={{ ...styles.fieldGroup, gridColumn: '1 / -1' }}>
          <label style={styles.label}>Talk Content / Notes</label>
          <textarea style={styles.textarea} rows={5} placeholder="Key points covered, hazards discussed, corrective actions..." value={form.content} onChange={e => set('content', e.target.value)} />
        </div>
      </div>
      {error && <p style={styles.error}>{error}</p>}
      <div style={styles.formActions}>
        <button style={styles.submitBtn} type="submit" disabled={saving}>{saving ? 'Saving...' : 'Create Talk'}</button>
        <button style={styles.cancelBtn} type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function TalkCard({ talk: initialTalk, isAdmin, onDeleted }) {
  const { user } = useAuth();
  const [talk, setTalk] = useState(initialTalk);
  const [expanded, setExpanded] = useState(false);
  const [signing, setSigning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [signoffs, setSignoffs] = useState(null); // loaded on expand

  const loadSignoffs = async () => {
    try {
      const r = await api.get(`/safety-talks/${talk.id}`);
      setSignoffs(r.data.signoffs || []);
    } catch {}
  };

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && signoffs === null) loadSignoffs();
  };

  const alreadySigned = signoffs?.some(s => s.worker_id === user?.id);

  const handleSignoff = async () => {
    setSigning(true);
    try {
      await api.post(`/safety-talks/${talk.id}/signoff`);
      await loadSignoffs();
      setTalk(t => ({ ...t, signoff_count: parseInt(t.signoff_count) + 1 }));
    } finally { setSigning(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this toolbox talk?')) return;
    setDeleting(true);
    try { await api.delete(`/safety-talks/${talk.id}`); onDeleted(talk.id); }
    catch { alert('Failed to delete'); }
    finally { setDeleting(false); }
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader} onClick={handleExpand}>
        <div style={styles.cardLeft}>
          <div style={styles.talkIcon}>🦺</div>
          <div>
            <div style={styles.talkTitle}>{talk.title}</div>
            <div style={styles.talkMeta}>
              {fmtDate(talk.talk_date)}
              {talk.project_name && <span style={styles.projectTag}>{talk.project_name}</span>}
              {talk.given_by && <span style={styles.givenBy}>by {talk.given_by}</span>}
            </div>
          </div>
        </div>
        <div style={styles.cardRight}>
          <span style={styles.signoffBadge} title="Workers signed">
            ✍️ {talk.signoff_count}
          </span>
          <span style={styles.chevron}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={styles.cardBody}>
          {talk.content && <p style={styles.content}>{talk.content}</p>}

          <div style={styles.signoffSection}>
            <div style={styles.signoffHeader}>
              <span style={styles.signoffTitle}>Sign-offs ({signoffs?.length ?? talk.signoff_count})</span>
              {!isAdmin && !alreadySigned && (
                <button style={styles.signBtn} onClick={handleSignoff} disabled={signing}>
                  {signing ? '...' : '✍️ Sign Off'}
                </button>
              )}
              {!isAdmin && alreadySigned && (
                <span style={styles.signedNote}>✓ You've signed this talk</span>
              )}
            </div>
            {signoffs === null ? (
              <p style={styles.hint}>Loading...</p>
            ) : signoffs.length === 0 ? (
              <p style={styles.hint}>No sign-offs yet.</p>
            ) : (
              <div style={styles.signoffList}>
                {signoffs.map((s, i) => (
                  <span key={i} style={styles.signoffChip}>
                    {s.full_name || s.worker_name}
                    <span style={styles.signoffTime}>
                      {new Date(s.signed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {isAdmin && (
            <div style={styles.cardActions}>
              <button style={styles.deleteBtn} onClick={handleDelete} disabled={deleting}>
                {deleting ? '...' : 'Delete'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SafetyTalks({ projects }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const [talks, setTalks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterProject, setFilterProject] = useState('');

  const load = async (proj = filterProject) => {
    try {
      const params = {};
      if (proj) params.project_id = proj;
      const r = await api.get('/safety-talks', { params });
      setTalks(r.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (!loading) load(filterProject); }, [filterProject]);

  const totalSignoffs = talks.reduce((s, t) => s + parseInt(t.signoff_count || 0), 0);

  return (
    <div>
      <div style={styles.topRow}>
        <div>
          <h2 style={styles.heading}>Safety / Toolbox Talks</h2>
          {talks.length > 0 && (
            <p style={styles.summary}>{talks.length} talk{talks.length !== 1 ? 's' : ''} · {totalSignoffs} total sign-offs</p>
          )}
        </div>
        {isAdmin && <button style={styles.newBtn} onClick={() => setShowForm(true)}>+ New Talk</button>}
      </div>

      {showForm && (
        <div style={styles.formCard}>
          <NewTalkForm
            projects={projects}
            onAdded={talk => { setTalks(prev => [talk, ...prev]); setShowForm(false); }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {projects.length > 0 && (
        <div style={styles.filters}>
          <select style={styles.filterSelect} value={filterProject} onChange={e => setFilterProject(e.target.value)}>
            <option value="">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <p style={styles.hint}>Loading...</p>
      ) : talks.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>🦺</div>
          <p style={styles.emptyText}>
            {isAdmin
              ? 'No toolbox talks yet. Create one and workers can sign off on their phones.'
              : 'No toolbox talks scheduled. Check back before your next shift.'}
          </p>
        </div>
      ) : (
        <div style={styles.list}>
          {talks.map(t => (
            <TalkCard
              key={t.id}
              talk={t}
              isAdmin={isAdmin}
              onDeleted={id => setTalks(prev => prev.filter(t => t.id !== id))}
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
  filters: { marginBottom: 14 },
  filterSelect: { padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff', minWidth: 160 },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', cursor: 'pointer', gap: 12 },
  cardLeft: { display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 },
  talkIcon: { fontSize: 22, flexShrink: 0, marginTop: 1 },
  talkTitle: { fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 4 },
  talkMeta: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: '#6b7280' },
  projectTag: { background: '#ede9fe', color: '#6d28d9', padding: '1px 7px', borderRadius: 10, fontWeight: 600 },
  givenBy: { color: '#6b7280' },
  cardRight: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  signoffBadge: { fontSize: 12, fontWeight: 700, color: '#065f46', background: '#d1fae5', padding: '3px 10px', borderRadius: 10 },
  chevron: { fontSize: 10, color: '#9ca3af' },
  cardBody: { padding: '0 16px 16px', borderTop: '1px solid #f3f4f6' },
  content: { fontSize: 14, color: '#374151', lineHeight: 1.7, margin: '12px 0 16px', whiteSpace: 'pre-wrap' },
  signoffSection: { background: '#f9fafb', borderRadius: 8, padding: 12, marginBottom: 12 },
  signoffHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 },
  signoffTitle: { fontWeight: 700, fontSize: 13, color: '#374151' },
  signBtn: { background: '#059669', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  signedNote: { fontSize: 12, color: '#059669', fontWeight: 600 },
  signoffList: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  signoffChip: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, padding: '4px 10px', fontSize: 12, color: '#374151', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 },
  signoffTime: { color: '#9ca3af', fontWeight: 400 },
  cardActions: { display: 'flex', gap: 8 },
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
  empty: { textAlign: 'center', padding: '60px 20px' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  hint: { color: '#9ca3af', fontSize: 14 },
};
