import React, { useState, useEffect } from 'react';
import api from '../api';
import { useToast } from '../contexts/ToastContext';
import { useT } from '../hooks/useT';
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor,
  useSensor, useSensors, useDroppable, useDraggable,
} from '@dnd-kit/core';

function startOfWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function toISO(d) { return d.toLocaleDateString('en-CA'); }
function fmtDay(d) { return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
function fmtTime(t) { const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr % 12 || 12}:${m}${hr < 12 ? 'a' : 'p'}`; }

// Visual content of a shift pill — used both inline and in the drag overlay
function PillContent({ s }) {
  return (
    <>
      <div style={styles.pillWorker}>{s.worker_name}</div>
      {s.project_name && <div style={styles.pillProject}>{s.project_name}</div>}
      <div style={styles.pillTime}>{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</div>
      {s.notes && <div style={styles.pillNotes}>{s.notes}</div>}
    </>
  );
}

function DraggableShift({ s, editingId, startEdit, setEditingId, dragMode }) {
  const t = useT();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: String(s.id) });
  const isEditing = editingId === s.id;

  return (
    <div ref={setNodeRef}>
      <div style={{ ...styles.shiftPill, ...(isEditing ? styles.shiftPillActive : {}), opacity: isDragging ? 0.35 : 1, cursor: dragMode ? 'grab' : 'default' }} {...(dragMode ? { ...listeners, ...attributes } : {})}>
        <PillContent s={s} />
        <div style={styles.pillActions} onPointerDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
          <button style={isEditing ? styles.editPillBtnActive : styles.editPillBtn} onClick={() => isEditing ? setEditingId(null) : startEdit(s)}>
            {isEditing ? t.cancel : t.edit}
          </button>
        </div>
      </div>
    </div>
  );
}

function DroppableDay({ date, isToday, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  return (
    <div
      ref={setNodeRef}
      style={{
        ...styles.dayCol,
        borderTop: `3px solid ${isToday ? '#1a56db' : '#e5e7eb'}`,
        background: isOver ? '#eff6ff' : undefined,
        transition: 'background 0.15s',
      }}
    >
      {children}
    </div>
  );
}

export default function ManageSchedule({ workers, projects }) {
  const toast = useToast();
  const t = useT();
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
  const [activeShift, setActiveShift] = useState(null);
  const [dragMode, setDragMode] = useState(false);
  const [preDragShifts, setPreDragShifts] = useState(null);
  const [pendingMoves, setPendingMoves] = useState({});
  const [savingMoves, setSavingMoves] = useState(false);

  const activeSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
  const disabledSensors = useSensors();
  const sensors = dragMode ? activeSensors : disabledSensors;

  const enterDragMode = () => {
    setPreDragShifts(shifts);
    setPendingMoves({});
    setDragMode(true);
    setEditingId(null);
  };

  const discardDrag = () => {
    setShifts(preDragShifts);
    setPendingMoves({});
    setPreDragShifts(null);
    setDragMode(false);
  };

  const saveDragMoves = async () => {
    setSavingMoves(true);
    try {
      await Promise.all(Object.entries(pendingMoves).map(([shiftId, newDate]) => {
        const shift = shifts.find(s => s.id === parseInt(shiftId));
        if (!shift) return Promise.resolve();
        return api.patch(`/shifts/admin/${shiftId}`, {
          shift_date: newDate,
          start_time: shift.start_time.substring(0, 5),
          end_time: shift.end_time.substring(0, 5),
          project_id: shift.project_id || '',
          notes: shift.notes || '',
        });
      }));
      toast(`${Object.keys(pendingMoves).length} shift${Object.keys(pendingMoves).length !== 1 ? 's' : ''} saved`, 'success');
    } catch {
      toast(t.someShiftsFailed, 'error');
    } finally {
      setSavingMoves(false);
      setPendingMoves({});
      setPreDragShifts(null);
      setDragMode(false);
    }
  };

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

  useEffect(() => {
    const today = toISO(new Date());
    const dateInView = today >= from && today <= to ? today : from;
    setForm(f => ({ ...f, shift_date: dateInView }));
  }, [from, to]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addShift = async e => {
    e.preventDefault();
    if (!form.user_id) { setError(t.selectAWorker); return; }
    setSaving(true); setError('');
    try {
      const r = await api.post('/shifts/admin', form);
      setShifts(prev => [...prev, r.data].sort((a, b) => a.shift_date.localeCompare(b.shift_date) || a.start_time.localeCompare(b.start_time)));
      setForm(f => ({ ...f, notes: '' }));
      toast(t.shiftAdded, 'success');
    } catch (err) {
      setError(err.response?.data?.error || t.failedSaveShift);
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

  const duplicateShift = async s => {
    try {
      const r = await api.post('/shifts/admin', {
        user_id: s.user_id,
        project_id: s.project_id || '',
        shift_date: s.shift_date.substring(0, 10),
        start_time: s.start_time.substring(0, 5),
        end_time: s.end_time.substring(0, 5),
        notes: s.notes || '',
      });
      setShifts(prev => [...prev, r.data].sort((a, b) => a.shift_date.localeCompare(b.shift_date) || a.start_time.localeCompare(b.start_time)));
      toast(t.shiftDuplicated, 'success');
    } catch {
      toast(t.failedDuplicateShift, 'error');
    }
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
      toast(err.response?.data?.error || 'Failed to update shift', 'error');
    } finally { setEditSaving(false); }
  };

  const handleDragStart = ({ active }) => {
    setActiveShift(shifts.find(s => String(s.id) === active.id) || null);
    setEditingId(null);
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveShift(null);
    if (!over || !dragMode) return;
    const shiftId = parseInt(active.id);
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return;
    const currentDate = shift.shift_date.substring(0, 10);
    const newDate = over.id;
    if (currentDate === newDate) return;

    // Local-only update — no API call until Save
    setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, shift_date: newDate } : s));
    setPendingMoves(prev => ({ ...prev, [shiftId]: newDate }));
  };

  const shiftsByDay = {};
  days.forEach(d => { shiftsByDay[toISO(d)] = []; });
  shifts.forEach(s => {
    const key = s.shift_date.substring(0, 10);
    if (shiftsByDay[key]) shiftsByDay[key].push(s);
  });

  const shiftProps = { editingId, startEdit, setEditingId, dragMode };
  const editingShift = editingId ? shifts.find(s => s.id === editingId) : null;

  return (
    <div style={styles.card}>
      <h3 style={styles.title}>{t.schedule}</h3>

      <form onSubmit={addShift} style={styles.form}>
        <div style={styles.formRow}>
          <div style={styles.field}>
            <label style={styles.label}>{t.worker}</label>
            <select style={styles.input} value={form.user_id} onChange={e => set('user_id', e.target.value)} required>
              <option value="">{t.selectWorker}</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.full_name}</option>)}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>{t.project}</label>
            <select style={styles.input} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
              <option value="">{t.noProject}</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>{t.date}</label>
            <input style={styles.input} type="date" value={form.shift_date} onChange={e => set('shift_date', e.target.value)} required />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>{t.start}</label>
            <input style={styles.input} type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} required />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>{t.end}</label>
            <input style={styles.input} type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} required />
          </div>
          <div style={{ ...styles.field, flex: 2 }}>
            <label style={styles.label}>{t.notes}</label>
            <input style={styles.input} type="text" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder={t.optional} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>&nbsp;</label>
            <button style={styles.addBtn} type="submit" disabled={saving}>{saving ? '...' : t.addShift}</button>
          </div>
        </div>
        {error && <p style={styles.error}>{error}</p>}
      </form>

      <div style={styles.weekNav}>
        <button style={styles.navBtn} onClick={() => setWeekStart(d => addDays(d, -7))}>{t.prevWeek}</button>
        <span style={styles.weekLabel}>{fmtDay(days[0])} – {fmtDay(days[6])}</span>
        <button style={styles.navBtn} onClick={() => setWeekStart(d => addDays(d, 7))}>{t.nextWeek}</button>
        <button style={styles.todayBtn} onClick={() => setWeekStart(startOfWeek(new Date()))}>{t.today}</button>
        {!dragMode
          ? <button style={styles.dragModeBtn} onClick={enterDragMode}>{t.rearrange}</button>
          : (
            <div style={styles.dragModeBanner}>
              <span style={styles.dragModeLabel}>
                {t.dragMode}{Object.keys(pendingMoves).length > 0 ? ` · ${Object.keys(pendingMoves).length} unsaved` : ''}
              </span>
              <button style={styles.saveDragBtn} onClick={saveDragMoves} disabled={savingMoves || Object.keys(pendingMoves).length === 0}>
                {savingMoves ? t.saving : t.saveAndNotify}
              </button>
              <button style={styles.discardDragBtn} onClick={discardDrag} disabled={savingMoves}>{t.discard}</button>
            </div>
          )
        }
      </div>

      {loading ? <p style={{ color: '#888', fontSize: 13 }}>{t.loading}</p> : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div style={styles.grid}>
            {days.map(day => {
              const key = toISO(day);
              const dayShifts = shiftsByDay[key] || [];
              const isToday = key === toISO(new Date());
              return (
                <DroppableDay key={key} date={key} isToday={isToday}>
                  <div style={{ ...styles.dayHead, color: isToday ? '#1a56db' : '#374151' }}>
                    {day.toLocaleDateString('en-US', { weekday: 'short' })} {day.getDate()}
                  </div>
                  {dayShifts.length === 0
                    ? <div style={styles.emptyDay} />
                    : dayShifts.map(s => <DraggableShift key={s.id} s={s} {...shiftProps} />)
                  }
                </DroppableDay>
              );
            })}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeShift && (
              <div style={{ ...styles.shiftPill, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', cursor: 'grabbing', opacity: 0.95 }}>
                <PillContent s={activeShift} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {editingShift && (
        <div style={styles.editPanel}>
          <div style={styles.editPanelHeader}>
            <span style={styles.editPanelTitle}>Editing: {editingShift.worker_name} · {fmtDay(new Date(editingShift.shift_date + 'T00:00:00'))}</span>
          </div>
          <div style={styles.editGrid}>
            <div style={styles.editField}>
              <label style={styles.editLabel}>{t.date}</label>
              <input style={styles.editInput} type="date" value={editForm.shift_date} onChange={ev => setEditForm(f => ({ ...f, shift_date: ev.target.value }))} />
            </div>
            <div style={styles.editField}>
              <label style={styles.editLabel}>{t.start}</label>
              <input style={styles.editInput} type="time" value={editForm.start_time} onChange={ev => setEditForm(f => ({ ...f, start_time: ev.target.value }))} />
            </div>
            <div style={styles.editField}>
              <label style={styles.editLabel}>{t.end}</label>
              <input style={styles.editInput} type="time" value={editForm.end_time} onChange={ev => setEditForm(f => ({ ...f, end_time: ev.target.value }))} />
            </div>
            <div style={styles.editField}>
              <label style={styles.editLabel}>{t.project}</label>
              <select style={styles.editInput} value={editForm.project_id} onChange={ev => setEditForm(f => ({ ...f, project_id: ev.target.value }))}>
                <option value="">{t.none}</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ ...styles.editField, flex: 2 }}>
              <label style={styles.editLabel}>{t.notes}</label>
              <input style={styles.editInput} type="text" value={editForm.notes} onChange={ev => setEditForm(f => ({ ...f, notes: ev.target.value }))} placeholder={t.optional} />
            </div>
          </div>
          <div style={styles.editActions}>
            <div style={styles.editActionsLeft}>
              <button style={styles.saveBtn} onClick={() => saveEdit(editingShift.id)} disabled={editSaving}>{editSaving ? '…' : t.save}</button>
              <button style={styles.cancelBtn} onClick={() => setEditingId(null)}>{t.cancel}</button>
            </div>
            <div style={styles.editActionsRight}>
              <button style={styles.dupBtn} onClick={() => duplicateShift(editingShift)}>{t.copy}</button>
              <button style={styles.deleteBtn} onClick={() => deleteShift(editingShift.id)} disabled={deleting === editingShift.id}>
                {deleting === editingShift.id ? '…' : t.del}
              </button>
            </div>
          </div>
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
  dragModeBtn: { background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#374151' },
  dragModeBanner: { display: 'flex', alignItems: 'center', gap: 8, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '5px 12px' },
  dragModeLabel: { fontSize: 12, fontWeight: 600, color: '#92400e', flex: 1 },
  saveDragBtn: { background: '#059669', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  discardDragBtn: { background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: '#6b7280' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, overflowX: 'auto' },
  dayCol: { padding: '8px 6px', minHeight: 80, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 90 },
  dayHead: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 },
  emptyDay: { flex: 1, background: '#f9fafb', borderRadius: 4, minHeight: 40 },
  shiftPill: { background: '#eff6ff', borderLeft: '3px solid #1a56db', borderRadius: 5, padding: '5px 7px', fontSize: 11 },
  pillWorker: { fontWeight: 700, color: '#1e3a5f', marginBottom: 1 },
  pillProject: { color: '#6b7280', fontSize: 10 },
  pillTime: { fontWeight: 600, color: '#1a56db', marginTop: 2 },
  pillNotes: { color: '#9ca3af', fontSize: 10, fontStyle: 'italic' },
  shiftPillActive: { background: '#dbeafe', borderLeftColor: '#1d4ed8' },
  pillActions: { display: 'flex', gap: 4, marginTop: 6 },
  editPillBtn: { flex: 1, background: '#dbeafe', border: 'none', color: '#1d4ed8', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 9px', borderRadius: 5, lineHeight: 1 },
  editPillBtnActive: { flex: 1, background: '#bfdbfe', border: 'none', color: '#1e40af', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 9px', borderRadius: 5, lineHeight: 1 },
  editPanel: { background: '#f8faff', border: '1px solid #dbeafe', borderRadius: 8, padding: 16, marginTop: 16 },
  editPanelHeader: { marginBottom: 12 },
  editPanelTitle: { fontSize: 13, fontWeight: 700, color: '#1e3a5f' },
  editGrid: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  editField: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 100 },
  editLabel: { fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' },
  editInput: { padding: '7px 9px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 },
  editActions: { display: 'flex', justifyContent: 'space-between', gap: 8 },
  editActionsLeft: { display: 'flex', gap: 8 },
  editActionsRight: { display: 'flex', gap: 8 },
  saveBtn: { background: '#059669', color: '#fff', border: 'none', padding: '7px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  cancelBtn: { background: 'none', border: '1px solid #d1d5db', color: '#6b7280', padding: '7px 18px', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  dupBtn: { background: '#d1fae5', border: 'none', color: '#065f46', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '7px 16px', borderRadius: 6 },
  deleteBtn: { background: '#fee2e2', border: 'none', color: '#b91c1c', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '7px 16px', borderRadius: 6 },
};
