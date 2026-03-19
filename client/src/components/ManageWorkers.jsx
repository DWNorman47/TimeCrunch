import React, { useState, useEffect } from 'react';
import api from '../api';
import { useToast } from '../contexts/ToastContext';

const LANGUAGES = ['English', 'Spanish'];

export default function ManageWorkers({ workers, onWorkerAdded, onWorkerDeleted, onWorkerUpdated, onWorkerRestored, defaultRate = 30, showRate = true, identityEditable = true }) {
  const toast = useToast();
  const [form, setForm] = useState({ full_name: '', username: '', password: '', email: '', role: 'worker', language: 'English', hourly_rate: String(defaultRate) });
  const [addMode, setAddMode] = useState('manual'); // 'manual' | 'invite'
  const [inviteForm, setInviteForm] = useState({ full_name: '', email: '', role: 'worker', language: 'English', hourly_rate: String(defaultRate) });
  const [inviteError, setInviteError] = useState('');
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteSent, setInviteSent] = useState('');
  const [error, setError] = useState('');
  const [archivedConflict, setArchivedConflict] = useState(null); // { id, name }
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [archived, setArchived] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [archivedFetched, setArchivedFetched] = useState(false);

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

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setInvite = (k, v) => setInviteForm(f => ({ ...f, [k]: v }));
  const setEdit = (k, v) => setEditForm(f => ({ ...f, [k]: v }));

  const handleInvite = async e => {
    e.preventDefault();
    setInviteError('');
    setInviteSaving(true);
    try {
      const r = await api.post('/admin/workers/invite', inviteForm);
      onWorkerAdded(r.data);
      if (r.data.email_sent === false) {
        setInviteError('Worker created, but the invite email failed to send. You can resend the invite later.');
        setInviteForm({ full_name: '', email: '', role: 'worker', language: 'English', hourly_rate: String(defaultRate) });
      } else {
        setInviteSent(inviteForm.email);
        setInviteForm({ full_name: '', email: '', role: 'worker', language: 'English', hourly_rate: String(defaultRate) });
      }
    } catch (err) {
      setInviteError(err.response?.data?.error || 'Failed to send invite');
    } finally {
      setInviteSaving(false);
    }
  };

  const handleAdd = async e => {
    e.preventDefault();
    setError('');
    setArchivedConflict(null);
    setSaving(true);
    try {
      const r = await api.post('/admin/workers', form);
      onWorkerAdded(r.data);
      setForm({ full_name: '', username: '', password: '', email: '', role: 'worker', language: 'English', hourly_rate: String(defaultRate) });
      setShowForm(false);
    } catch (err) {
      const data = err.response?.data;
      if (data?.archived_id) {
        setArchivedConflict({ id: data.archived_id, name: data.archived_name });
        setError(data.error);
      } else {
        setError(data?.error || 'Failed to create user');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id, name) => {
    if (!confirm(`Remove "${name}"? Their time entries will be kept. You can restore them from History.`)) return;
    try {
      await api.delete(`/admin/workers/${id}`);
      onWorkerDeleted(id);
      setArchivedFetched(false); // stale — will re-fetch when History is next opened
    } catch {
      toast('Failed to remove user', 'error');
    }
  };

  const handleRestore = async (id) => {
    try {
      const r = await api.patch(`/admin/workers/${id}/restore`);
      onWorkerRestored({ ...r.data, total_entries: 0, total_hours: 0, regular_hours: 0, overtime_hours: 0, prevailing_hours: 0 });
      setArchived(prev => prev.filter(w => w.id !== id));
    } catch {
      toast('Failed to restore user', 'error');
    }
  };

  const handleRestoreConflict = async () => {
    if (!archivedConflict) return;
    await handleRestore(archivedConflict.id);
    setArchivedConflict(null);
    setError('');
    setShowForm(false);
  };

  const startEdit = w => {
    setEditingId(w.id);
    setEditForm({ full_name: w.full_name, role: w.role, language: w.language || 'English', hourly_rate: String(w.hourly_rate ?? 30), email: w.email || '' });
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
    } catch {
      toast('Failed to update user', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <h3 style={styles.cardTitle}>Manage Users</h3>
        <button style={styles.addBtn} onClick={() => { setShowForm(s => !s); setError(''); setArchivedConflict(null); setInviteError(''); setInviteSent(''); }}>
          {showForm ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {showForm && (
        <div>
          <div style={styles.modeTabs}>
            <button style={addMode === 'manual' ? styles.modeTabActive : styles.modeTab} onClick={() => setAddMode('manual')}>Add manually</button>
            <button style={addMode === 'invite' ? styles.modeTabActive : styles.modeTab} onClick={() => setAddMode('invite')}>Invite by email</button>
          </div>

          {addMode === 'manual' ? (
            <form onSubmit={handleAdd} style={styles.form}>
              <input style={styles.input} placeholder="Full name" value={form.full_name} onChange={e => set('full_name', e.target.value)} required />
              <input style={styles.input} placeholder="Username" value={form.username} onChange={e => set('username', e.target.value)} required />
              <input style={styles.input} type="password" placeholder="Temporary password" value={form.password} onChange={e => set('password', e.target.value)} required minLength={6} />
              <input style={styles.input} type="email" placeholder="Email (optional, for password reset)" value={form.email} onChange={e => set('email', e.target.value)} />
              <select style={styles.input} value={form.role} onChange={e => set('role', e.target.value)}>
                <option value="worker">User</option>
                <option value="admin">Admin</option>
              </select>
              <select style={styles.input} value={form.language} onChange={e => set('language', e.target.value)}>
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              {showRate && <input style={{ ...styles.input, maxWidth: 120 }} type="number" min="0" step="0.01" placeholder="$/hr (30)" value={form.hourly_rate} onChange={e => set('hourly_rate', e.target.value)} />}
              {error && (
                <div style={styles.errorBox}>
                  <p style={styles.errorText}>{error}</p>
                  {archivedConflict && (
                    <button type="button" style={styles.restoreInlineBtn} onClick={handleRestoreConflict}>
                      Restore {archivedConflict.name}
                    </button>
                  )}
                </div>
              )}
              <button style={styles.saveBtn} type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create User'}</button>
            </form>
          ) : (
            <form onSubmit={handleInvite} style={styles.form}>
              {inviteSent ? (
                <div style={styles.inviteSuccess}>
                  Invite sent to <strong>{inviteSent}</strong>. They'll receive an email to set their password.
                  <button type="button" style={{ ...styles.restoreInlineBtn, marginLeft: 12 }} onClick={() => setInviteSent('')}>Send another</button>
                </div>
              ) : (
                <>
                  <input style={styles.input} placeholder="Full name" value={inviteForm.full_name} onChange={e => setInvite('full_name', e.target.value)} required />
                  <input style={styles.input} type="email" placeholder="Email address (required)" value={inviteForm.email} onChange={e => setInvite('email', e.target.value)} required />
                  <select style={styles.input} value={inviteForm.role} onChange={e => setInvite('role', e.target.value)}>
                    <option value="worker">User</option>
                    <option value="admin">Admin</option>
                  </select>
                  <select style={styles.input} value={inviteForm.language} onChange={e => setInvite('language', e.target.value)}>
                    {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                  {showRate && <input style={{ ...styles.input, maxWidth: 120 }} type="number" min="0" step="0.01" placeholder="$/hr (30)" value={inviteForm.hourly_rate} onChange={e => setInvite('hourly_rate', e.target.value)} />}
                  {inviteError && <p style={styles.errorText}>{inviteError}</p>}
                  <button style={styles.saveBtn} type="submit" disabled={inviteSaving}>{inviteSaving ? 'Sending...' : 'Send Invite'}</button>
                </>
              )}
            </form>
          )}
        </div>
      )}

      {workers.length === 0 ? (
        <p style={styles.empty}>No users yet.</p>
      ) : (
        <div className="table-scroll">
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th} className="col-hide-mobile">Username</th>
              {identityEditable && <th style={styles.th}>Type</th>}
              {identityEditable && <th style={styles.th} className="col-hide-mobile">Language</th>}
              {showRate && <th style={styles.th} className="col-hide-mobile">Rate</th>}
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {workers.map(w => {
              if (editingId === w.id) {
                return (
                  <React.Fragment key={w.id}>
                    <tr style={{ ...styles.tr, background: '#f0f4ff' }}>
                      <td style={styles.td}>
                        {identityEditable
                          ? <input style={styles.editInput} value={editForm.full_name} onChange={e => setEdit('full_name', e.target.value)} />
                          : w.full_name}
                      </td>
                      <td style={styles.td}>@{w.username}</td>
                      {identityEditable && (
                        <td style={styles.td}>
                          <select style={styles.editInput} value={editForm.role} onChange={e => setEdit('role', e.target.value)}>
                            <option value="worker">User</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                      )}
                      {identityEditable && (
                        <td style={styles.td}>
                          <select style={styles.editInput} value={editForm.language} onChange={e => setEdit('language', e.target.value)}>
                            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </td>
                      )}
                      {showRate && (
                        <td style={styles.td}>
                          <input style={{ ...styles.editInput, width: 70 }} type="number" min="0" step="0.01" value={editForm.hourly_rate} onChange={e => setEdit('hourly_rate', e.target.value)} />
                        </td>
                      )}
                      <td style={styles.tdAction}>
                        <button style={styles.saveEditBtn} onClick={() => handleSaveEdit(w.id)} disabled={editSaving}>
                          {editSaving ? '...' : 'Save'}
                        </button>
                        <button style={styles.cancelBtn} onClick={cancelEdit}>Cancel</button>
                      </td>
                    </tr>
                    {identityEditable && (
                      <tr style={{ ...styles.tr, background: '#f0f4ff' }}>
                        <td style={styles.td} colSpan={showRate ? 5 : 4}>
                          <input style={{ ...styles.editInput, maxWidth: 280 }} type="email" placeholder="Email (optional)" value={editForm.email} onChange={e => setEdit('email', e.target.value)} />
                        </td>
                        <td style={styles.tdAction} />
                      </tr>
                    )}
                  </React.Fragment>
                );
              }
              return (
                <tr key={w.id} style={styles.tr}>
                  <td style={styles.td}>{w.full_name}</td>
                  <td style={styles.td}>@{w.username}</td>
                  {identityEditable && (
                    <td style={styles.td}>
                      <span style={{ ...styles.roleBadge, background: w.role === 'admin' ? '#1a56db' : '#6b7280' }}>
                        {w.role === 'admin' ? 'Admin' : 'User'}
                      </span>
                    </td>
                  )}
                  {identityEditable && <td style={styles.td}>{w.language || '—'}</td>}
                  {showRate && <td style={styles.td}>${parseFloat(w.hourly_rate ?? 30).toFixed(2)}/hr</td>}
                  <td style={styles.tdAction}>
                    <button style={styles.editBtn} onClick={() => startEdit(w)}>Edit</button>
                    {identityEditable && <button style={styles.removeBtn} onClick={() => handleRemove(w.id, w.full_name)}>Remove</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      <div style={styles.historyFooter}>
        <button style={styles.historyToggle} onClick={() => { setShowHistory(s => !s); loadArchived(); }}>
          {showHistory ? '▾' : '▸'} History {archived.length > 0 ? `(${archived.length})` : ''}
        </button>
        {showHistory && (
          <div style={styles.historySection}>
            {loadingArchived ? (
              <p style={styles.empty}>Loading...</p>
            ) : archived.length === 0 ? (
              <p style={styles.empty}>No removed users.</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Username</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {archived.map(w => (
                    <tr key={w.id} style={{ ...styles.tr, color: '#888' }}>
                      <td style={styles.td}>{w.full_name}</td>
                      <td style={styles.td}>@{w.username}</td>
                      <td style={styles.td}>{w.role === 'admin' ? 'Admin' : 'User'}</td>
                      <td style={styles.tdAction}>
                        <button style={styles.restoreBtn} onClick={() => handleRestore(w.id)}>Restore</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 24 },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  cardTitle: { fontSize: 17, fontWeight: 700 },
  addBtn: { padding: '7px 16px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13 },
  modeTabs: { display: 'flex', gap: 4, marginBottom: 14, background: '#f0f4ff', borderRadius: 8, padding: 3, width: 'fit-content' },
  modeTab: { padding: '5px 14px', background: 'none', border: 'none', borderRadius: 6, fontSize: 13, color: '#666', cursor: 'pointer', fontWeight: 500 },
  modeTabActive: { padding: '5px 14px', background: '#fff', border: 'none', borderRadius: 6, fontSize: 13, color: '#1a56db', cursor: 'pointer', fontWeight: 700, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  inviteSuccess: { background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#166534' },
  form: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-start' },
  input: { padding: '8px 11px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, flex: 1, minWidth: 140 },
  editInput: { padding: '5px 8px', border: '1px solid #c7d2fe', borderRadius: 6, fontSize: 13, width: '100%' },
  errorBox: { width: '100%', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  errorText: { color: '#e53e3e', fontSize: 13, margin: 0 },
  restoreInlineBtn: { background: '#059669', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  saveBtn: { padding: '8px 18px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14 },
  empty: { color: '#888', fontSize: 14 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', fontSize: 12, color: '#999', fontWeight: 600, textTransform: 'uppercase', padding: '6px 8px', borderBottom: '1px solid #eee' },
  tr: { borderBottom: '1px solid #f5f5f5' },
  td: { padding: '10px 8px', fontSize: 14 },
  tdAction: { padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' },
  roleBadge: { color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 },
  editBtn: { background: 'none', border: '1px solid #93c5fd', color: '#2563eb', padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', marginRight: 6 },
  saveEditBtn: { background: '#059669', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', marginRight: 6, fontWeight: 600 },
  cancelBtn: { background: 'none', border: '1px solid #ddd', color: '#666', padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  removeBtn: { background: 'none', border: '1px solid #fca5a5', color: '#ef4444', padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  historyFooter: { marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 },
  historyToggle: { background: 'none', border: 'none', color: '#666', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '2px 0' },
  historySection: { marginTop: 10 },
  restoreBtn: { background: 'none', border: '1px solid #6ee7b7', color: '#059669', padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 },
};
