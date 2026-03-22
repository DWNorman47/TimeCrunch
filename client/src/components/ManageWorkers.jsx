import React, { useState } from 'react';
import api from '../api';
import { useToast } from '../contexts/ToastContext';

const LANGUAGES = ['English', 'Spanish'];

function RoleBadge({ role }) {
  const isAdmin = role === 'admin' || role === 'super_admin';
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: isAdmin ? '#dbeafe' : '#f3f4f6', color: isAdmin ? '#1e40af' : '#6b7280' }}>
      {isAdmin ? 'Admin' : 'Worker'}
    </span>
  );
}

export default function ManageWorkers({ workers, onWorkerAdded, onWorkerDeleted, onWorkerUpdated, onWorkerRestored, defaultRate = 0, showRate = true, identityEditable = true }) {
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [addMode, setAddMode] = useState('manual');
  const [form, setForm] = useState({ full_name: '', username: '', password: '', email: '', role: 'worker', language: 'English', hourly_rate: String(defaultRate) });
  const [inviteForm, setInviteForm] = useState({ full_name: '', email: '', role: 'worker', language: 'English', hourly_rate: String(defaultRate) });
  const [error, setError] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteSent, setInviteSent] = useState('');
  const [saving, setSaving] = useState(false);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [archivedConflict, setArchivedConflict] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [archived, setArchived] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [archivedFetched, setArchivedFetched] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setInvite = (k, v) => setInviteForm(f => ({ ...f, [k]: v }));
  const setEdit = (k, v) => setEditForm(f => ({ ...f, [k]: v }));

  const loadArchived = async () => {
    if (archivedFetched) return;
    setLoadingArchived(true);
    try {
      const r = await api.get('/admin/workers/archived');
      setArchived(r.data);
      setArchivedFetched(true);
    } finally {
      setLoadingArchived(false);
    }
  };

  const handleAdd = async e => {
    e.preventDefault();
    setError(''); setArchivedConflict(null); setSaving(true);
    try {
      const r = await api.post('/admin/workers', form);
      onWorkerAdded(r.data);
      setForm({ full_name: '', username: '', password: '', email: '', role: 'worker', language: 'English', hourly_rate: String(defaultRate) });
      setShowForm(false);
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
      const r = await api.post('/admin/workers/invite', inviteForm);
      onWorkerAdded(r.data);
      if (r.data.email_sent === false) {
        setInviteError('Worker created, but the invite email failed to send.');
        setInviteForm({ full_name: '', email: '', role: 'worker', language: 'English', hourly_rate: String(defaultRate) });
      } else {
        setInviteSent(inviteForm.email);
        setInviteForm({ full_name: '', email: '', role: 'worker', language: 'English', hourly_rate: String(defaultRate) });
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

  const handleRemove = async (id, name) => {
    if (!confirm(`Remove "${name}"? Their time entries will be kept. You can restore them from History.`)) return;
    try {
      await api.delete(`/admin/workers/${id}`);
      onWorkerDeleted(id);
      setArchivedFetched(false);
      if (expandedId === id) setExpandedId(null);
    } catch { toast('Failed to remove user', 'error'); }
  };

  const handleRestore = async id => {
    try {
      const r = await api.patch(`/admin/workers/${id}/restore`);
      onWorkerRestored({ ...r.data, total_entries: 0, total_hours: 0, regular_hours: 0, overtime_hours: 0, prevailing_hours: 0 });
      setArchived(prev => prev.filter(w => w.id !== id));
    } catch { toast('Failed to restore user', 'error'); }
  };

  const startEdit = w => {
    setEditingId(w.id);
    setEditForm({ full_name: w.full_name, role: w.role, language: w.language || 'English', hourly_rate: String(w.hourly_rate ?? 0), email: w.email || '' });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({}); };

  const handleSaveEdit = async id => {
    setEditSaving(true);
    try {
      const patch = identityEditable && showRate ? editForm
        : identityEditable ? { full_name: editForm.full_name, role: editForm.role, language: editForm.language, email: editForm.email }
        : { hourly_rate: editForm.hourly_rate };
      const r = await api.patch(`/admin/workers/${id}`, patch);
      onWorkerUpdated(r.data);
      cancelEdit();
    } catch { toast('Failed to update user', 'error'); }
    finally { setEditSaving(false); }
  };

  const toggleExpand = id => {
    if (expandedId === id) { setExpandedId(null); if (editingId === id) cancelEdit(); }
    else { setExpandedId(id); setEditingId(null); }
  };

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <h3 style={s.cardTitle}>Users</h3>
        <button style={s.addBtn} onClick={() => { setShowForm(v => !v); setError(''); setArchivedConflict(null); setInviteError(''); setInviteSent(''); }}>
          {showForm ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {showForm && (
        <div style={s.addPanel}>
          <div style={s.modeTabs}>
            <button style={addMode === 'manual' ? s.modeTabActive : s.modeTab} onClick={() => setAddMode('manual')}>Add manually</button>
            <button style={addMode === 'invite' ? s.modeTabActive : s.modeTab} onClick={() => setAddMode('invite')}>Invite by email</button>
          </div>

          {addMode === 'manual' ? (
            <form onSubmit={handleAdd} style={s.addForm}>
              <div style={s.formGrid}>
                <div style={s.fieldGroup}>
                  <label style={s.label}>Full name</label>
                  <input style={s.input} value={form.full_name} onChange={e => set('full_name', e.target.value)} required />
                </div>
                <div style={s.fieldGroup}>
                  <label style={s.label}>Username</label>
                  <input style={s.input} value={form.username} onChange={e => set('username', e.target.value)} required />
                </div>
                <div style={s.fieldGroup}>
                  <label style={s.label}>Temporary password</label>
                  <input style={s.input} type="password" value={form.password} onChange={e => set('password', e.target.value)} required minLength={6} />
                </div>
                <div style={s.fieldGroup}>
                  <label style={s.label}>Email (optional)</label>
                  <input style={s.input} type="email" value={form.email} onChange={e => set('email', e.target.value)} />
                </div>
                <div style={s.fieldGroup}>
                  <label style={s.label}>Role</label>
                  <select style={s.input} value={form.role} onChange={e => set('role', e.target.value)}>
                    <option value="worker">Worker</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div style={s.fieldGroup}>
                  <label style={s.label}>Language</label>
                  <select style={s.input} value={form.language} onChange={e => set('language', e.target.value)}>
                    {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                {showRate && (
                  <div style={s.fieldGroup}>
                    <label style={s.label}>Pay rate ($/hr)</label>
                    <input style={s.input} type="number" min="0" step="0.01" value={form.hourly_rate} onChange={e => set('hourly_rate', e.target.value)} />
                  </div>
                )}
              </div>
              {error && (
                <div style={s.errorBox}>
                  <span style={s.errorText}>{error}</span>
                  {archivedConflict && <button type="button" style={s.restoreInlineBtn} onClick={handleRestoreConflict}>Restore {archivedConflict.name}</button>}
                </div>
              )}
              <button style={s.saveBtn} type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create User'}</button>
            </form>
          ) : (
            <form onSubmit={handleInvite} style={s.addForm}>
              {inviteSent ? (
                <div style={s.inviteSuccess}>
                  Invite sent to <strong>{inviteSent}</strong>.{' '}
                  <button type="button" style={s.restoreInlineBtn} onClick={() => setInviteSent('')}>Send another</button>
                </div>
              ) : (
                <>
                  <div style={s.formGrid}>
                    <div style={s.fieldGroup}>
                      <label style={s.label}>Full name</label>
                      <input style={s.input} value={inviteForm.full_name} onChange={e => setInvite('full_name', e.target.value)} required />
                    </div>
                    <div style={s.fieldGroup}>
                      <label style={s.label}>Email</label>
                      <input style={s.input} type="email" value={inviteForm.email} onChange={e => setInvite('email', e.target.value)} required />
                    </div>
                    <div style={s.fieldGroup}>
                      <label style={s.label}>Role</label>
                      <select style={s.input} value={inviteForm.role} onChange={e => setInvite('role', e.target.value)}>
                        <option value="worker">Worker</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div style={s.fieldGroup}>
                      <label style={s.label}>Language</label>
                      <select style={s.input} value={inviteForm.language} onChange={e => setInvite('language', e.target.value)}>
                        {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    {showRate && (
                      <div style={s.fieldGroup}>
                        <label style={s.label}>Pay rate ($/hr)</label>
                        <input style={s.input} type="number" min="0" step="0.01" value={inviteForm.hourly_rate} onChange={e => setInvite('hourly_rate', e.target.value)} />
                      </div>
                    )}
                  </div>
                  {inviteError && <p style={s.errorText}>{inviteError}</p>}
                  <button style={s.saveBtn} type="submit" disabled={inviteSaving}>{inviteSaving ? 'Sending...' : 'Send Invite'}</button>
                </>
              )}
            </form>
          )}
        </div>
      )}

      {workers.length === 0 ? (
        <p style={s.empty}>No users yet.</p>
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

                {isExpanded && !isEditing && (
                  <div style={s.panel}>
                    <div style={s.panelGrid}>
                      {identityEditable && (
                        <>
                          <span style={s.panelLabel}>Email</span>
                          <span style={s.panelValue}>{w.email || <em style={{ color: '#9ca3af' }}>not set</em>}</span>
                          <span style={s.panelLabel}>Language</span>
                          <span style={s.panelValue}>{w.language || 'English'}</span>
                        </>
                      )}
                      {showRate && (
                        <>
                          <span style={s.panelLabel}>Pay rate</span>
                          <span style={s.panelValue}>${parseFloat(w.hourly_rate ?? 0).toFixed(2)}/hr</span>
                        </>
                      )}
                    </div>
                    <div style={s.panelActions}>
                      <button style={s.editBtn} onClick={() => startEdit(w)}>Edit</button>
                      {identityEditable && (
                        <button style={s.removeBtn} onClick={() => handleRemove(w.id, w.full_name)}>Remove</button>
                      )}
                    </div>
                  </div>
                )}

                {isExpanded && isEditing && (
                  <div style={s.panel}>
                    <div style={s.formGrid}>
                      {identityEditable && (
                        <>
                          <div style={s.fieldGroup}>
                            <label style={s.label}>Full name</label>
                            <input style={s.input} value={editForm.full_name} onChange={e => setEdit('full_name', e.target.value)} />
                          </div>
                          <div style={s.fieldGroup}>
                            <label style={s.label}>Email</label>
                            <input style={s.input} type="email" value={editForm.email} onChange={e => setEdit('email', e.target.value)} />
                          </div>
                          <div style={s.fieldGroup}>
                            <label style={s.label}>Role</label>
                            <select style={s.input} value={editForm.role} onChange={e => setEdit('role', e.target.value)}>
                              <option value="worker">Worker</option>
                              <option value="admin">Admin</option>
                            </select>
                          </div>
                          <div style={s.fieldGroup}>
                            <label style={s.label}>Language</label>
                            <select style={s.input} value={editForm.language} onChange={e => setEdit('language', e.target.value)}>
                              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                          </div>
                        </>
                      )}
                      {showRate && (
                        <div style={s.fieldGroup}>
                          <label style={s.label}>Pay rate ($/hr)</label>
                          <input style={s.input} type="number" min="0" step="0.01" value={editForm.hourly_rate} onChange={e => setEdit('hourly_rate', e.target.value)} />
                        </div>
                      )}
                    </div>
                    <div style={s.panelActions}>
                      <button style={s.saveBtn} onClick={() => handleSaveEdit(w.id)} disabled={editSaving}>{editSaving ? 'Saving...' : 'Save'}</button>
                      <button style={s.cancelBtn} onClick={cancelEdit}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={s.historyFooter}>
        <button style={s.historyToggle} onClick={() => { setShowHistory(v => !v); loadArchived(); }}>
          {showHistory ? '▾' : '▸'} History {archived.length > 0 ? `(${archived.length})` : ''}
        </button>
        {showHistory && (
          <div style={s.historyList}>
            {loadingArchived ? <p style={s.empty}>Loading...</p>
              : archived.length === 0 ? <p style={s.empty}>No removed users.</p>
              : archived.map(w => (
                <div key={w.id} style={s.historyItem}>
                  <div style={s.itemLeft}>
                    <span style={{ ...s.itemName, color: '#9ca3af' }}>{w.full_name}</span>
                    <span style={{ ...s.itemUsername, color: '#d1d5db' }}>@{w.username}</span>
                    <RoleBadge role={w.role} />
                  </div>
                  <button style={s.restoreBtn} onClick={() => handleRestore(w.id)}>Restore</button>
                </div>
              ))
            }
          </div>
        )}
      </div>
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
  errorBox: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  errorText: { color: '#e53e3e', fontSize: 13 },
  restoreInlineBtn: { background: '#059669', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  inviteSuccess: { background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#166534' },
  saveBtn: { padding: '8px 18px', background: '#059669', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer', width: 'fit-content' },
  cancelBtn: { padding: '8px 14px', background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', borderRadius: 7, fontSize: 13, cursor: 'pointer' },
  empty: { color: '#9ca3af', fontSize: 14, margin: 0 },
  list: { display: 'flex', flexDirection: 'column', gap: 2 },
  item: { border: '1px solid #f3f4f6', borderRadius: 8, overflow: 'hidden' },
  itemBar: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 10 },
  itemLeft: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  itemName: { fontSize: 14, fontWeight: 600, color: '#111827' },
  itemUsername: { fontSize: 13, color: '#6b7280' },
  chevron: { fontSize: 14, color: '#9ca3af', transition: 'transform 0.2s', flexShrink: 0, display: 'inline-block' },
  panel: { padding: '12px 16px', borderTop: '1px solid #f3f4f6', background: '#f9fafb', display: 'flex', flexDirection: 'column', gap: 12 },
  panelGrid: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: '6px 12px', alignItems: 'center' },
  panelLabel: { fontSize: 12, fontWeight: 600, color: '#6b7280' },
  panelValue: { fontSize: 14, color: '#111827' },
  panelActions: { display: 'flex', gap: 8 },
  editBtn: { padding: '6px 14px', background: 'none', border: '1px solid #93c5fd', color: '#2563eb', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  removeBtn: { padding: '6px 14px', background: 'none', border: '1px solid #fca5a5', color: '#ef4444', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  historyFooter: { marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 },
  historyToggle: { background: 'none', border: 'none', color: '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '2px 0' },
  historyList: { marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 },
  historyItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f9fafb', borderRadius: 7 },
  restoreBtn: { padding: '4px 12px', background: 'none', border: '1px solid #6ee7b7', color: '#059669', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
};
