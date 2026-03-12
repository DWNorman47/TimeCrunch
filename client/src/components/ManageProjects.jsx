import React, { useState, useEffect } from 'react';
import api from '../api';

export default function ManageProjects({ projects, onProjectAdded, onProjectDeleted, onProjectUpdated, onProjectRestored }) {
  const [name, setName] = useState('');
  const [wageType, setWageType] = useState('regular');
  const [error, setError] = useState('');
  const [archivedConflict, setArchivedConflict] = useState(null); // { id, name }
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editWageType, setEditWageType] = useState('regular');
  const [archived, setArchived] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingArchived, setLoadingArchived] = useState(false);

  const loadArchived = async () => {
    setLoadingArchived(true);
    try {
      const r = await api.get('/admin/projects/archived');
      setArchived(r.data);
    } finally {
      setLoadingArchived(false);
    }
  };

  useEffect(() => { loadArchived(); }, []);

  const handleAdd = async e => {
    e.preventDefault();
    setError('');
    setArchivedConflict(null);
    setSaving(true);
    try {
      const r = await api.post('/admin/projects', { name, wage_type: wageType });
      onProjectAdded(r.data);
      setName('');
      setWageType('regular');
    } catch (err) {
      const data = err.response?.data;
      if (data?.archived_id) {
        setArchivedConflict({ id: data.archived_id, name: data.archived_name });
        setError(data.error);
      } else {
        setError(data?.error || 'Failed to create project');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEditSave = async (id) => {
    if (!editName.trim()) return;
    try {
      const r = await api.patch(`/admin/projects/${id}`, { name: editName.trim(), wage_type: editWageType });
      onProjectUpdated(r.data);
      setEditingId(null);
    } catch {
      alert('Failed to update project');
    }
  };

  const handleRemove = async (id, projectName) => {
    if (!confirm(`Remove project "${projectName}"? Its time entries will be kept. You can restore it from History.`)) return;
    try {
      await api.delete(`/admin/projects/${id}`);
      onProjectDeleted(id);
      loadArchived();
    } catch {
      alert('Failed to remove project');
    }
  };

  const handleRestore = async (id) => {
    try {
      const r = await api.patch(`/admin/projects/${id}/restore`);
      onProjectRestored(r.data);
      setArchived(prev => prev.filter(p => p.id !== id));
    } catch {
      alert('Failed to restore project');
    }
  };

  const handleRestoreConflict = async () => {
    if (!archivedConflict) return;
    await handleRestore(archivedConflict.id);
    setArchivedConflict(null);
    setError('');
  };

  return (
    <div style={styles.card}>
      <h3 style={styles.cardTitle}>Manage Projects</h3>
      <form onSubmit={handleAdd} style={styles.form}>
        <input
          style={styles.input}
          placeholder="Project name..."
          value={name}
          onChange={e => { setName(e.target.value); setError(''); setArchivedConflict(null); }}
          required
        />
        <select style={styles.select} value={wageType} onChange={e => setWageType(e.target.value)}>
          <option value="regular">Regular Wages</option>
          <option value="prevailing">Prevailing Wages</option>
        </select>
        <button style={styles.addBtn} type="submit" disabled={saving}>{saving ? 'Adding...' : '+ Add'}</button>
      </form>
      {error && (
        <div style={styles.errorBox}>
          <p style={styles.errorText}>{error}</p>
          {archivedConflict && (
            <button type="button" style={styles.restoreInlineBtn} onClick={handleRestoreConflict}>
              Restore "{archivedConflict.name}"
            </button>
          )}
        </div>
      )}

      {projects.length === 0 ? (
        <p style={styles.empty}>No projects yet.</p>
      ) : (
        <div style={styles.list}>
          {projects.map(p => (
            <div key={p.id} style={styles.item}>
              {editingId === p.id ? (
                <>
                  <input
                    style={{ ...styles.input, flex: 1, marginRight: 8 }}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') setEditingId(null); }}
                    autoFocus
                  />
                  <select style={{ ...styles.select, marginRight: 8 }} value={editWageType} onChange={e => setEditWageType(e.target.value)}>
                    <option value="regular">Regular Wages</option>
                    <option value="prevailing">Prevailing Wages</option>
                  </select>
                </>
              ) : (
                <>
                  <span style={styles.projectName}>{p.name}</span>
                  <span style={{ ...styles.wageBadge, background: p.wage_type === 'prevailing' ? '#d97706' : '#2563eb' }}>
                    {p.wage_type === 'prevailing' ? 'Prevailing Wages' : 'Regular Wages'}
                  </span>
                </>
              )}
              <div style={styles.itemRight}>
                {editingId === p.id ? (
                  <>
                    <button style={styles.saveBtn} onClick={() => handleEditSave(p.id)}>Save</button>
                    <button style={styles.cancelBtn} onClick={() => setEditingId(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button style={styles.editBtn} onClick={() => { setEditingId(p.id); setEditName(p.name); setEditWageType(p.wage_type); }}>Edit</button>
                    <button style={styles.removeBtn} onClick={() => handleRemove(p.id, p.name)}>Remove</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
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
              <p style={styles.empty}>No removed projects.</p>
            ) : (
              archived.map(p => (
                <div key={p.id} style={{ ...styles.item, color: '#888', marginTop: 6 }}>
                  <span style={styles.projectName}>{p.name}</span>
                  <div style={styles.itemRight}>
                    <span style={{ fontSize: 11, color: '#aaa', marginRight: 8 }}>
                      {p.wage_type === 'prevailing' ? 'Prevailing' : 'Regular'}
                    </span>
                    <button style={styles.restoreBtn} onClick={() => handleRestore(p.id)}>Restore</button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 24 },
  cardTitle: { fontSize: 17, fontWeight: 700, marginBottom: 14 },
  form: { display: 'flex', gap: 10, marginBottom: 12 },
  input: { flex: 1, padding: '8px 11px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 },
  select: { padding: '8px 11px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 },
  addBtn: { padding: '8px 18px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14 },
  errorBox: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 },
  errorText: { color: '#e53e3e', fontSize: 13, margin: 0 },
  restoreInlineBtn: { background: '#059669', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  empty: { color: '#888', fontSize: 14 },
  list: { display: 'flex', flexDirection: 'column', gap: 6 },
  item: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f8f9fb', borderRadius: 7, gap: 8 },
  itemRight: { display: 'flex', gap: 8, alignItems: 'center' },
  projectName: { fontSize: 14, fontWeight: 500 },
  wageBadge: { color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, marginLeft: 10, whiteSpace: 'nowrap' },
  removeBtn: { background: 'none', border: '1px solid #fca5a5', color: '#ef4444', padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  editBtn: { background: 'none', border: '1px solid #93c5fd', color: '#2563eb', padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  saveBtn: { background: '#1a56db', color: '#fff', border: 'none', padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { background: 'none', border: '1px solid #ddd', color: '#666', padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  historyFooter: { marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 },
  historyToggle: { background: 'none', border: 'none', color: '#666', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '2px 0' },
  historySection: { marginTop: 10 },
  restoreBtn: { background: 'none', border: '1px solid #6ee7b7', color: '#059669', padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 },
};
