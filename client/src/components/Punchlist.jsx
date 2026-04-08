import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useOffline } from '../contexts/OfflineContext';
import { PunchlistPDFButton } from './PunchlistPDF';
import { useT } from '../hooks/useT';

const STATUS_COLORS = {
  open: { color: '#92400e', bg: '#fef3c7' },
  done: { color: '#1e40af', bg: '#dbeafe' },
  verified: { color: '#065f46', bg: '#d1fae5' },
};

function statusStyle(status) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.open;
  return { color: c.color, background: c.bg };
}

function AddItemForm({ projects, workers, onAdded, onCancel, isAdmin, existingPhases }) {
  const t = useT();
  const PRIORITIES = [
    { value: 'high', label: `🔴 ${t.priorityHigh}` },
    { value: 'normal', label: `🟡 ${t.priorityNormal}` },
    { value: 'low', label: `⚪ ${t.priorityLow}` },
  ];
  const [form, setForm] = useState({ title: '', description: '', location: '', project_id: '', priority: 'normal', assigned_to: '', phase: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async e => {
    e.preventDefault();
    if (!form.title.trim()) { setError(t.titleRequired); return; }
    setSaving(true); setError('');
    try {
      const r = await api.post('/punchlist', form);
      if (r.data?.offline) {
        onAdded({ id: 'pending-' + Date.now(), pending: true, ...form, status: 'open' });
      } else {
        onAdded(r.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || t.failedToSave);
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} style={styles.form}>
      <h3 style={styles.formTitle}>{t.newPunchlistItemForm}</h3>
      <div style={styles.formGrid}>
        <div style={{ ...styles.fieldGroup, gridColumn: '1 / -1' }}>
          <label style={styles.label}>{t.titleField} *</label>
          <input style={styles.input} type="text" placeholder="e.g. Patch drywall in office 2B" maxLength={255} value={form.title} onChange={e => set('title', e.target.value)} />
        </div>
        {projects.length > 0 && (
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Project</label>
            <select style={styles.input} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
              <option value="">{t.noProjectOpt}</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>{t.priorityField}</label>
          <select style={styles.input} value={form.priority} onChange={e => set('priority', e.target.value)}>
            {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        {isAdmin && workers.length > 0 && (
          <div style={styles.fieldGroup}>
            <label style={styles.label}>{t.assignTo}</label>
            <select style={styles.input} value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
              <option value="">{t.unassigned}</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.full_name}</option>)}
            </select>
          </div>
        )}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>{t.phaseField}</label>
          <input style={styles.input} type="text" list="phase-suggestions" placeholder="e.g. Foundation, Rough-in" maxLength={255} value={form.phase} onChange={e => set('phase', e.target.value)} />
          <datalist id="phase-suggestions">
            {existingPhases.map(p => <option key={p} value={p} />)}
          </datalist>
        </div>
        <div style={styles.fieldGroup}>
          <label style={styles.label}>{t.locationField}</label>
          <input style={styles.input} type="text" placeholder="e.g. 2nd floor, north wing" maxLength={255} value={form.location} onChange={e => set('location', e.target.value)} />
        </div>
        <div style={{ ...styles.fieldGroup, gridColumn: '1 / -1' }}>
          <label style={styles.label}>{t.descriptionField}</label>
          <textarea style={styles.textarea} rows={3} placeholder="Additional details..." maxLength={1000} value={form.description} onChange={e => set('description', e.target.value)} />
        </div>
      </div>
      {error && <p style={styles.error}>{error}</p>}
      <div style={styles.formActions}>
        <button style={styles.submitBtn} type="submit" disabled={saving}>{saving ? t.saving : t.addItem}</button>
        <button style={styles.cancelBtn} type="button" onClick={onCancel}>{t.cancel}</button>
      </div>
    </form>
  );
}

function PunchItem({ item: initialItem, isAdmin, workers, onUpdated, onDeleted, existingPhases }) {
  const t = useT();
  const STATUSES = [
    { value: 'open', label: t.statusOpen },
    { value: 'done', label: t.statusDone },
    { value: 'verified', label: `${t.statusVerified} ✓` },
  ];
  const [item, setItem] = useState(initialItem);
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [checklist, setChecklist] = useState(null); // null = not loaded
  const [newCheckText, setNewCheckText] = useState('');
  const [addingCheck, setAddingCheck] = useState(false);
  const [editPhase, setEditPhase] = useState(initialItem.phase || '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => { setItem(initialItem); setEditPhase(initialItem.phase || ''); }, [initialItem]);

  const nextStatus = { open: 'done', done: 'verified', verified: 'open' };
  const nextLabel = { open: t.markDone, done: t.verify, verified: t.reopen };

  const handleExpand = () => {
    if (item.pending) return;
    const next = !expanded;
    setExpanded(next);
    if (next && checklist === null) {
      api.get(`/punchlist/${item.id}/checklist`).then(r => setChecklist(r.data)).catch(() => setChecklist([]));
    }
  };

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

  const savePhase = async () => {
    const val = editPhase.trim() || null;
    if (val === (item.phase || null)) return;
    try {
      const r = await api.patch(`/punchlist/${item.id}`, { phase: val });
      onUpdated(r.data);
    } catch {}
  };

  const handleDelete = async () => {
    try { await api.delete(`/punchlist/${item.id}`); onDeleted(item.id); } catch {}
  };

  const toggleCheck = async (checkId, checked) => {
    try {
      const r = await api.patch(`/punchlist/${item.id}/checklist/${checkId}`, { checked });
      setChecklist(prev => prev.map(c => c.id === checkId ? r.data : c));
      const newDone = checklist.filter(c => c.id === checkId ? checked : c.checked).length;
      setItem(it => ({ ...it, checked_count: newDone }));
    } catch {}
  };

  const deleteCheck = async checkId => {
    try {
      await api.delete(`/punchlist/${item.id}/checklist/${checkId}`);
      const updated = checklist.filter(c => c.id !== checkId);
      setChecklist(updated);
      const newDone = updated.filter(c => c.checked).length;
      setItem(it => ({ ...it, checklist_total: updated.length, checked_count: newDone }));
    } catch {}
  };

  const addCheck = async e => {
    e.preventDefault();
    if (!newCheckText.trim()) return;
    setAddingCheck(true);
    try {
      const r = await api.post(`/punchlist/${item.id}/checklist`, { text: newCheckText.trim() });
      setChecklist(prev => [...(prev || []), r.data]);
      setItem(it => ({ ...it, checklist_total: parseInt(it.checklist_total || 0) + 1 }));
      setNewCheckText('');
    } catch {} finally { setAddingCheck(false); }
  };

  const priorityDot = { high: '🔴', normal: '🟡', low: '⚪' }[item.priority] || '🟡';
  const checkTotal = parseInt(item.checklist_total || 0);
  const checkDone = parseInt(item.checked_count || 0);

  return (
    <div style={{ ...styles.item, opacity: item.status === 'verified' ? 0.65 : 1 }}>
      <div style={styles.itemRow} onClick={handleExpand}>
        <span style={styles.priorityDot} title={`Priority: ${item.priority}`}>{priorityDot}</span>
        <div style={styles.itemMain}>
          <span style={{ ...styles.itemTitle, textDecoration: item.status === 'verified' ? 'line-through' : 'none' }}>
            {item.title}
            {item.pending && <span style={styles.pendingBadge}>⏳ {t.pendingSync}</span>}
          </span>
          <div style={styles.itemMeta}>
            {item.project_name && <span style={styles.metaTag}>{item.project_name}</span>}
            {item.phase && <span style={styles.phaseTag}>{item.phase}</span>}
            {item.location && <span style={styles.metaLoc}>📍 {item.location}</span>}
            {item.assigned_to_name && <span style={styles.metaAssign}>👤 {item.assigned_to_name}</span>}
            {checkTotal > 0 && (
              <span style={{ ...styles.checkProgress, ...(checkDone === checkTotal ? styles.checkProgressDone : {}) }}>
                ☑ {checkDone}/{checkTotal}
              </span>
            )}
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
            <p style={styles.resolvedNote}>{t.verifiedOn} {new Date(item.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
          )}

          {/* Phase edit */}
          <div style={styles.phaseEditRow}>
            <label style={styles.label}>{t.phaseField}</label>
            <input
              style={styles.phaseInput}
              type="text"
              list="phase-suggestions"
              placeholder={t.phaseEditPlaceholder}
              maxLength={255}
              value={editPhase}
              onChange={e => setEditPhase(e.target.value)}
              onBlur={savePhase}
              onKeyDown={e => { if (e.key === 'Enter') { e.target.blur(); } }}
            />
          </div>

          {/* Checklist */}
          <div style={styles.checklistSection}>
            {checklist === null ? (
              <p style={styles.checklistLoading}>{t.loading}</p>
            ) : (
              <>
                {checklist.length > 0 && (
                  <div style={styles.checklistItems}>
                    {checklist.map(c => (
                      <div key={c.id} style={styles.checkRow}>
                        <input
                          type="checkbox"
                          checked={c.checked}
                          onChange={e => toggleCheck(c.id, e.target.checked)}
                          style={styles.checkbox}
                        />
                        <span style={{ ...styles.checkText, textDecoration: c.checked ? 'line-through' : 'none', color: c.checked ? '#9ca3af' : '#374151' }}>
                          {c.text}
                        </span>
                        <button style={styles.checkDeleteBtn} onClick={() => deleteCheck(c.id)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <form onSubmit={addCheck} style={styles.addCheckForm}>
                  <input
                    style={styles.checkInput}
                    type="text"
                    placeholder={checklist.length === 0 ? t.addChecklistPlaceholder : t.addChecklistItemPlaceholder}
                    value={newCheckText}
                    onChange={e => setNewCheckText(e.target.value)}
                  />
                  {newCheckText.trim() && (
                    <button type="submit" style={styles.checkAddBtn} disabled={addingCheck}>{t.add}</button>
                  )}
                </form>
              </>
            )}
          </div>

          {isAdmin && (
            <div style={styles.assignRow}>
              <label style={styles.label}>{t.assignTo}: </label>
              <select style={styles.smallSelect} value={item.assigned_to || ''} onChange={e => assignTo(e.target.value)}>
                <option value="">{t.unassigned}</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.full_name}</option>)}
              </select>
            </div>
          )}
          <div style={styles.itemActions}>
            <button style={styles.advanceBtn} onClick={advance} disabled={updating}>
              {updating ? '...' : nextLabel[item.status] || t.markDone}
            </button>
            {confirmingDelete ? (
              <>
                <button style={styles.confirmDeleteBtn} onClick={handleDelete}>{t.confirm}</button>
                <button style={styles.cancelDeleteBtn} onClick={() => setConfirmingDelete(false)}>{t.cancel}</button>
              </>
            ) : (
              <button style={styles.deleteBtn} onClick={() => setConfirmingDelete(true)}>{t.delete}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Punchlist({ projects }) {
  const t = useT();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const { onSync } = useOffline() || {};
  const [items, setItems] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPhase, setFilterPhase] = useState('');

  const load = async (proj = filterProject, stat = filterStatus, ph = filterPhase) => {
    try {
      const params = {};
      if (proj) params.project_id = proj;
      if (stat) params.status = stat;
      if (ph) params.phase = ph;
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

  useEffect(() => { if (!loading) load(filterProject, filterStatus, filterPhase); }, [filterProject, filterStatus, filterPhase]);
  useEffect(() => { if (!onSync) return; return onSync(count => { if (count > 0) load(); }); }, [onSync]);

  const openCount = items.filter(i => i.status === 'open').length;
  const doneCount = items.filter(i => i.status === 'done').length;
  const verifiedCount = items.filter(i => i.status === 'verified').length;

  // All unique phases across current items (for datalist + filter dropdown)
  const allPhases = [...new Set(items.map(i => i.phase).filter(Boolean))].sort();

  // Group items by phase when any have a phase set
  const hasPhases = items.some(i => i.phase);
  const grouped = hasPhases
    ? [
        ...allPhases.map(ph => ({ phase: ph, items: items.filter(i => i.phase === ph) })),
        ...(items.some(i => !i.phase) ? [{ phase: null, items: items.filter(i => !i.phase) }] : []),
      ]
    : [{ phase: null, items }];

  return (
    <div>
      <div style={styles.topRow}>
        <div>
          <h2 style={styles.heading}>{t.punchlistTitle}</h2>
          {items.length > 0 && (
            <p style={styles.summary}>
              {openCount} {t.statusOpen} · {doneCount} {t.statusDone} · {verifiedCount} {t.statusVerified}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {items.length > 0 && <PunchlistPDFButton items={items} companyName={user?.company_name} style={styles.pdfBtn} />}
          <button style={styles.newBtn} onClick={() => setShowForm(true)}>{t.newPunchlistItem}</button>
        </div>
      </div>

      {showForm && (
        <div style={styles.formCard}>
          <AddItemForm
            projects={projects}
            workers={workers}
            isAdmin={isAdmin}
            existingPhases={allPhases}
            onAdded={item => { setItems(prev => [item, ...prev]); setShowForm(false); }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <div style={styles.filters}>
        <select style={styles.filterSelect} value={filterProject} onChange={e => setFilterProject(e.target.value)}>
          <option value="">{t.allProjectsOpt}</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select style={styles.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">{t.allStatuses}</option>
          <option value="open">{t.statusOpen}</option>
          <option value="done">{t.statusDone}</option>
          <option value="verified">{t.statusVerified} ✓</option>
        </select>
        {allPhases.length > 0 && (
          <select style={styles.filterSelect} value={filterPhase} onChange={e => setFilterPhase(e.target.value)}>
            <option value="">{t.allPhases}</option>
            {allPhases.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <p style={styles.hint}>{t.loading}</p>
      ) : items.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>✅</div>
          <p style={styles.emptyText}>{t.noPunchlistItems} {t.punchlistEmptyDesc}</p>
        </div>
      ) : (
        <div>
          {grouped.map(({ phase, items: groupItems }) => (
            <div key={phase || '__none__'} style={{ marginBottom: hasPhases ? 20 : 0 }}>
              {hasPhases && (
                <div style={styles.phaseGroupHeader}>
                  {phase || <span style={{ fontStyle: 'italic', color: '#9ca3af' }}>{t.noPhase}</span>}
                  <span style={styles.phaseGroupCount}>{groupItems.length}</span>
                </div>
              )}
              <div style={styles.list}>
                {groupItems.map(item => (
                  <PunchItem
                    key={item.id}
                    item={item}
                    isAdmin={isAdmin}
                    workers={workers}
                    existingPhases={allPhases}
                    onUpdated={updated => setItems(prev => prev.map(i => i.id === updated.id ? updated : i))}
                    onDeleted={id => setItems(prev => prev.filter(i => i.id !== id))}
                  />
                ))}
              </div>
            </div>
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
  pdfBtn: { fontSize: 13, fontWeight: 600, color: '#1a56db', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '9px 16px', borderRadius: 8, textDecoration: 'none', cursor: 'pointer', flexShrink: 0 },
  filters: { display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  filterSelect: { padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff', flex: 1, minWidth: 140 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: { background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' },
  itemRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer' },
  priorityDot: { fontSize: 14, flexShrink: 0 },
  itemMain: { flex: 1, minWidth: 0 },
  itemTitle: { fontWeight: 600, fontSize: 14, color: '#111827', display: 'block', marginBottom: 4 },
  itemMeta: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  pendingBadge: { fontSize: 10, fontWeight: 600, color: '#92400e', background: '#fef3c7', padding: '1px 6px', borderRadius: 6, marginLeft: 6, verticalAlign: 'middle' },
  metaTag: { background: '#ede9fe', color: '#6d28d9', padding: '1px 7px', borderRadius: 10, fontWeight: 600, fontSize: 11 },
  phaseTag: { background: '#e0f2fe', color: '#0369a1', padding: '1px 7px', borderRadius: 10, fontWeight: 600, fontSize: 11 },
  metaLoc: { fontSize: 12, color: '#6b7280' },
  metaAssign: { fontSize: 12, color: '#6b7280' },
  itemRight: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  statusBadge: { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 10 },
  chevron: { fontSize: 10, color: '#9ca3af' },
  itemBody: { padding: '0 14px 14px', borderTop: '1px solid #f3f4f6' },
  desc: { fontSize: 13, color: '#374151', lineHeight: 1.6, margin: '10px 0', whiteSpace: 'pre-wrap' },
  resolvedNote: { fontSize: 12, color: '#059669', margin: '0 0 10px', fontWeight: 600 },
  phaseEditRow: { display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 12, marginTop: 8 },
  phaseInput: { padding: '6px 9px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, background: '#f9fafb', width: '100%', boxSizing: 'border-box' },
  phaseGroupHeader: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, paddingBottom: 4, borderBottom: '2px solid #e0f2fe' },
  phaseGroupCount: { fontSize: 11, fontWeight: 700, color: '#fff', background: '#0369a1', padding: '1px 7px', borderRadius: 10 },
  assignRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  smallSelect: { padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, background: '#fff' },
  itemActions: { display: 'flex', gap: 8 },
  advanceBtn: { background: '#059669', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' },
  deleteBtn: { background: 'none', border: '1px solid #fca5a5', color: '#ef4444', padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  confirmDeleteBtn: { background: '#ef4444', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  cancelDeleteBtn: { background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
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
  // Checklist
  checkProgress: { fontSize: 11, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', padding: '1px 7px', borderRadius: 10 },
  checkProgressDone: { color: '#065f46', background: '#d1fae5' },
  checklistSection: { marginBottom: 12 },
  checklistLoading: { fontSize: 12, color: '#9ca3af', margin: '8px 0' },
  checklistItems: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 },
  checkRow: { display: 'flex', alignItems: 'center', gap: 8 },
  checkbox: { width: 16, height: 16, cursor: 'pointer', flexShrink: 0, accentColor: '#059669' },
  checkText: { flex: 1, fontSize: 13, lineHeight: 1.4 },
  checkDeleteBtn: { background: 'none', border: 'none', color: '#d1d5db', fontSize: 12, cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0 },
  addCheckForm: { display: 'flex', gap: 6, alignItems: 'center' },
  checkInput: { flex: 1, padding: '6px 9px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, background: '#f9fafb' },
  checkAddBtn: { padding: '6px 12px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  // Empty / misc
  empty: { textAlign: 'center', padding: '60px 20px' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  hint: { color: '#9ca3af', fontSize: 14 },
};
