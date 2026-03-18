import React, { useState, useEffect } from 'react';
import api from '../api';

function startOfWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function toISO(d) { return d.toISOString().substring(0, 10); }
function fmtDay(d) { return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
function fmtTime(t) { const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr % 12 || 12}:${m}${hr < 12 ? 'a' : 'p'}`; }

export default function ManageSchedule({ workers, projects }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ user_id: '', project_id: '', shift_date: toISO(new Date()), start_time: '08:00', end_time: '17:00', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = toISO(days[0]);
  const to = toISO(days[6]);

  useEffect(() => {
    setLoading(true);
    api.get('/shifts/admin', { params: { from, to } })
      .then(r => setShifts(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [from, to]);

  // Keep the add-shift date in sync with the viewed week
  useEffect(() => {
    const today = toISO(new Date());
    const dateInView = today >= from && today <= to ? today : from;
    setForm(f => ({ ...f, shift_date: dateInView }));
  }, [from, to]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addShift = async e => {
    e.preventDefault();
    if (!form.user_id) { setError('Select a worker'); return; }
    setSaving(true); setError('');
    try {
      const r = await api.post('/shifts/admin', form);
      setShifts(prev => [...prev, r.data].sort((a, b) => a.shift_date.localeCompare(b.shift_date) || a.start_time.localeCompare(b.start_time)));
      setForm(f => ({ ...f, notes: '' }));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save shift');
    } finally { setSaving(false); }
  };

  const deleteShift = async id => {
    setDeleting(id);
    try {
      await api.delete(`/shifts/admin/${id}`);
      setShifts(prev => prev.filter(s => s.id !== id));
      if (editingId === id) setEditingId(null);
    } finally { setDeleting(null); }
  };

  const startEdit = s => {
    setEditingId(s.id);
    setEditForm({
      project_id: s.project_id || '',
      shift_date: s.shift_date.substring(0, 10),
      start_time: s.start_time.substring(0, 5),
      end_time: s.end_time.substring(0, 5),
      notes: s.notes || '',
    });
  };

  const saveEdit = async id => {
    setEditSaving(true);
    try {
      const r = await api.patch(`/shifts/admin/${id}`, editForm);
      setShifts(prev => prev.map(s => s.id === id ? r.data : s));
      setEditingId(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update shift');
    } finally { setEditSaving(false); }
  };

  const shiftsByDay = {};
  days.forEach(d => { shiftsByDay[toISO(d)] = []; });
  shifts.forEach(s => {
    const key = s.shift_date.substring(0, 10);
    if (shiftsByDay[key]) shiftsByDay[key].push(s);
  });

  return (
    <div style={styles.card}>
      <h3 style={styles.title}>Schedule</h3>

      {/* Add shift form */}
      <form onSubmit={addShift} style={styles.form}>
        <div style={styles.formRow}>
          <div style={styles.field}>
            <label style={styles.label}>Worker</label>
            <select style={styles.input} value={form.user_id} onChange={e => set('user_id', e.target.value)} required>
              <option value="">Select worker</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.full_name}</option>)}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Project</label>
            <select style={styles.input} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Date</label>
            <input style={styles.input} type="date" value={form.shift_date} onChange={e => set('shift_date', e.target.value)} required />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Start</label>
            <input style={styles.input} type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} required />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>End</label>
            <input style={styles.input} type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} required />
          </div>
          <div style={{ ...styles.field, flex: 2 }}>
            <label style={styles.label}>Notes</label>
            <input style={styles.input} type="text" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional" />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>&nbsp;</label>
            <button style={styles.addBtn} type="submit" disabled={saving}>{saving ? '...' : '+ Add Shift'}</button>
          </div>
        </div>
        {error && <p style={styles.error}>{error}</p>}
      </form>

      {/* Week navigation */}
      <div style={styles.weekNav}>
        <button style={styles.navBtn} onClick={() => setWeekStart(d => addDays(d, -7))}>‹ Prev</button>
        <span style={styles.weekLabel}>{fmtDay(days[0])} – {fmtDay(days[6])}</span>
        <button style={styles.navBtn} onClick={() => setWeekStart(d => addDays(d, 7))}>Next ›</button>
        <button style={styles.todayBtn} onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</button>
      </div>

      {loading ? <p style={{ color: '#888', fontSize: 13 }}>Loading...</p> : (
        <div style={styles.grid}>
          {days.map(day => {
            const key = toISO(day);
            const dayShifts = shiftsByDay[key] || [];
            const isToday = key === toISO(new Date());
            return (
              <div key={key} style={{ ...styles.dayCol, borderTop: `3px solid ${isToday ? '#1a56db' : '#e5e7eb'}` }}>
                <div style={{ ...styles.dayHead, color: isToday ? '#1a56db' : '#374151' }}>
                  {day.toLocaleDateString('en-US', { weekday: 'short' })} {day.getDate()}
                </div>
                {dayShifts.length === 0 ? (
                  <div style={styles.emptyDay} />
                ) : dayShifts.map(s => (
                  <div key={s.id}>
                    <div style={styles.shiftPill}>
                      <div style={styles.pillWorker}>{s.worker_name}</div>
                      {s.project_name && <div style={styles.pillProject}>{s.project_name}</div>}
                      <div style={styles.pillTime}>{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</div>
                      {s.notes && <div style={styles.pillNotes}>{s.notes}</div>}
                      <div style={styles.pillActions}>
                        <button style={styles.editPillBtn} onClick={() => editingId === s.id ? setEditingId(null) : startEdit(s)} title="Edit shift">✎</button>
                        <button style={styles.deleteBtn} onClick={() => deleteShift(s.id)} disabled={deleting === s.id}>
                          {deleting === s.id ? '...' : '✕'}
                        </button>
                      </div>
                    </div>
                    {editingId === s.id && (
                      <div style={styles.editPanel}>
                        <div style={styles.editGrid}>
                          <div style={styles.editField}>
                            <label style={styles.editLabel}>Date</label>
                            <input style={styles.editInput} type="date" value={editForm.shift_date} onChange={ev => setEditForm(f => ({ ...f, shift_date: ev.target.value }))} />
                          </div>
                          <div style={styles.editField}>
                            <label style={styles.editLabel}>Start</label>
                            <input style={styles.editInput} type="time" value={editForm.start_time} onChange={ev => setEditForm(f => ({ ...f, start_time: ev.target.value }))} />
                          </div>
                          <div style={styles.editField}>
                            <label style={styles.editLabel}>End</label>
                            <input style={styles.editInput} type="time" value={editForm.end_time} onChange={ev => setEditForm(f => ({ ...f, end_time: ev.target.value }))} />
                          </div>
                          <div style={styles.editField}>
                            <label style={styles.editLabel}>Project</label>
                            <select style={styles.editInput} value={editForm.project_id} onChange={ev => setEditForm(f => ({ ...f, project_id: ev.target.value }))}>
                              <option value="">None</option>
                              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </div>
                          <div style={{ ...styles.editField, flex: 2 }}>
                            <label style={styles.editLabel}>Notes</label>
                            <input style={styles.editInput} type="text" value={editForm.notes} onChange={ev => setEditForm(f => ({ ...f, notes: ev.target.value }))} placeholder="Optional" />
                          </div>
                        </div>
                        <div style={styles.editActions}>
                          <button style={styles.saveBtn} onClick={() => saveEdit(s.id)} disabled={editSaving}>{editSaving ? '...' : 'Save'}</button>
                          <button style={styles.cancelBtn} onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 24 },
  title: { fontSize: 17, fontWeight: 700, marginBottom: 16 },
  form: { marginBottom: 16 },
  formRow: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' },
  field: { display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 100 },
  label: { fontSize: 11, fontWeight: 600, color: '#555', textTransform: 'uppercase' },
  input: { padding: '7px 9px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 },
  addBtn: { padding: '7px 14px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' },
  error: { color: '#e53e3e', fontSize: 13, marginTop: 4 },
  weekNav: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  navBtn: { background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 10px', fontSize: 13, cursor: 'pointer', color: '#374151' },
  weekLabel: { fontWeight: 600, fontSize: 14, color: '#111827', flex: 1 },
  todayBtn: { background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#6b7280' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, overflowX: 'auto' },
  dayCol: { padding: '8px 6px', minHeight: 80, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 90 },
  dayHead: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 },
  emptyDay: { flex: 1, background: '#f9fafb', borderRadius: 4, minHeight: 40 },
  shiftPill: { background: '#eff6ff', borderLeft: '3px solid #1a56db', borderRadius: 5, padding: '5px 7px', fontSize: 11 },
  pillWorker: { fontWeight: 700, color: '#1e3a5f', marginBottom: 1 },
  pillProject: { color: '#6b7280', fontSize: 10 },
  pillTime: { fontWeight: 600, color: '#1a56db', marginTop: 2 },
  pillNotes: { color: '#9ca3af', fontSize: 10, fontStyle: 'italic' },
  pillActions: { display: 'flex', gap: 4, marginTop: 4 },
  editPillBtn: { background: 'none', border: 'none', color: '#1a56db', fontSize: 12, cursor: 'pointer', padding: 0, lineHeight: 1 },
  deleteBtn: { background: 'none', border: 'none', color: '#fca5a5', fontSize: 11, cursor: 'pointer', padding: 0, lineHeight: 1 },
  editPanel: { background: '#f8faff', border: '1px solid #dbeafe', borderRadius: 6, padding: 10, marginTop: 4 },
  editGrid: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  editField: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 80 },
  editLabel: { fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' },
  editInput: { padding: '5px 7px', border: '1px solid #ddd', borderRadius: 5, fontSize: 12 },
  editActions: { display: 'flex', gap: 6 },
  saveBtn: { background: '#059669', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { background: 'none', border: '1px solid #d1d5db', color: '#6b7280', padding: '5px 12px', borderRadius: 5, fontSize: 11, cursor: 'pointer' },
};
