import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import { useToast } from '../contexts/ToastContext';
import { formatCurrency } from '../utils';
import { useT } from '../hooks/useT';
import { SkeletonList } from './Skeleton';

function WorkerDocuments({ workerId }) {
  const t = useT();
  const toast = useToast();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [pendingDeleteDocId, setPendingDeleteDocId] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    api.get(`/admin/workers/${workerId}/documents`)
      .then(r => setDocs(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workerId]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setUploadError(t.docsUploadError); return; }
    setUploading(true); setUploadError('');
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const r = await api.post(`/admin/workers/${workerId}/documents`, { name: file.name, data: ev.target.result });
        setDocs(prev => [r.data, ...prev]);
      } catch { setUploadError(t.docsUploadError); }
      finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = async (docId) => {
    try {
      await api.delete(`/admin/workers/${workerId}/documents/${docId}`);
      setDocs(prev => prev.filter(d => d.id !== docId));
      toast(t.docsDeleted, 'success');
    } catch {
      toast(t.docsDeleteFailed, 'error');
    } finally { setPendingDeleteDocId(null); }
  };

  const fmtSize = (b) => b ? (b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`) : '';

  return (
    <div style={ds.section}>
      <div style={ds.header}>
        <span style={ds.title}>{t.docsTitle}</span>
        <label style={ds.uploadBtn}>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={handleUpload} accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx" />
          {uploading ? t.docsUploading : `+ ${t.docsUpload}`}
        </label>
      </div>
      {uploadError && <p style={ds.error}>{uploadError}</p>}
      {loading ? null : docs.length === 0 ? (
        <p style={ds.empty}>{t.docsNoDocuments}</p>
      ) : (
        <div style={ds.list}>
          {docs.map(d => (
            <div key={d.id} style={ds.docRow}>
              <a href={d.url} target="_blank" rel="noopener noreferrer" style={ds.docName} title={d.name}>{d.name}</a>
              <span style={ds.docMeta}>{fmtSize(d.size_bytes)}{d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ''}</span>
              {pendingDeleteDocId === d.id ? (
                <>
                  <button style={ds.confirmDeleteBtn} onClick={() => handleDelete(d.id)}>{t.confirm}</button>
                  <button style={ds.cancelDeleteBtn} onClick={() => setPendingDeleteDocId(null)}>{t.cancel}</button>
                </>
              ) : (
                <button style={ds.deleteBtn} aria-label={`Delete ${d.name}`} onClick={() => setPendingDeleteDocId(d.id)}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ds = {
  section: { marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 13, fontWeight: 700, color: '#374151' },
  uploadBtn: { background: '#eff6ff', color: '#1a56db', border: '1px solid #bfdbfe', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  list: { display: 'flex', flexDirection: 'column', gap: 6 },
  docRow: { display: 'flex', alignItems: 'center', gap: 10, background: '#f9fafb', borderRadius: 6, padding: '6px 10px' },
  docName: { flex: 1, fontSize: 13, color: '#1a56db', textDecoration: 'none', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  docMeta: { fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' },
  deleteBtn: { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 12, padding: '0 2px', lineHeight: 1 },
  confirmDeleteBtn: { background: '#ef4444', color: '#fff', border: 'none', borderRadius: 5, padding: '3px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  cancelDeleteBtn: { background: 'none', border: '1px solid #d1d5db', color: '#6b7280', borderRadius: 5, padding: '3px 8px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  error: { fontSize: 12, color: '#ef4444', margin: '4px 0' },
  empty: { fontSize: 12, color: '#9ca3af', margin: '4px 0' },
};

const LANGUAGES = ['English', 'Spanish'];

const WORKER_TYPE_LABELS = {
  employee: 'Employee (W-2)',
  contractor: 'Independent Contractor (1099-NEC)',
  subcontractor: 'Subcontractor (1099-NEC)',
  owner: 'Owner / Officer',
};

const PERM_LABELS = [
  { key: 'approve_entries', label: 'Approve entries' },
  { key: 'manage_workers', label: 'Manage workers' },
  { key: 'manage_projects', label: 'Manage projects' },
  { key: 'view_reports', label: 'View reports' },
  { key: 'manage_settings', label: 'Manage settings' },
];

function fmtRate(w, currency = 'USD') {
  const amt = parseFloat(w.hourly_rate ?? 0);
  if (w.rate_type === 'daily') return `${formatCurrency(amt, currency)} / day`;
  return `${formatCurrency(amt, currency)} / hr`;
}

function RoleBadge({ role }) {
  const t = useT();
  const isAdmin = role === 'admin' || role === 'super_admin';
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: isAdmin ? '#dbeafe' : '#f3f4f6', color: isAdmin ? '#1e40af' : '#6b7280' }}>
      {isAdmin ? t.adminRole : t.workerRole}
    </span>
  );
}

export default function ManageWorkers({ workers, onWorkerAdded, onWorkerDeleted, onWorkerUpdated, onWorkerRestored, defaultRate = 0, defaultTempPassword = '', showRate = true, identityEditable = true, currency = 'USD', currentUser = null, qboConnected = false }) {
  const toast = useToast();
  const t = useT();
  const rateTypes = [
    { value: 'hourly', label: t.perHour },
    { value: 'daily', label: t.perDay },
  ];
  const overtimeRules = [
    { value: 'daily', label: t.otDaily },
    { value: 'weekly', label: t.otWeekly },
    { value: 'none', label: t.otNone },
  ];

  // Add form state
  const [showForm, setShowForm] = useState(false);
  const [addMode, setAddMode] = useState('manual');
  const [form, setForm] = useState({ first_name: '', last_name: '', username: '', password: defaultTempPassword, email: '', role: 'worker', worker_type: 'employee', language: 'English', hourly_rate: String(defaultRate), rate_type: 'hourly', overtime_rule: 'daily' });
  const [inviteForm, setInviteForm] = useState({ first_name: '', last_name: '', email: '', role: 'worker', language: 'English', hourly_rate: String(defaultRate) });
  const [error, setError] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteSent, setInviteSent] = useState('');
  const [saving, setSaving] = useState(false);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [usernameTaken, setUsernameTaken] = useState(false);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [archivedConflict, setArchivedConflict] = useState(null);
  const [qboVendorPrompt, setQboVendorPrompt] = useState(null); // { user_id, display_name }
  const [qboVendorCreating, setQboVendorCreating] = useState(false);
  const [qboVendorResult, setQboVendorResult] = useState(null); // 'ok' | 'error'

  // Expand / edit state
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editSection, setEditSection] = useState(null); // 'info' | 'username' | 'rate'

  const [editInfoForm, setEditInfoForm] = useState({});
  const [editInfoSaving, setEditInfoSaving] = useState(false);

  const [editUsernameVal, setEditUsernameVal] = useState('');
  const [editUsernameTaken, setEditUsernameTaken] = useState(false);
  const [editUsernameChecking, setEditUsernameChecking] = useState(false);
  const [editUsernameSaving, setEditUsernameSaving] = useState(false);

  const [editRateForm, setEditRateForm] = useState({ rate: '', rate_type: 'hourly', overtime_rule: 'daily', guaranteed_weekly_hours: '', guarantee_enabled: false });
  const [editRateSaving, setEditRateSaving] = useState(false);

  const [editPermForm, setEditPermForm] = useState({ full_access: true, keys: {} });
  const [editPermSaving, setEditPermSaving] = useState(false);

  const [editWorkerUpdatedAt, setEditWorkerUpdatedAt] = useState(null);

  const [editWorkerAccessForm, setEditWorkerAccessForm] = useState({ all_workers: true, ids: new Set() });
  const [editWorkerAccessSaving, setEditWorkerAccessSaving] = useState(false);

  // Invite
  const [inviteSending, setInviteSending] = useState(new Set());
  const [invitedIds, setInvitedIds] = useState(new Set());

  // History
  const [archived, setArchived] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [archivedFetched, setArchivedFetched] = useState(false);
  const [pendingRemoveId, setPendingRemoveId] = useState(null);

  // ── Add form helpers ────────────────────────────────────────────────────────
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setInvite = (k, v) => setInviteForm(f => ({ ...f, [k]: v }));

  const updateAutoUsername = (first, last) => {
    if (usernameEdited) return;
    const suggested = (first.charAt(0) + last).toLowerCase().replace(/[^a-z0-9]/g, '');
    setForm(f => ({ ...f, username: suggested }));
    setUsernameTaken(false);
  };

  const handleFirstNameChange = v => {
    setForm(f => ({ ...f, first_name: v }));
    updateAutoUsername(v, form.last_name);
  };
  const handleLastNameChange = v => {
    setForm(f => ({ ...f, last_name: v }));
    updateAutoUsername(form.first_name, v);
  };

  const checkUsername = async username => {
    if (!username) return;
    setUsernameChecking(true);
    try {
      const r = await api.get('/admin/workers/check-username', { params: { username } });
      setUsernameTaken(r.data.taken);
    } catch {}
    finally { setUsernameChecking(false); }
  };

  const handleAdd = async e => {
    e.preventDefault();
    setError(''); setArchivedConflict(null); setSaving(true);
    try {
      const full_name = [form.first_name, form.last_name].filter(Boolean).join(' ');
      const r = await api.post('/admin/workers', { ...form, full_name });
      onWorkerAdded(r.data);
      toast(t.workerCreated, 'success');
      const workerType = form.worker_type;
      setForm({ first_name: '', last_name: '', username: '', password: defaultTempPassword, email: '', role: 'worker', worker_type: 'employee', language: 'English', hourly_rate: String(defaultRate), rate_type: 'hourly', overtime_rule: 'daily' });
      setUsernameEdited(false); setUsernameTaken(false); setShowForm(false);
      // Offer to create as QBO Vendor if connected and worker is contractor/subcontractor
      if (qboConnected && (workerType === 'contractor' || workerType === 'subcontractor')) {
        setQboVendorPrompt({ user_id: r.data.id, display_name: r.data.full_name });
        setQboVendorResult(null);
      }
    } catch (err) {
      const data = err.response?.data;
      if (data?.archived_id) { setArchivedConflict({ id: data.archived_id, name: data.archived_name }); setError(data.error); }
      else setError(data?.error || 'Failed to create user');
    } finally { setSaving(false); }
  };

  const handleInvite = async e => {
    e.preventDefault();
    setInviteError(''); setInviteSaving(true);
    try {
      const inv_full_name = [inviteForm.first_name, inviteForm.last_name].filter(Boolean).join(' ');
      const r = await api.post('/admin/workers/invite', { ...inviteForm, full_name: inv_full_name });
      onWorkerAdded(r.data);
      if (r.data.email_sent === false) {
        setInviteError(t.workerInviteEmailFailed);
        setInviteForm({ first_name: '', last_name: '', email: '', role: 'worker', language: 'English', hourly_rate: String(defaultRate) });
      } else {
        setInviteSent(inviteForm.email);
        setTimeout(() => setInviteSent(''), 6000);
        setInviteForm({ first_name: '', last_name: '', email: '', role: 'worker', language: 'English', hourly_rate: String(defaultRate) });
      }
    } catch (err) {
      setInviteError(err.response?.data?.error || 'Failed to send invite');
    } finally { setInviteSaving(false); }
  };

  const handleRestoreConflict = async () => {
    if (!archivedConflict) return;
    await handleRestore(archivedConflict.id);
    setArchivedConflict(null); setError(''); setShowForm(false);
  };

  const createQboVendor = async () => {
    if (!qboVendorPrompt) return;
    setQboVendorCreating(true);
    try {
      await api.post('/qbo/workers/create-vendor', {
        user_id: qboVendorPrompt.user_id,
        display_name: qboVendorPrompt.display_name,
      });
      setQboVendorResult('ok');
    } catch {
      setQboVendorResult('error');
    } finally { setQboVendorCreating(false); }
  };

  // ── Expand / panel edit helpers ─────────────────────────────────────────────
  const cancelEdit = () => { setEditingId(null); setEditSection(null); setEditUsernameTaken(false); };

  const toggleExpand = id => {
    if (expandedId === id) { setExpandedId(null); cancelEdit(); }
    else { setExpandedId(id); cancelEdit(); }
  };

  const startEditInfo = w => {
    setEditingId(w.id); setEditSection('info');
    setEditWorkerUpdatedAt(w.updated_at || null);
    setEditInfoForm({ full_name: w.full_name, invoice_name: w.invoice_name || '', email: w.email || '', role: w.role, language: w.language || 'English', worker_type: w.worker_type || 'employee' });
  };

  const startEditUsername = w => {
    setEditingId(w.id); setEditSection('username');
    setEditWorkerUpdatedAt(w.updated_at || null);
    setEditUsernameVal(w.username); setEditUsernameTaken(false);
  };

  const startEditRate = w => {
    setEditingId(w.id); setEditSection('rate');
    setEditWorkerUpdatedAt(w.updated_at || null);
    const gwh = w.guaranteed_weekly_hours != null ? parseFloat(w.guaranteed_weekly_hours) : null;
    setEditRateForm({
      rate: String(w.hourly_rate ?? 0),
      rate_type: w.rate_type || 'hourly',
      overtime_rule: w.overtime_rule || 'daily',
      guarantee_enabled: gwh != null && gwh > 0,
      guaranteed_weekly_hours: gwh != null ? String(gwh) : '40',
    });
  };

  const checkEditUsername = async (username, workerId) => {
    if (!username) return;
    setEditUsernameChecking(true);
    try {
      const r = await api.get('/admin/workers/check-username', { params: { username, exclude_id: workerId } });
      setEditUsernameTaken(r.data.taken);
    } catch {}
    finally { setEditUsernameChecking(false); }
  };

  const saveInfo = async id => {
    setEditInfoSaving(true);
    try {
      const r = await api.patch(`/admin/workers/${id}`, { ...editInfoForm, updated_at: editWorkerUpdatedAt });
      onWorkerUpdated(r.data);
      cancelEdit();
    } catch (err) {
      const msg = err.response?.status === 409 ? t.concurrentModification : err.response?.data?.error || 'Failed to update';
      toast(msg, 'error');
    } finally { setEditInfoSaving(false); }
  };

  const saveUsername = async id => {
    setEditUsernameSaving(true);
    try {
      const r = await api.patch(`/admin/workers/${id}`, { username: editUsernameVal, updated_at: editWorkerUpdatedAt });
      onWorkerUpdated(r.data);
      cancelEdit();
    } catch (err) {
      const msg = err.response?.status === 409 ? t.concurrentModification : err.response?.data?.error || 'Username already taken';
      toast(msg, 'error');
    } finally { setEditUsernameSaving(false); }
  };

  const saveRate = async id => {
    setEditRateSaving(true);
    try {
      const r = await api.patch(`/admin/workers/${id}`, {
        hourly_rate: editRateForm.rate,
        rate_type: editRateForm.rate_type,
        overtime_rule: editRateForm.overtime_rule,
        guaranteed_weekly_hours: editRateForm.guarantee_enabled
          ? (parseFloat(editRateForm.guaranteed_weekly_hours) || 40)
          : null,
        updated_at: editWorkerUpdatedAt,
      });
      onWorkerUpdated(r.data);
      cancelEdit();
    } catch (err) {
      const msg = err.response?.status === 409 ? t.concurrentModification : err.response?.data?.error || 'Failed to update';
      toast(msg, 'error');
    } finally { setEditRateSaving(false); }
  };

  const startEditPermissions = w => {
    setEditingId(w.id); setEditSection('permissions');
    const fullAccess = w.admin_permissions == null;
    const defaultKeys = PERM_LABELS.reduce((acc, { key }) => ({ ...acc, [key]: true }), {});
    setEditPermForm({ full_access: fullAccess, keys: fullAccess ? defaultKeys : { ...defaultKeys, ...w.admin_permissions } });
  };

  const savePermissions = async id => {
    setEditPermSaving(true);
    try {
      const perms = editPermForm.full_access ? null : editPermForm.keys;
      const r = await api.patch(`/admin/workers/${id}/permissions`, { admin_permissions: perms });
      onWorkerUpdated(r.data);
      cancelEdit();
    } catch (err) { toast(err.response?.data?.error || t.failedUpdatePermissions, 'error'); }
    finally { setEditPermSaving(false); }
  };

  const startEditWorkerAccess = w => {
    setEditingId(w.id); setEditSection('worker-access');
    const allWorkers = !w.worker_access_ids || w.worker_access_ids.length === 0;
    setEditWorkerAccessForm({ all_workers: allWorkers, ids: new Set(w.worker_access_ids || []) });
  };

  const saveWorkerAccess = async id => {
    setEditWorkerAccessSaving(true);
    try {
      const ids = editWorkerAccessForm.all_workers ? null : Array.from(editWorkerAccessForm.ids);
      const r = await api.patch(`/admin/workers/${id}/worker-access`, { worker_access_ids: ids });
      onWorkerUpdated(r.data);
      cancelEdit();
    } catch (err) { toast(err.response?.data?.error || t.failedUpdateWorkerAccess, 'error'); }
    finally { setEditWorkerAccessSaving(false); }
  };

  // ── Invite helper ────────────────────────────────────────────────────────────
  const sendInvite = async (id) => {
    setInviteSending(s => new Set(s).add(id));
    try {
      const r = await api.post(`/admin/workers/${id}/send-invite`);
      if (r.data.email_sent) {
        setInvitedIds(s => new Set(s).add(id));
      } else {
        toast(t.workerInviteEmailFailed, 'error');
      }
    } catch (err) {
      toast(err.response?.data?.error || t.failedSendInvite, 'error');
    } finally {
      setInviteSending(s => { const n = new Set(s); n.delete(id); return n; });
    }
  };

  // ── Archive helpers ──────────────────────────────────────────────────────────
  const loadArchived = async () => {
    if (archivedFetched) return;
    setLoadingArchived(true);
    try {
      const r = await api.get('/admin/workers/archived');
      setArchived(r.data); setArchivedFetched(true);
    } finally { setLoadingArchived(false); }
  };

  const handleRemove = async (id) => {
    setPendingRemoveId(null);
    try {
      await api.delete(`/admin/workers/${id}`);
      onWorkerDeleted(id);
      setArchivedFetched(false);
      if (expandedId === id) setExpandedId(null);
    } catch { toast(t.failedRemoveUser, 'error'); }
  };

  const handleRestore = async id => {
    try {
      const r = await api.patch(`/admin/workers/${id}/restore`);
      onWorkerRestored({ ...r.data, total_entries: 0, total_hours: 0, regular_hours: 0, overtime_hours: 0, prevailing_hours: 0 });
      setArchived(prev => prev.filter(w => w.id !== id));
    } catch { toast(t.failedRestoreUser, 'error'); }
  };

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <h3 style={s.cardTitle}>{t.users}</h3>
        <button style={s.addBtn} onClick={() => { setShowForm(v => !v); setError(''); setArchivedConflict(null); setInviteError(''); setInviteSent(''); setForm({ first_name: '', last_name: '', username: '', password: defaultTempPassword, email: '', role: 'worker', worker_type: 'employee', language: 'English', hourly_rate: String(defaultRate), rate_type: 'hourly', overtime_rule: 'daily' }); setInviteForm({ first_name: '', last_name: '', email: '', role: 'worker', language: 'English', hourly_rate: String(defaultRate) }); setUsernameEdited(false); setAddMode('manual'); }}>
          {showForm ? t.cancel : t.addUser}
        </button>
      </div>

      {showForm && (
        <div style={s.addPanel}>
          <div style={s.modeTabs}>
            <button style={addMode === 'manual' ? s.modeTabActive : s.modeTab} onClick={() => setAddMode('manual')}>{t.addManually}</button>
            <button style={addMode === 'invite' ? s.modeTabActive : s.modeTab} onClick={() => setAddMode('invite')}>{t.inviteByEmail}</button>
          </div>

          {addMode === 'manual' ? (
            <form onSubmit={handleAdd} style={s.addForm}>
              <div style={s.formGrid}>
                <div style={s.fieldGroup}>
                  <label htmlFor="mw-first-name" style={s.label}>{t.firstName}<span style={{ color: '#ef4444', marginLeft: 2 }}>*</span></label>
                  <input id="mw-first-name" style={s.input} value={form.first_name} onChange={e => handleFirstNameChange(e.target.value)} required />
                </div>
                <div style={s.fieldGroup}>
                  <label htmlFor="mw-last-name" style={s.label}>{t.lastName}<span style={{ color: '#ef4444', marginLeft: 2 }}>*</span></label>
                  <input id="mw-last-name" style={s.input} value={form.last_name} onChange={e => handleLastNameChange(e.target.value)} required />
                </div>
                <div style={s.fieldGroup}>
                  <label htmlFor="mw-username" style={s.label}>Username<span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>{usernameChecking ? ' (checking...)' : usernameTaken ? ' ⚠ taken' : ''}</label>
                  <input
                    id="mw-username"
                    style={{ ...s.input, borderColor: usernameTaken ? '#fca5a5' : undefined }}
                    value={form.username}
                    onChange={e => { setUsernameEdited(!!e.target.value); set('username', e.target.value); setUsernameTaken(false); }}
                    onBlur={e => checkUsername(e.target.value)}
                    required
                  />
                </div>
                <div style={s.fieldGroup}>
                  <label htmlFor="mw-password" style={s.label}>{t.temporaryPassword}<span style={{ color: '#ef4444', marginLeft: 2 }}>*</span></label>
                  <div style={{ position: 'relative' }}>
                    <input id="mw-password" style={{ ...s.input, width: '100%', paddingRight: 36, boxSizing: 'border-box' }} type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)} required minLength={6} />
                    <button type="button" onClick={() => setShowPassword(v => !v)} style={s.eyeBtn} tabIndex={-1}>{showPassword ? '🙈' : '👁'}</button>
                  </div>
                </div>
                <div style={s.fieldGroup}>
                  <label htmlFor="mw-email" style={s.label}>{t.emailOptional}</label>
                  <input id="mw-email" style={s.input} type="email" value={form.email} onChange={e => set('email', e.target.value)} />
                </div>
                <div style={s.fieldGroup}>
                  <label htmlFor="mw-role" style={s.label}>{t.role}</label>
                  <select id="mw-role" style={s.input} value={form.role} onChange={e => set('role', e.target.value)}>
                    <option value="worker">{t.workerRole}</option>
                    <option value="admin">{t.adminRole}</option>
                  </select>
                </div>
                <div style={s.fieldGroup}>
                  <label htmlFor="mw-worker-type" style={s.label}>Worker Type</label>
                  <select id="mw-worker-type" style={s.input} value={form.worker_type} onChange={e => set('worker_type', e.target.value)}>
                    <option value="employee">Employee (W-2)</option>
                    <option value="contractor">Independent Contractor (1099-NEC)</option>
                    <option value="subcontractor">Subcontractor (1099-NEC)</option>
                    <option value="owner">Owner / Officer</option>
                  </select>
                </div>
                <div style={s.fieldGroup}>
                  <label htmlFor="mw-language" style={s.label}>{t.language}</label>
                  <select id="mw-language" style={s.input} value={form.language} onChange={e => set('language', e.target.value)}>
                    {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                {showRate && (
                  <>
                    <div style={s.fieldGroup}>
                      <label htmlFor="mw-hourly-rate" style={s.label}>{t.payRate}</label>
                      <input id="mw-hourly-rate" style={s.input} type="number" min="0" step="0.01" value={form.hourly_rate} onChange={e => set('hourly_rate', e.target.value)} />
                    </div>
                    <div style={s.fieldGroup}>
                      <label htmlFor="mw-rate-type" style={s.label}>{t.rateType}</label>
                      <select id="mw-rate-type" style={s.input} value={form.rate_type} onChange={e => set('rate_type', e.target.value)}>
                        {rateTypes.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                    <div style={s.fieldGroup}>
                      <label htmlFor="mw-overtime-rule" style={s.label}>{t.overtimeRule}</label>
                      <select id="mw-overtime-rule" style={s.input} value={form.overtime_rule} onChange={e => set('overtime_rule', e.target.value)}>
                        {overtimeRules.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                  </>
                )}
              </div>
              {error && (
                <div style={s.errorBox}>
                  <span style={s.errorText}>{error}</span>
                  {archivedConflict && <button type="button" style={s.restoreInlineBtn} onClick={handleRestoreConflict}>Restore {archivedConflict.name}</button>}
                </div>
              )}
              <button style={{ ...s.saveBtn, ...((saving || usernameTaken) ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }} type="submit" disabled={saving || usernameTaken}>{saving ? t.creating : t.createUser}</button>
            </form>
          ) : (
            <form onSubmit={handleInvite} style={s.addForm}>
              {inviteSent ? (
                <div style={s.inviteSuccess}>
                  {t.inviteSentPrefix} <strong>{inviteSent}</strong>.{' '}
                  <button type="button" style={s.restoreInlineBtn} onClick={() => setInviteSent('')}>{t.sendAnother}</button>
                </div>
              ) : (
                <>
                  <div style={s.formGrid}>
                    <div style={s.fieldGroup}>
                      <label htmlFor="mw-inv-first-name" style={s.label}>{t.firstName}</label>
                      <input id="mw-inv-first-name" style={s.input} value={inviteForm.first_name} onChange={e => setInvite('first_name', e.target.value)} required />
                    </div>
                    <div style={s.fieldGroup}>
                      <label htmlFor="mw-inv-last-name" style={s.label}>{t.lastName}</label>
                      <input id="mw-inv-last-name" style={s.input} value={inviteForm.last_name} onChange={e => setInvite('last_name', e.target.value)} required />
                    </div>
                    <div style={s.fieldGroup}>
                      <label htmlFor="mw-inv-email" style={s.label}>{t.email}</label>
                      <input id="mw-inv-email" style={s.input} type="email" value={inviteForm.email} onChange={e => setInvite('email', e.target.value)} required />
                    </div>
                    <div style={s.fieldGroup}>
                      <label htmlFor="mw-inv-role" style={s.label}>{t.role}</label>
                      <select id="mw-inv-role" style={s.input} value={inviteForm.role} onChange={e => setInvite('role', e.target.value)}>
                        <option value="worker">{t.workerRole}</option>
                        <option value="admin">{t.adminRole}</option>
                      </select>
                    </div>
                    <div style={s.fieldGroup}>
                      <label htmlFor="mw-inv-language" style={s.label}>{t.language}</label>
                      <select id="mw-inv-language" style={s.input} value={inviteForm.language} onChange={e => setInvite('language', e.target.value)}>
                        {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    {showRate && (
                      <div style={s.fieldGroup}>
                        <label htmlFor="mw-inv-rate" style={s.label}>{t.payRate}</label>
                        <input id="mw-inv-rate" style={s.input} type="number" min="0" step="0.01" value={inviteForm.hourly_rate} onChange={e => setInvite('hourly_rate', e.target.value)} />
                      </div>
                    )}
                  </div>
                  {inviteError && <p style={s.errorText}>{inviteError}</p>}
                  <button style={{ ...s.saveBtn, ...(inviteSaving ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }} type="submit" disabled={inviteSaving}>{inviteSaving ? t.sendingInvite : t.sendInvite}</button>
                </>
              )}
            </form>
          )}
        </div>
      )}

      {workers.length === 0 ? (
        <div style={s.emptyState}>
          <div style={s.emptyStateIcon}>👷</div>
          <p style={s.emptyStateTitle}>{t.noUsers}</p>
          <p style={s.emptyStateSubtitle}>Add your first worker using the form above.</p>
        </div>
      ) : (
        <div style={s.list}>
          {workers.map(w => {
            const isExpanded = expandedId === w.id;
            const isEditing = editingId === w.id;
            return (
              <div key={w.id} style={s.item}>
                <button style={s.itemBar} onClick={() => toggleExpand(w.id)}>
                  <div style={s.itemLeft}>
                    <span style={s.itemName}>{w.full_name}</span>
                    <span style={s.itemUsername}>@{w.username}</span>
                    <RoleBadge role={w.role} />
                  </div>
                  <span style={{ ...s.chevron, transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▾</span>
                </button>

                {isExpanded && (
                  <div style={s.panel}>

                    {/* ── Profile section ── */}
                    {identityEditable && (
                      <div style={s.section}>
                        <div style={s.sectionHeader}>
                          <span style={s.sectionTitle}>{t.profile}</span>
                          {(!isEditing || editSection !== 'info') && (
                            <button style={s.sectionBtn} onClick={() => isEditing && editSection === 'info' ? cancelEdit() : startEditInfo(w)}>{t.edit}</button>
                          )}
                        </div>
                        {isEditing && editSection === 'info' ? (
                          <div style={s.editBlock}>
                            <div style={s.formGrid}>
                              <div style={s.fieldGroup}>
                                <label htmlFor="mw-edit-full-name" style={s.label}>{t.fullName}</label>
                                <input id="mw-edit-full-name" style={s.input} value={editInfoForm.full_name} onChange={e => setEditInfoForm(f => ({ ...f, full_name: e.target.value }))} />
                              </div>
                              <div style={s.fieldGroup}>
                                <label htmlFor="mw-edit-invoice-name" style={s.label}>Invoice Name <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
                                <input id="mw-edit-invoice-name" style={s.input} value={editInfoForm.invoice_name} onChange={e => setEditInfoForm(f => ({ ...f, invoice_name: e.target.value }))} placeholder={t.invoiceNamePlaceholder} />
                              </div>
                              <div style={s.fieldGroup}>
                                <label htmlFor="mw-edit-email" style={s.label}>{t.email}</label>
                                <input id="mw-edit-email" style={s.input} type="email" value={editInfoForm.email} onChange={e => setEditInfoForm(f => ({ ...f, email: e.target.value }))} />
                              </div>
                              <div style={s.fieldGroup}>
                                <label htmlFor="mw-edit-role" style={s.label}>{t.role}</label>
                                <select id="mw-edit-role" style={s.input} value={editInfoForm.role} onChange={e => setEditInfoForm(f => ({ ...f, role: e.target.value }))}>
                                  <option value="worker">{t.workerRole}</option>
                                  <option value="admin">{t.adminRole}</option>
                                </select>
                              </div>
                              <div style={s.fieldGroup}>
                                <label htmlFor="mw-edit-worker-type" style={s.label}>Worker Type</label>
                                <select id="mw-edit-worker-type" style={s.input} value={editInfoForm.worker_type || 'employee'} onChange={e => setEditInfoForm(f => ({ ...f, worker_type: e.target.value }))}>
                                  <option value="employee">Employee (W-2)</option>
                                  <option value="contractor">Independent Contractor (1099-NEC)</option>
                                  <option value="subcontractor">Subcontractor (1099-NEC)</option>
                                  <option value="owner">Owner / Officer</option>
                                </select>
                              </div>
                              <div style={s.fieldGroup}>
                                <label htmlFor="mw-edit-language" style={s.label}>{t.language}</label>
                                <select id="mw-edit-language" style={s.input} value={editInfoForm.language} onChange={e => setEditInfoForm(f => ({ ...f, language: e.target.value }))}>
                                  {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                              </div>
                            </div>
                            <div style={s.editActions}>
                              <button style={{ ...s.saveBtn, ...(editInfoSaving ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }} onClick={() => saveInfo(w.id)} disabled={editInfoSaving}>{editInfoSaving ? t.loading : t.save}</button>
                              <button style={s.cancelBtn} onClick={cancelEdit}>{t.cancel}</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={s.infoGrid}>
                              <span style={s.infoLabel}>Name</span>
                              <span style={s.infoValue}>{w.full_name}</span>
                              {w.invoice_name && <>
                                <span style={s.infoLabel}>Invoice Name</span>
                                <span style={s.infoValue}>{w.invoice_name}</span>
                              </>}
                              <span style={s.infoLabel}>Email</span>
                              <span style={s.infoValue}>{w.email || <em style={{ color: '#9ca3af' }}>{t.notSet}</em>}</span>
                              <span style={s.infoLabel}>Language</span>
                              <span style={s.infoValue}>{w.language || 'English'}</span>
                              <span style={s.infoLabel}>Role</span>
                              <span style={s.infoValue}><RoleBadge role={w.role} /></span>
                              <span style={s.infoLabel}>Worker Type</span>
                              <span style={s.infoValue}>{WORKER_TYPE_LABELS[w.worker_type || 'employee']}</span>
                            </div>
                            {w.must_change_password && w.email && (
                              <div style={s.inviteBanner}>
                                <span style={s.inviteBannerText}>Has not signed in yet.</span>
                                {invitedIds.has(w.id) ? (
                                  <span style={s.inviteSentLabel}>Invite sent ✓</span>
                                ) : (
                                  <button style={{ ...s.inviteBtn, ...(inviteSending.has(w.id) ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }} onClick={() => sendInvite(w.id)} disabled={inviteSending.has(w.id)}>
                                    {inviteSending.has(w.id) ? 'Sending...' : 'Send invite email'}
                                  </button>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* ── Username section ── */}
                    {identityEditable && (
                      <div style={s.section}>
                        <div style={s.sectionHeader}>
                          <span style={s.sectionTitle}>{t.usernameSection}</span>
                          {(!isEditing || editSection !== 'username') && (
                            <button style={s.sectionBtn} onClick={() => isEditing && editSection === 'username' ? cancelEdit() : startEditUsername(w)}>{t.changeUsername}</button>
                          )}
                        </div>
                        {isEditing && editSection === 'username' ? (
                          <div style={s.editBlock}>
                            <div style={s.fieldGroup}>
                              <label htmlFor="mw-edit-username" style={s.label}>{t.newUsername}{editUsernameChecking ? ' (checking...)' : editUsernameTaken ? ' ⚠ taken' : ''}</label>
                              <input
                                id="mw-edit-username"
                                style={{ ...s.input, borderColor: editUsernameTaken ? '#fca5a5' : undefined, maxWidth: 240 }}
                                value={editUsernameVal}
                                onChange={e => { setEditUsernameVal(e.target.value); setEditUsernameTaken(false); }}
                                onBlur={e => checkEditUsername(e.target.value, w.id)}
                              />
                            </div>
                            <div style={s.editActions}>
                              <button style={{ ...s.saveBtn, ...((editUsernameSaving || editUsernameTaken) ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }} onClick={() => saveUsername(w.id)} disabled={editUsernameSaving || editUsernameTaken}>{editUsernameSaving ? t.loading : t.save}</button>
                              <button style={s.cancelBtn} onClick={cancelEdit}>{t.cancel}</button>
                            </div>
                          </div>
                        ) : (
                          <span style={s.infoMono}>@{w.username}</span>
                        )}
                      </div>
                    )}

                    {/* ── Pay Rate section ── */}
                    {showRate && (
                      <div style={s.section}>
                        <div style={s.sectionHeader}>
                          <span style={s.sectionTitle}>{t.payRateSection}</span>
                          {(!isEditing || editSection !== 'rate') && (
                            <button style={s.sectionBtn} onClick={() => isEditing && editSection === 'rate' ? cancelEdit() : startEditRate(w)}>{t.edit}</button>
                          )}
                        </div>
                        {isEditing && editSection === 'rate' ? (
                          <div style={s.editBlock}>
                            <div style={s.formGrid}>
                              <div style={s.fieldGroup}>
                                <label htmlFor="mw-edit-rate" style={s.label}>{t.amount}</label>
                                <input id="mw-edit-rate" style={{ ...s.input, maxWidth: 120 }} type="number" min="0" step="0.01" value={editRateForm.rate} onChange={e => setEditRateForm(f => ({ ...f, rate: e.target.value }))} />
                              </div>
                              <div style={s.fieldGroup}>
                                <label htmlFor="mw-edit-rate-type" style={s.label}>{t.rateType}</label>
                                <select id="mw-edit-rate-type" style={s.input} value={editRateForm.rate_type} onChange={e => setEditRateForm(f => ({ ...f, rate_type: e.target.value }))}>
                                  {rateTypes.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                              </div>
                              <div style={s.fieldGroup}>
                                <label htmlFor="mw-edit-overtime-rule" style={s.label}>{t.overtimeRule}</label>
                                <select id="mw-edit-overtime-rule" style={s.input} value={editRateForm.overtime_rule} onChange={e => setEditRateForm(f => ({ ...f, overtime_rule: e.target.value }))}>
                                  {overtimeRules.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                              </div>
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151', userSelect: 'none' }}>
                                <input
                                  type="checkbox"
                                  checked={editRateForm.guarantee_enabled}
                                  onChange={e => setEditRateForm(f => ({ ...f, guarantee_enabled: e.target.checked }))}
                                />
                                <span style={{ fontWeight: 600 }}>Weekly minimum hour guarantee</span>
                              </label>
                              {editRateForm.guarantee_enabled && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, marginLeft: 24 }}>
                                  <input
                                    style={{ ...s.input, maxWidth: 80 }}
                                    type="number"
                                    min="1"
                                    step="0.5"
                                    value={editRateForm.guaranteed_weekly_hours}
                                    onChange={e => setEditRateForm(f => ({ ...f, guaranteed_weekly_hours: e.target.value }))}
                                  />
                                  <span style={{ fontSize: 13, color: '#6b7280' }}>hrs/week — invoice will include shortfall to reach this minimum</span>
                                </div>
                              )}
                            </div>
                            <div style={s.editActions}>
                              <button style={{ ...s.saveBtn, ...(editRateSaving ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }} onClick={() => saveRate(w.id)} disabled={editRateSaving}>{editRateSaving ? t.loading : t.save}</button>
                              <button style={s.cancelBtn} onClick={cancelEdit}>{t.cancel}</button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span style={s.infoValue}>{fmtRate(w, currency)}</span>
                            <span style={{ ...s.infoValue, marginLeft: 10, fontSize: 12, color: '#9ca3af' }}>
                              {overtimeRules.find(r => r.value === (w.overtime_rule || 'daily'))?.label}
                            </span>
                            {w.guaranteed_weekly_hours != null && parseFloat(w.guaranteed_weekly_hours) > 0 && (
                              <span style={{ ...s.infoValue, marginLeft: 10, fontSize: 12, color: '#2563eb', background: '#dbeafe', padding: '1px 7px', borderRadius: 8 }}>
                                {parseFloat(w.guaranteed_weekly_hours)}h/wk min
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Permissions section (admin-role workers only, visible to full-access admins) ── */}
                    {w.role === 'admin' && !currentUser?.admin_permissions && (
                      <div style={s.section}>
                        <div style={s.sectionHeader}>
                          <span style={s.sectionTitle}>Permissions</span>
                          {(!isEditing || editSection !== 'permissions') && (
                            <button style={s.sectionBtn} onClick={() => startEditPermissions(w)}>Edit</button>
                          )}
                        </div>
                        {isEditing && editSection === 'permissions' ? (
                          <div style={s.editBlock}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#111827' }}>
                              <input
                                type="checkbox"
                                checked={editPermForm.full_access}
                                onChange={e => setEditPermForm(f => ({ ...f, full_access: e.target.checked }))}
                              />
                              Full access (no restrictions)
                            </label>
                            {!editPermForm.full_access && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 4, marginTop: 4 }}>
                                {PERM_LABELS.map(({ key, label }) => (
                                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                                    <input
                                      type="checkbox"
                                      checked={editPermForm.keys[key] === true}
                                      onChange={e => setEditPermForm(f => ({ ...f, keys: { ...f.keys, [key]: e.target.checked } }))}
                                    />
                                    {label}
                                  </label>
                                ))}
                              </div>
                            )}
                            <div style={s.editActions}>
                              <button style={{ ...s.saveBtn, ...(editPermSaving ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }} onClick={() => savePermissions(w.id)} disabled={editPermSaving}>{editPermSaving ? t.loading : t.save}</button>
                              <button style={s.cancelBtn} onClick={cancelEdit}>{t.cancel}</button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            {w.admin_permissions == null
                              ? <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>Full access</span>
                              : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
                                  {PERM_LABELS.filter(({ key }) => w.admin_permissions[key]).map(({ key, label }) => (
                                    <span key={key} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#dbeafe', color: '#1e40af' }}>{label}</span>
                                  ))}
                                  {PERM_LABELS.every(({ key }) => !w.admin_permissions[key]) && (
                                    <span style={{ fontSize: 13, color: '#9ca3af' }}>No permissions</span>
                                  )}
                                </div>
                              )
                            }
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Worker access section (admin-role workers only, visible to full-access admins) ── */}
                    {w.role === 'admin' && !currentUser?.admin_permissions && (
                      <div style={s.section}>
                        <div style={s.sectionHeader}>
                          <span style={s.sectionTitle}>Worker access</span>
                          {(!isEditing || editSection !== 'worker-access') && (
                            <button style={s.sectionBtn} onClick={() => startEditWorkerAccess(w)}>Edit</button>
                          )}
                        </div>
                        {isEditing && editSection === 'worker-access' ? (
                          <div style={s.editBlock}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#111827' }}>
                              <input
                                type="checkbox"
                                checked={editWorkerAccessForm.all_workers}
                                onChange={e => setEditWorkerAccessForm(f => ({ ...f, all_workers: e.target.checked }))}
                              />
                              All workers
                            </label>
                            {!editWorkerAccessForm.all_workers && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 4, marginTop: 4, maxHeight: 220, overflowY: 'auto' }}>
                                {workers.filter(wk => wk.role === 'worker').map(wk => (
                                  <label key={wk.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                                    <input
                                      type="checkbox"
                                      checked={editWorkerAccessForm.ids.has(wk.id)}
                                      onChange={e => {
                                        setEditWorkerAccessForm(f => {
                                          const ids = new Set(f.ids);
                                          e.target.checked ? ids.add(wk.id) : ids.delete(wk.id);
                                          return { ...f, ids };
                                        });
                                      }}
                                    />
                                    {wk.full_name} <span style={{ color: '#9ca3af', fontSize: 12 }}>@{wk.username}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                            <div style={s.editActions}>
                              <button style={{ ...s.saveBtn, ...(editWorkerAccessSaving ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }} onClick={() => saveWorkerAccess(w.id)} disabled={editWorkerAccessSaving}>{editWorkerAccessSaving ? t.loading : t.save}</button>
                              <button style={s.cancelBtn} onClick={cancelEdit}>{t.cancel}</button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            {!w.worker_access_ids || w.worker_access_ids.length === 0
                              ? <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>All workers</span>
                              : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
                                  {w.worker_access_ids.map(id => {
                                    const wk = workers.find(x => x.id === id);
                                    return wk ? (
                                      <span key={id} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#f3f4f6', color: '#374151' }}>{wk.full_name}</span>
                                    ) : null;
                                  })}
                                </div>
                              )
                            }
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Documents ── */}
                    {!isEditing && <WorkerDocuments workerId={w.id} />}

                    {/* ── Remove ── */}
                    {identityEditable && !isEditing && (
                      <div style={{ paddingTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                        {pendingRemoveId === w.id ? (
                          <>
                            <button style={s.confirmRemoveBtn} onClick={() => handleRemove(w.id)}>{t.confirm}</button>
                            <button style={s.cancelRemoveBtn} onClick={() => setPendingRemoveId(null)}>{t.cancel}</button>
                          </>
                        ) : (
                          <button style={s.removeBtn} onClick={() => setPendingRemoveId(w.id)}>{t.removeUser}</button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={s.historyFooter}>
        <button style={s.historyToggle} onClick={() => { setShowHistory(v => !v); loadArchived(); }}>
          {showHistory ? '▾' : '▸'} {t.history} {archived.length > 0 ? `(${archived.length})` : ''}
        </button>
        {showHistory && (
          <div style={s.historyList}>
            {loadingArchived ? <SkeletonList count={3} rows={1} />
              : archived.length === 0 ? (
                <div style={s.emptyState}>
                  <div style={s.emptyStateIcon}>🗑️</div>
                  <p style={s.emptyStateTitle}>{t.noRemovedUsers}</p>
                  <p style={s.emptyStateSubtitle}>Removed workers will appear here.</p>
                </div>
              )
              : archived.map(w => (
                <div key={w.id} style={s.historyItem}>
                  <div style={s.itemLeft}>
                    <span style={{ ...s.itemName, color: '#9ca3af' }}>{w.full_name}</span>
                    <span style={{ ...s.itemUsername, color: '#d1d5db' }}>@{w.username}</span>
                    <RoleBadge role={w.role} />
                  </div>
                  <button style={s.restoreBtn} onClick={() => handleRestore(w.id)}>{t.restore}</button>
                </div>
              ))
            }
          </div>
        )}
      </div>

      {/* QBO Vendor creation prompt */}
      {qboVendorPrompt && (
        <div style={s.qboPromptOverlay}>
          <div style={s.qboPromptModal}>
            <div style={s.qboPromptTitle}>Create QuickBooks Vendor?</div>
            <p style={s.qboPromptBody}>
              <strong>{qboVendorPrompt.display_name}</strong> was added as a contractor.
              Would you like to create them as a Vendor in QuickBooks Online so they can be mapped for expense tracking?
            </p>
            {qboVendorResult === 'ok' && (
              <div style={s.qboPromptSuccess}>Vendor created successfully in QuickBooks.</div>
            )}
            {qboVendorResult === 'error' && (
              <div style={s.qboPromptError}>Failed to create vendor in QuickBooks. You can set the mapping manually in QBO settings.</div>
            )}
            <div style={s.qboPromptActions}>
              {!qboVendorResult && (
                <button style={{ ...s.saveBtn, ...(qboVendorCreating ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }} onClick={createQboVendor} disabled={qboVendorCreating}>
                  {qboVendorCreating ? 'Creating…' : 'Yes, Create Vendor'}
                </button>
              )}
              <button style={s.cancelBtn} onClick={() => { setQboVendorPrompt(null); setQboVendorResult(null); }}>
                {qboVendorResult ? 'Close' : 'Skip'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 24 },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  cardTitle: { fontSize: 17, fontWeight: 700, margin: 0 },
  addBtn: { padding: '7px 16px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  addPanel: { background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 16 },
  modeTabs: { display: 'flex', gap: 4, marginBottom: 14, background: '#f0f4ff', borderRadius: 8, padding: 3, width: 'fit-content' },
  modeTab: { padding: '5px 14px', background: 'none', border: 'none', borderRadius: 6, fontSize: 13, color: '#666', cursor: 'pointer', fontWeight: 500 },
  modeTabActive: { padding: '5px 14px', background: '#fff', border: 'none', borderRadius: 6, fontSize: 13, color: '#1a56db', cursor: 'pointer', fontWeight: 700, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  addForm: { display: 'flex', flexDirection: 'column', gap: 12 },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: '#6b7280' },
  input: { padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 14 },
  eyeBtn: { position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: 0, lineHeight: 1 },
  errorBox: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  errorText: { color: '#e53e3e', fontSize: 13 },
  restoreInlineBtn: { background: '#059669', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  inviteSuccess: { background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#166534' },
  saveBtn: { padding: '8px 18px', background: '#059669', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer', width: 'fit-content' },
  cancelBtn: { padding: '8px 14px', background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', borderRadius: 7, fontSize: 13, cursor: 'pointer' },
  empty: { color: '#9ca3af', fontSize: 14, margin: 0 },
  emptyState: { textAlign: 'center', padding: '40px 0 24px' },
  emptyStateIcon: { fontSize: 40, marginBottom: 10 },
  emptyStateTitle: { fontSize: 16, fontWeight: 700, color: '#374151', margin: '0 0 4px' },
  emptyStateSubtitle: { fontSize: 13, color: '#9ca3af', margin: 0 },
  list: { display: 'flex', flexDirection: 'column', gap: 2 },
  item: { border: '1px solid #f3f4f6', borderRadius: 8, overflow: 'hidden' },
  itemBar: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 10 },
  itemLeft: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  itemName: { fontSize: 14, fontWeight: 600, color: '#111827' },
  itemUsername: { fontSize: 13, color: '#6b7280' },
  chevron: { fontSize: 14, color: '#9ca3af', transition: 'transform 0.2s', flexShrink: 0, display: 'inline-block' },
  panel: { padding: '4px 16px 16px', borderTop: '1px solid #f3f4f6', background: '#f9fafb', display: 'flex', flexDirection: 'column', gap: 0 },
  section: { borderBottom: '1px solid #eeeeee', paddingBottom: 12, paddingTop: 12 },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionBtn: { padding: '3px 12px', background: 'none', border: '1px solid #d1d5db', color: '#374151', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  infoGrid: { display: 'grid', gridTemplateColumns: '90px 1fr', gap: '5px 12px', alignItems: 'center' },
  infoLabel: { fontSize: 12, color: '#6b7280', fontWeight: 500 },
  infoValue: { fontSize: 14, color: '#111827' },
  infoMono: { fontSize: 14, color: '#374151', fontFamily: 'monospace' },
  editBlock: { display: 'flex', flexDirection: 'column', gap: 10 },
  editActions: { display: 'flex', gap: 8 },
  removeBtn: { padding: '6px 14px', background: 'none', border: '1px solid #fca5a5', color: '#ef4444', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  confirmRemoveBtn: { padding: '6px 14px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  cancelRemoveBtn: { padding: '6px 14px', background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  inviteBanner: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, padding: '8px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7 },
  inviteBannerText: { fontSize: 12, color: '#92400e', flex: 1 },
  inviteBtn: { padding: '4px 12px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  inviteSentLabel: { fontSize: 12, color: '#059669', fontWeight: 600, flexShrink: 0 },
  historyFooter: { marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 },
  historyToggle: { background: 'none', border: 'none', color: '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '2px 0' },
  historyList: { marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 },
  historyItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f9fafb', borderRadius: 7 },
  restoreBtn: { padding: '4px 12px', background: 'none', border: '1px solid #6ee7b7', color: '#059669', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  qboPromptOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  qboPromptModal: { background: '#fff', borderRadius: 12, padding: 28, maxWidth: 440, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: 12 },
  qboPromptTitle: { fontSize: 17, fontWeight: 700, color: '#111827' },
  qboPromptBody: { fontSize: 14, color: '#374151', margin: 0, lineHeight: 1.5 },
  qboPromptActions: { display: 'flex', gap: 10, marginTop: 4 },
  qboPromptSuccess: { fontSize: 13, color: '#059669', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, padding: '8px 12px' },
  qboPromptError: { fontSize: 13, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, padding: '8px 12px' },
};
