import React, { useState, useEffect } from 'react';
import api from '../api';
import { useT } from '../hooks/useT';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function AvailabilityTab() {
  const t = useT();
  const isEs = document.documentElement.lang === 'es';
  const dayNames = isEs ? DAYS_ES : DAYS;

  // State: array indexed by day_of_week (0=Sun)
  // { enabled: bool, start_time: '08:00', end_time: '17:00' }
  const [days, setDays] = useState(
    Array.from({ length: 7 }, () => ({ enabled: false, start_time: '08:00', end_time: '17:00' }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/availability/mine')
      .then(r => {
        const next = Array.from({ length: 7 }, () => ({ enabled: false, start_time: '08:00', end_time: '17:00' }));
        r.data.forEach(a => {
          next[a.day_of_week] = {
            enabled: true,
            start_time: a.start_time.substring(0, 5),
            end_time: a.end_time.substring(0, 5),
          };
        });
        setDays(next);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleDay = (i) => {
    setDays(prev => prev.map((d, j) => j === i ? { ...d, enabled: !d.enabled } : d));
    setSaved(false);
  };

  const setTime = (i, key, val) => {
    setDays(prev => prev.map((d, j) => j === i ? { ...d, [key]: val } : d));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true); setSaved(false);
    const availability = days
      .map((d, i) => d.enabled ? { day_of_week: i, start_time: d.start_time, end_time: d.end_time } : null)
      .filter(Boolean);
    try {
      await api.put('/availability', { availability });
      setSaved(true);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  if (loading) return <p style={s.empty}>{t.loading}</p>;

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <div>
          <h2 style={s.title}>{t.availTitle}</h2>
          <p style={s.subtitle}>{t.availSubtitle}</p>
        </div>
        <button style={s.saveBtn} onClick={save} disabled={saving}>
          {saving ? t.saving : saved ? `✓ ${t.availSaved}` : t.availSave}
        </button>
      </div>
      <div style={s.grid}>
        {days.map((d, i) => (
          <div key={i} style={{ ...s.dayRow, ...(d.enabled ? s.dayRowActive : {}) }}>
            <label style={s.checkLabel}>
              <input
                type="checkbox"
                checked={d.enabled}
                onChange={() => toggleDay(i)}
                style={{ marginRight: 8 }}
              />
              <span style={s.dayName}>{dayNames[i]}</span>
            </label>
            {d.enabled && (
              <div style={s.timeRow}>
                <input
                  type="time"
                  style={s.timeInput}
                  value={d.start_time}
                  onChange={e => setTime(i, 'start_time', e.target.value)}
                />
                <span style={s.timeSep}>–</span>
                <input
                  type="time"
                  style={s.timeInput}
                  value={d.end_time}
                  onChange={e => setTime(i, 'end_time', e.target.value)}
                />
              </div>
            )}
            {!d.enabled && <span style={s.unavailable}>Unavailable</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

const s = {
  wrap: { padding: '16px 16px 32px' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 0 },
  saveBtn: { background: '#1a56db', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  grid: { display: 'flex', flexDirection: 'column', gap: 8 },
  dayRow: { display: 'flex', alignItems: 'center', gap: 16, background: '#fff', borderRadius: 10, padding: '12px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexWrap: 'wrap' },
  dayRowActive: { borderLeft: '3px solid #1a56db' },
  checkLabel: { display: 'flex', alignItems: 'center', cursor: 'pointer', minWidth: 130 },
  dayName: { fontSize: 14, fontWeight: 600, color: '#111827' },
  timeRow: { display: 'flex', alignItems: 'center', gap: 8 },
  timeInput: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, color: '#374151', background: '#f9fafb' },
  timeSep: { fontSize: 13, color: '#9ca3af' },
  unavailable: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
  empty: { color: '#9ca3af', textAlign: 'center', padding: 32 },
};
