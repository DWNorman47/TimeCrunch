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
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Wage Type</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {projects.map(p => editingId === p.id ? (
              <tr key={p.id} style={{ ...styles.tr, background: '#f0f4ff' }}>
                <td style={styles.td}>
                  <input
                    style={styles.editInput}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') setEditingId(null); }}
                    autoFocus
                  />
                </td>
                <td style={styles.td}>
                  <select style={styles.editInput} value={editWageType} onChange={e => setEditWageType(e.target.value)}>
                    <option value="regular">Regular Wages</option>
                    <option value="prevailing">Prevailing Wages</option>
                  </select>
                </td>
                <td style={styles.tdAction}>
                  <button style={styles.saveBtn} onClick={() => handleEditSave(p.id)}>Save</button>
                  <button style={styles.cancelBtn} onClick={() => setEditingId(null)}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={p.id} style={styles.tr}>
                <td style={styles.td}>{p.name}</td>
                <td style={styles.td}>
                  <span style={{ ...styles.wageBadge, background: p.wage_type === 'prevailing' ? '#d97706' : '#2563eb' }}>
                    {p.wage_type === 'prevailing' ? 'Prevailing Wages' : 'Regular Wages'}
                  </span>
                </td>
                <td style={styles.tdAction}>
                  <button style={styles.editBtn} onClick={() => { setEditingId(p.id); setEditName(p.name); setEditWageType(p.wage_type); }}>Edit</button>
                  <button style={styles.removeBtn} onClick={() => handleRemove(p.id, p.name)}>Remove</button>
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
              <p style={styles.empty}>No removed projects.</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Wage Type</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {archived.map(p => (
                    <tr key={p.id} style={{ ...styles.tr, color: '#888' }}>
                      <td style={styles.td}>{p.name}</td>
                      <td style={styles.td}>{p.wage_type === 'prevailing' ? 'Prevailing Wages' : 'Regular Wages'}</td>
                      <td style={styles.tdAction}>
                        <button style={styles.restoreBtn} onClick={() => handleRestore(p.id)}>Restore</button>
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
  cardTitle: { fontSize: 17, fontWeight: 700, marginBottom: 14 },
  form: { display: 'flex', gap: 10, marginBottom: 12 },
  input: { flex: 1, padding: '8px 11px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 },
  select: { padding: '8px 11px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 },
  addBtn: { padding: '8px 18px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14 },
  errorBox: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 },
  errorText: { color: '#e53e3e', fontSize: 13, margin: 0 },
  restoreInlineBtn: { background: '#059669', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  empty: { color: '#888', fontSize: 14 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', fontSize: 12, color: '#999', fontWeight: 600, textTransform: 'uppercase', padding: '6px 8px', borderBottom: '1px solid #eee' },
  tr: { borderBottom: '1px solid #f5f5f5' },
  td: { padding: '10px 8px', fontSize: 14 },
  tdAction: { padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' },
  editInput: { padding: '5px 8px', border: '1px solid #c7d2fe', borderRadius: 6, fontSize: 13, width: '100%' },
  wageBadge: { color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' },
  removeBtn: { background: 'none', border: '1px solid #fca5a5', color: '#ef4444', padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  editBtn: { background: 'none', border: '1px solid #93c5fd', color: '#2563eb', padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  saveBtn: { background: '#1a56db', color: '#fff', border: 'none', padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { background: 'none', border: '1px solid #ddd', color: '#666', padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  historyFooter: { marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 },
  historyToggle: { background: 'none', border: 'none', color: '#666', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '2px 0' },
  historySection: { marginTop: 10 },
  restoreBtn: { background: 'none', border: '1px solid #6ee7b7', color: '#059669', padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 },
};
