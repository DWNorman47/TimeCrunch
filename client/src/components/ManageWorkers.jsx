import React, { useState, useEffect } from 'react';
import api from '../api';

const LANGUAGES = ['English', 'Spanish'];

export default function ManageWorkers({ workers, onWorkerAdded, onWorkerDeleted, onWorkerUpdated, onWorkerRestored, defaultRate = 30 }) {
  const [form, setForm] = useState({ full_name: '', username: '', password: '', email: '', role: 'worker', language: 'English', hourly_rate: String(defaultRate) });
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

  const loadArchived = async () => {
    setLoadingArchived(true);
    try {
      const r = await api.get('/admin/workers/archived');
      setArchived(r.data);
    } finally {
      setLoadingArchived(false);
    }
  };

  useEffect(() => { loadArchived(); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setEdit = (k, v) => setEditForm(f => ({ ...f, [k]: v }));

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
      loadArchived();
    } catch {
      alert('Failed to remove user');
    }
  };

  const handleRestore = async (id) => {
    try {
      const r = await api.patch(`/admin/workers/${id}/restore`);
      onWorkerRestored({ ...r.data, total_entries: 0, total_hours: 0, regular_hours: 0, overtime_hours: 0, prevailing_hours: 0 });
      setArchived(prev => prev.filter(w => w.id !== id));
    } catch {
      alert('Failed to restore user');
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
      const r = await api.patch(`/admin/workers/${id}`, editForm);
      onWorkerUpdated(r.data);
      cancelEdit();
    } catch {
      alert('Failed to update user');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <h3 style={styles.cardTitle}>Manage Users</h3>
        <button style={styles.addBtn} onClick={() => { setShowForm(s => !s); setError(''); setArchivedConflict(null); }}>
          {showForm ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {showForm && (
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
          <input style={{ ...styles.input, maxWidth: 120 }} type="number" min="0" step="0.01" placeholder="$/hr (30)" value={form.hourly_rate} onChange={e => set('hourly_rate', e.target.value)} />
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
      )}

      {workers.length === 0 ? (
        <p style={styles.empty}>No users yet.</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Username</th>
              <th style={styles.th}>Type</th>
              <th style={styles.th}>Language</th>
              <th style={styles.th}>Rate</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {workers.map(w => editingId === w.id ? (
              <React.Fragment key={w.id}>
                <tr style={{ ...styles.tr, background: '#f0f4ff' }}>
                  <td style={styles.td}>
                    <input style={styles.editInput} value={editForm.full_name} onChange={e => setEdit('full_name', e.target.value)} />
                  </td>
                  <td style={styles.td}>@{w.username}</td>
                  <td style={styles.td}>
                    <select style={styles.editInput} value={editForm.role} onChange={e => setEdit('role', e.target.value)}>
                      <option value="worker">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td style={styles.td}>
                    <select style={styles.editInput} value={editForm.language} onChange={e => setEdit('language', e.target.value)}>
                      {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </td>
                  <td style={styles.td}>
                    <input style={{ ...styles.editInput, width: 70 }} type="number" min="0" step="0.01" value={editForm.hourly_rate} onChange={e => setEdit('hourly_rate', e.target.value)} />
                  </td>
                  <td style={styles.tdAction}>
                    <button style={styles.saveEditBtn} onClick={() => handleSaveEdit(w.id)} disabled={editSaving}>
                      {editSaving ? '...' : 'Save'}
                    </button>
                    <button style={styles.cancelBtn} onClick={cancelEdit}>Cancel</button>
                  </td>
                </tr>
                <tr style={{ ...styles.tr, background: '#f0f4ff' }}>
                  <td style={styles.td} colSpan={5}>
                    <input style={{ ...styles.editInput, maxWidth: 280 }} type="email" placeholder="Email (optional)" value={editForm.email} onChange={e => setEdit('email', e.target.value)} />
                  </td>
                  <td style={styles.tdAction} />
                </tr>
              </React.Fragment>
            ) : (
              <tr key={w.id} style={styles.tr}>
                <td style={styles.td}>{w.full_name}</td>
                <td style={styles.td}>@{w.username}</td>
                <td style={styles.td}>
                  <span style={{ ...styles.roleBadge, background: w.role === 'admin' ? '#1a56db' : '#6b7280' }}>
                    {w.role === 'admin' ? 'Admin' : 'User'}
                  </span>
                </td>
                <td style={styles.td}>{w.language || '—'}</td>
                <td style={styles.td}>${parseFloat(w.hourly_rate ?? 30).toFixed(2)}/hr</td>
                <td style={styles.tdAction}>
                  <button style={styles.editBtn} onClick={() => startEdit(w)}>Edit</button>
                  <button style={styles.removeBtn} onClick={() => handleRemove(w.id, w.full_name)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={styles.historyFooter}>
        <button style={styles.historyToggle} onClick={() => setShowHistory(s => !s)}>
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
