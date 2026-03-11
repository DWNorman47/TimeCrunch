import React, { useState } from 'react';
import api from '../api';

export default function ManageProjects({ projects, onProjectAdded, onProjectDeleted }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async e => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const r = await api.post('/admin/projects', { name });
      onProjectAdded(r.data);
      setName('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create project');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, projectName) => {
    if (!confirm(`Delete project "${projectName}"?`)) return;
    try {
      await api.delete(`/admin/projects/${id}`);
      onProjectDeleted(id);
    } catch {
      alert('Failed to delete project');
    }
  };

  return (
    <div style={styles.card}>
      <h3 style={styles.cardTitle}>Manage Projects</h3>
      <form onSubmit={handleAdd} style={styles.form}>
        <input
          style={styles.input}
          placeholder="Project name..."
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
        <button style={styles.addBtn} type="submit" disabled={saving}>{saving ? 'Adding...' : '+ Add'}</button>
      </form>
      {error && <p style={styles.error}>{error}</p>}

      {projects.length === 0 ? (
        <p style={styles.empty}>No projects yet.</p>
      ) : (
        <div style={styles.list}>
          {projects.map(p => (
            <div key={p.id} style={styles.item}>
              <span style={styles.projectName}>{p.name}</span>
              <button style={styles.deleteBtn} onClick={() => handleDelete(p.id, p.name)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 24 },
  cardTitle: { fontSize: 17, fontWeight: 700, marginBottom: 14 },
  form: { display: 'flex', gap: 10, marginBottom: 12 },
  input: { flex: 1, padding: '8px 11px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 },
  addBtn: { padding: '8px 18px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14 },
  error: { color: '#e53e3e', fontSize: 13, marginBottom: 8 },
  empty: { color: '#888', fontSize: 14 },
  list: { display: 'flex', flexDirection: 'column', gap: 6 },
  item: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f8f9fb', borderRadius: 7 },
  projectName: { fontSize: 14, fontWeight: 500 },
  deleteBtn: { background: 'none', border: '1px solid #fca5a5', color: '#ef4444', padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
};
