import React, { useState } from 'react';
import api from '../api';

export default function TimeEntryForm({ projects, onEntryAdded }) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    project_id: '',
    work_date: today,
    start_time: '',
    end_time: '',
    notes: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectedProject = projects.find(p => p.id === parseInt(form.project_id));

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (form.start_time >= form.end_time) {
      setError('End time must be after start time');
      return;
    }
    setSaving(true);
    try {
      const r = await api.post('/time-entries', form);
      onEntryAdded({ ...r.data, project_name: selectedProject?.name });
      setForm(f => ({ ...f, start_time: '', end_time: '', notes: '' }));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.heading}>Log Time</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.row}>
          <div style={styles.field}>
            <label style={styles.label}>Project</label>
            <select style={styles.input} value={form.project_id} onChange={e => set('project_id', e.target.value)} required>
              <option value="">Select project...</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.wage_type === 'prevailing' ? 'Prevailing' : 'Regular'})
                </option>
              ))}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Date</label>
            <input style={styles.input} type="date" value={form.work_date} onChange={e => set('work_date', e.target.value)} required />
          </div>
        </div>
        <div style={styles.row}>
          <div style={styles.field}>
            <label style={styles.label}>Start Time</label>
            <input style={styles.input} type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} required />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>End Time</label>
            <input style={styles.input} type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} required />
          </div>
        </div>
        {selectedProject && (
          <div style={styles.wageIndicator}>
            Wage type: <span style={{ color: selectedProject.wage_type === 'prevailing' ? '#d97706' : '#2563eb', fontWeight: 700 }}>
              {selectedProject.wage_type === 'prevailing' ? 'Prevailing' : 'Regular'}
            </span>
          </div>
        )}
        <div style={styles.field}>
          <label style={styles.label}>Notes (optional)</label>
          <input style={styles.input} type="text" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any notes..." />
        </div>
        {error && <p style={styles.error}>{error}</p>}
        {success && <p style={styles.success}>Entry saved!</p>}
        <button style={styles.button} type="submit" disabled={saving}>{saving ? 'Saving...' : 'Log Entry'}</button>
      </form>
    </div>
  );
}

const styles = {
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' },
  heading: { marginBottom: 20, fontSize: 18, fontWeight: 700 },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  row: { display: 'flex', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1 },
  label: { fontSize: 13, fontWeight: 600, color: '#555' },
  input: { padding: '9px 11px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, width: '100%' },
  wageIndicator: { fontSize: 13, color: '#555', padding: '6px 2px' },
  error: { color: '#e53e3e', fontSize: 13 },
  success: { color: '#38a169', fontSize: 13 },
  button: { padding: '11px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600 },
};
