import React, { useState, useEffect } from 'react';
import api from '../api';
import { useToast } from '../contexts/ToastContext';

export default function ManageProjects({ projects, onProjectAdded, onProjectDeleted, onProjectUpdated, onProjectRestored, showWageType = true, nameEditable = true, showGeofenceBudget = true }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [wageType, setWageType] = useState('regular');
  const [error, setError] = useState('');
  const [archivedConflict, setArchivedConflict] = useState(null); // { id, name }
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editWageType, setEditWageType] = useState('regular');
  const [editGeoLat, setEditGeoLat] = useState('');
  const [editGeoLng, setEditGeoLng] = useState('');
  const [editGeoRadius, setEditGeoRadius] = useState('');
  const [editBudgetHours, setEditBudgetHours] = useState('');
  const [editBudgetDollars, setEditBudgetDollars] = useState('');
  const [geoLocating, setGeoLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
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
    if (nameEditable && !editName.trim()) return;
    const payload = {};
    if (nameEditable) payload.name = editName.trim();
    if (showWageType) payload.wage_type = editWageType;
    if (editGeoLat && editGeoLng && editGeoRadius) {
      payload.geo_lat = editGeoLat;
      payload.geo_lng = editGeoLng;
      payload.geo_radius_ft = editGeoRadius;
    }
    if (editBudgetHours !== '') payload.budget_hours = editBudgetHours || null;
    if (editBudgetDollars !== '') payload.budget_dollars = editBudgetDollars || null;
    try {
      const r = await api.patch(`/admin/projects/${id}`, payload);
      onProjectUpdated(r.data);
      setEditingId(null);
    } catch {
      toast('Failed to update project', 'error');
    }
  };

  const handleClearGeofence = async (id) => {
    if (!confirm('Remove geofence from this project?')) return;
    try {
      const r = await api.patch(`/admin/projects/${id}`, { clear_geofence: true });
      onProjectUpdated(r.data);
    } catch {
      toast('Failed to remove geofence', 'error');
    }
  };

  const handleClearBudget = async (id) => {
    if (!confirm('Remove budget from this project?')) return;
    try {
      const r = await api.patch(`/admin/projects/${id}`, { budget_hours: null, budget_dollars: null });
      onProjectUpdated(r.data);
    } catch {
      toast('Failed to remove budget', 'error');
    }
  };

  const hasBudget = p => parseFloat(p.budget_hours) > 0 || parseFloat(p.budget_dollars) > 0;

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by this browser.');
      return;
    }
    setGeoLocating(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      pos => {
        setEditGeoLat(pos.coords.latitude.toFixed(6));
        setEditGeoLng(pos.coords.longitude.toFixed(6));
        setGeoLocating(false);
      },
      err => {
        setGeoLocating(false);
        if (err.code === 1) setGeoError('Location access denied. Please allow location in your browser settings.');
        else if (err.code === 2) setGeoError('Location unavailable. Try entering coordinates manually.');
        else setGeoError('Location request timed out. Try again or enter coordinates manually.');
      },
      { timeout: 8000 }
    );
  };

  const handleRemove = async (id, projectName) => {
    if (!confirm(`Remove project "${projectName}"? Its time entries will be kept. You can restore it from History.`)) return;
    try {
      await api.delete(`/admin/projects/${id}`);
      onProjectDeleted(id);
      loadArchived();
    } catch {
      toast('Failed to remove project', 'error');
    }
  };

  const handleRestore = async (id) => {
    try {
      const r = await api.patch(`/admin/projects/${id}/restore`);
      onProjectRestored(r.data);
      setArchived(prev => prev.filter(p => p.id !== id));
    } catch {
      toast('Failed to restore project', 'error');
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
        {showWageType && (
          <select style={styles.select} value={wageType} onChange={e => setWageType(e.target.value)}>
            <option value="regular">Regular Wages</option>
            <option value="prevailing">Prevailing Wages</option>
          </select>
        )}
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
              {showWageType && <th style={styles.th}>Wage Type</th>}
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {projects.map(p => editingId === p.id ? (
              <tr key={p.id} style={{ ...styles.tr, background: '#f0f4ff' }}>
                <td style={styles.td} colSpan={3}>
                  <div style={styles.editBlock}>
                    <div style={styles.editRow}>
                      {nameEditable
                        ? <input
                            style={{ ...styles.editInput, flex: 2 }}
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') setEditingId(null); }}
                            autoFocus
                            placeholder="Project name"
                          />
                        : <span style={{ flex: 2, fontWeight: 600, fontSize: 13 }}>{editName}</span>
                      }
                      {showWageType && (
                        <select style={styles.editInput} value={editWageType} onChange={e => setEditWageType(e.target.value)}>
                          <option value="regular">Regular Wages</option>
                          <option value="prevailing">Prevailing Wages</option>
                        </select>
                      )}
                      <button style={styles.saveBtn} onClick={() => handleEditSave(p.id)}>Save</button>
                      <button style={styles.cancelBtn} onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                    {showGeofenceBudget && (
                      <div style={styles.geoSection}>
                        <span style={styles.geoLabel}>📍 Geofence (optional)</span>
                        <div style={styles.geoFields}>
                          <input style={styles.geoInput} type="number" step="0.000001" placeholder="Latitude" value={editGeoLat} onChange={e => setEditGeoLat(e.target.value)} />
                          <input style={styles.geoInput} type="number" step="0.000001" placeholder="Longitude" value={editGeoLng} onChange={e => setEditGeoLng(e.target.value)} />
                          <input style={styles.geoInput} type="number" min="50" step="50" placeholder="Radius (ft)" value={editGeoRadius} onChange={e => setEditGeoRadius(e.target.value)} />
                          <button style={styles.geoLocBtn} type="button" onClick={useMyLocation} disabled={geoLocating}>
                            {geoLocating ? '...' : '📡 My location'}
                          </button>
                        </div>
                        {geoError && <p style={styles.geoErrorText}>{geoError}</p>}
                        <p style={styles.geoHint}>Workers outside the radius will be blocked from clocking in. Leave blank to remove.</p>
                      </div>
                    )}
                    {showGeofenceBudget && (
                      <div style={styles.budgetSection}>
                        <span style={styles.budgetLabel}>💰 Budget (optional)</span>
                        <div style={styles.budgetFields}>
                          <div style={styles.budgetField}>
                            <label style={styles.budgetFieldLabel}>Hours</label>
                            <input style={styles.geoInput} type="number" min="0" step="0.5" placeholder="e.g. 200" value={editBudgetHours} onChange={e => setEditBudgetHours(e.target.value)} />
                          </div>
                          <div style={styles.budgetField}>
                            <label style={styles.budgetFieldLabel}>Dollars ($)</label>
                            <input style={styles.geoInput} type="number" min="0" step="100" placeholder="e.g. 15000" value={editBudgetDollars} onChange={e => setEditBudgetDollars(e.target.value)} />
                          </div>
                        </div>
                        <p style={styles.geoHint}>Shows a burn bar in Project Reports. Leave blank for no budget.</p>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={p.id} style={styles.tr}>
                <td style={styles.td}>
                  <span style={styles.projectName}>{p.name}</span>
                  <span style={styles.projectIndicators}>
                    {p.geo_radius_ft && <span style={styles.indicatorBadge} title={`Geofence: ${p.geo_radius_ft.toLocaleString()} ft radius`}>📍</span>}
                    {hasBudget(p) && <span style={styles.indicatorBadge} title={[parseFloat(p.budget_hours) > 0 && `${p.budget_hours} hrs`, parseFloat(p.budget_dollars) > 0 && `$${Number(p.budget_dollars).toLocaleString()}`].filter(Boolean).join(' / ')}>💰</span>}
                  </span>
                </td>
                {showWageType && (
                  <td style={styles.td}>
                    <span style={{ ...styles.wageBadge, background: p.wage_type === 'prevailing' ? '#d97706' : '#2563eb' }}>
                      {p.wage_type === 'prevailing' ? 'Prevailing Wages' : 'Regular Wages'}
                    </span>
                  </td>
                )}
                <td style={styles.tdAction}>
                  <button style={styles.editBtn} onClick={() => {
                    setEditingId(p.id);
                    setEditName(p.name);
                    setEditWageType(p.wage_type);
                    setEditGeoLat(p.geo_lat || '');
                    setEditGeoLng(p.geo_lng || '');
                    setEditGeoRadius(p.geo_radius_ft || '');
                    setEditBudgetHours(p.budget_hours || '');
                    setEditBudgetDollars(p.budget_dollars || '');
                  }}>Edit</button>
                  {p.geo_radius_ft && <button style={styles.clearGeoBtn} onClick={() => handleClearGeofence(p.id)}>✕ Fence</button>}
                  {hasBudget(p) && <button style={styles.clearGeoBtn} onClick={() => handleClearBudget(p.id)}>✕ Budget</button>}
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
                    {showWageType && <th style={styles.th}>Wage Type</th>}
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {archived.map(p => (
                    <tr key={p.id} style={{ ...styles.tr, color: '#888' }}>
                      <td style={styles.td}>{p.name}</td>
                      {showWageType && <td style={styles.td}>{p.wage_type === 'prevailing' ? 'Prevailing Wages' : 'Regular Wages'}</td>}
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
  editBtn: { background: 'none', border: '1px solid #93c5fd', color: '#2563eb', padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', marginRight: 6 },
  saveBtn: { background: '#1a56db', color: '#fff', border: 'none', padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { background: 'none', border: '1px solid #ddd', color: '#666', padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  historyFooter: { marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 },
  historyToggle: { background: 'none', border: 'none', color: '#666', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '2px 0' },
  historySection: { marginTop: 10 },
  restoreBtn: { background: 'none', border: '1px solid #6ee7b7', color: '#059669', padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 },
  editBlock: { display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' },
  editRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  geoSection: { background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 },
  geoLabel: { fontSize: 12, fontWeight: 700, color: '#0369a1' },
  geoFields: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  geoInput: { padding: '5px 8px', border: '1px solid #bae6fd', borderRadius: 6, fontSize: 13, width: 130 },
  geoLocBtn: { padding: '5px 10px', background: '#0369a1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  geoHint: { fontSize: 11, color: '#0369a1', margin: 0, opacity: 0.8 },
  geoErrorText: { fontSize: 11, color: '#dc2626', margin: 0, fontWeight: 600 },
  projectName: { verticalAlign: 'middle' },
  projectIndicators: { display: 'inline-flex', gap: 4, marginLeft: 6, verticalAlign: 'middle' },
  indicatorBadge: { fontSize: 13, lineHeight: 1, cursor: 'default' },
  clearGeoBtn: { background: 'none', border: '1px solid #e5e7eb', color: '#9ca3af', padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', marginRight: 4 },
  budgetSection: { background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 },
  budgetLabel: { fontSize: 12, fontWeight: 700, color: '#92400e' },
  budgetFields: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  budgetField: { display: 'flex', flexDirection: 'column', gap: 3 },
  budgetFieldLabel: { fontSize: 11, color: '#92400e', fontWeight: 600 },
};
