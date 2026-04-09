import React, { useState, useEffect } from 'react';
import api from '../api';

function fmtDate(d) {
  const date = new Date(d + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m} ${hour < 12 ? 'AM' : 'PM'}`;
}

function isToday(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr + 'T00:00:00').getTime() === today.getTime();
}

export default function WorkerSchedule() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flagging, setFlagging] = useState(null); // shift id being toggled

  useEffect(() => {
    api.get('/shifts/mine')
      .then(r => setShifts(r.data))
      .catch(() => setError('Could not load schedule.'))
      .finally(() => setLoading(false));
  }, []);

  const toggleCantMakeIt = async (shift) => {
    setFlagging(shift.id);
    const newVal = !shift.cant_make_it;
    try {
      const r = await api.patch(`/shifts/${shift.id}/cant-make-it`, { cant_make_it: newVal });
      setShifts(prev => prev.map(s => s.id === shift.id ? { ...s, cant_make_it: r.data.cant_make_it } : s));
    } catch {
      // silently ignore — could show a toast here
    } finally {
      setFlagging(null);
    }
  };

  if (loading) return <p style={styles.empty}>Loading…</p>;
  if (error) return <p style={styles.empty}>{error}</p>;
  if (shifts.length === 0) return (
    <div style={styles.emptyBox}>
      <div style={styles.emptyIcon}>📅</div>
      <p style={styles.emptyText}>No upcoming shifts scheduled.</p>
    </div>
  );

  // Group by date
  const byDate = {};
  shifts.forEach(s => {
    const key = s.shift_date.toString().substring(0, 10);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(s);
  });

  return (
    <div style={styles.wrap}>
      <h2 style={styles.heading}>Your Schedule</h2>
      <div style={styles.list}>
        {Object.entries(byDate).map(([date, dayShifts]) => (
          <div key={date} style={styles.dayGroup}>
            <div style={styles.dateLabel}>
              <span style={{ ...styles.dateName, color: isToday(date) ? '#1a56db' : '#374151' }}>
                {fmtDate(date)}
              </span>
              {isToday(date) && <span style={styles.todayBadge}>Today</span>}
            </div>
            {dayShifts.map(s => (
              <div key={s.id} style={{
                ...styles.shiftCard,
                borderLeftColor: s.cant_make_it ? '#ef4444' : isToday(date) ? '#1a56db' : '#e5e7eb',
                opacity: s.cant_make_it ? 0.75 : 1,
              }}>
                <div style={styles.shiftTime}>
                  {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                </div>
                {s.project_name && (
                  <div style={styles.shiftProject}>{s.project_name}</div>
                )}
                {s.notes && (
                  <div style={styles.shiftNotes}>{s.notes}</div>
                )}
                <div style={styles.shiftFooter}>
                  {s.cant_make_it && (
                    <span style={styles.cantBadge}>Can't make it</span>
                  )}
                  <button
                    style={s.cant_make_it ? styles.undoBtn : styles.cantBtn}
                    onClick={() => toggleCantMakeIt(s)}
                    disabled={flagging === s.id}
                  >
                    {flagging === s.id ? '…' : s.cant_make_it ? '↩ Undo' : "Can't make it"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  wrap: { maxWidth: 520, margin: '0 auto' },
  heading: { fontSize: 20, fontWeight: 800, color: '#111827', margin: '0 0 16px' },
  list: { display: 'flex', flexDirection: 'column', gap: 16 },
  dayGroup: {},
  dateLabel: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  dateName: { fontSize: 14, fontWeight: 700 },
  todayBadge: { fontSize: 11, fontWeight: 700, background: '#dbeafe', color: '#1a56db', padding: '2px 8px', borderRadius: 10 },
  shiftCard: { background: '#fff', borderRadius: 10, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderLeft: '4px solid #e5e7eb' },
  shiftTime: { fontSize: 18, fontWeight: 800, color: '#111827', marginBottom: 4 },
  shiftProject: { fontSize: 13, fontWeight: 600, color: '#1a56db', marginBottom: 2 },
  shiftNotes: { fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: 1.4 },
  shiftFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 8 },
  cantBadge: { fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '2px 8px', borderRadius: 10 },
  cantBtn: { marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#dc2626', background: 'none', border: '1px solid #fca5a5', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' },
  undoBtn: { marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#6b7280', background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' },
  emptyBox: { textAlign: 'center', padding: '48px 20px' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  empty: { color: '#9ca3af', fontSize: 14 },
};
