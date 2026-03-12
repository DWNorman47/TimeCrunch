import React, { useState } from 'react';
import api from '../api';

const LANGUAGES = ['English', 'Spanish'];

export default function ManageWorkers({ workers, onWorkerAdded, onWorkerDeleted, onWorkerUpdated }) {
  const [form, setForm] = useState({ full_name: '', username: '', password: '', role: 'worker', language: 'English' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setEdit = (k, v) => setEditForm(f => ({ ...f, [k]: v }));

  const handleAdd = async e => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const r = await api.post('/admin/workers', form);
      onWorkerAdded(r.data);
      setForm({ full_name: '', username: '', password: '', role: 'worker', language: 'English' });
      setShowForm(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete "${name}"? This will also delete all their time entries.`)) return;
    try {
      await api.delete(`/admin/workers/${id}`);
      onWorkerDeleted(id);
    } catch {
      alert('Failed to delete user');
    }
  };

  const startEdit = w => {
    setEditingId(w.id);
    setEditForm({ full_name: w.full_name, role: w.role, language: w.language || 'English' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

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
        <button style={styles.addBtn} onClick={() => setShowForm(s => !s)}>
          {showForm ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} style={styles.form}>
          <input style={styles.input} placeholder="Full name" value={form.full_name} onChange={e => set('full_name', e.target.value)} required />
          <input style={styles.input} placeholder="Username" value={form.username} onChange={e => set('username', e.target.value)} required />
          <input style={styles.input} type="password" placeholder="Temporary password" value={form.password} onChange={e => set('password', e.target.value)} required minLength={6} />
          <select style={styles.input} value={form.role} onChange={e => set('role', e.target.value)}>
            <option value="worker">User</option>
            <option value="admin">Admin</option>
          </select>
          <select style={styles.input} value={form.language} onChange={e => set('language', e.target.value)}>
            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {error && <p style={styles.error}>{error}</p>}
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
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {workers.map(w => editingId === w.id ? (
              <tr key={w.id} style={{ ...styles.tr, background: '#f0f4ff' }}>
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
                <td style={styles.tdAction}>
                  <button style={styles.saveEditBtn} onClick={() => handleSaveEdit(w.id)} disabled={editSaving}>
                    {editSaving ? '...' : 'Save'}
                  </button>
                  <button style={styles.cancelBtn} onClick={cancelEdit}>Cancel</button>
                </td>
              </tr>
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
                <td style={styles.tdAction}>
                  <button style={styles.editBtn} onClick={() => startEdit(w)}>Edit</button>
                  <button style={styles.deleteBtn} onClick={() => handleDelete(w.id, w.full_name)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
  error: { color: '#e53e3e', fontSize: 13, width: '100%' },
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
  deleteBtn: { background: 'none', border: '1px solid #fca5a5', color: '#ef4444', padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
};
