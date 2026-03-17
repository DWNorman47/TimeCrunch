import React, { useState, useEffect, useRef } from 'react';
import api from '../api';

function getLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve({ lat: null, lng: null });
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve({ lat: null, lng: null }),
      { timeout: 8000 }
    );
  });
}

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export default function ClockInOut({ projects, onEntryAdded, t }) {
  const [status, setStatus] = useState(null); // null = loading, false = not clocked in, object = clocked in
  const [selectedProject, setSelectedProject] = useState('');
  const [notes, setNotes] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clockingOut, setClockingOut] = useState(false); // show break/mileage step
  const [breakMinutes, setBreakMinutes] = useState('');
  const [mileage, setMileage] = useState('');
  const timerRef = useRef(null);

  useEffect(() => {
    api.get('/clock/status').then(r => setStatus(r.data)).catch(() => setStatus(false));
  }, []);

  useEffect(() => {
    if (status && status.clock_in_time) {
      const updateElapsed = () => {
        const diff = Math.floor((Date.now() - new Date(status.clock_in_time)) / 1000);
        setElapsed(diff);
      };
      updateElapsed();
      timerRef.current = setInterval(updateElapsed, 1000);
    } else {
      clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => clearInterval(timerRef.current);
  }, [status]);

  const handleClockIn = async () => {
    if (!selectedProject) { setError('Select a project first'); return; }
    setError('');
    setLoading(true);
    const { lat, lng } = await getLocation();
    try {
      const r = await api.post('/clock/in', { project_id: selectedProject, notes: notes || undefined, lat, lng });
      setStatus(r.data);
      setNotes('');
    } catch (err) {
      setError(err.response?.data?.error || 'Clock-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    setError('');
    setLoading(true);
    const { lat, lng } = await getLocation();
    try {
      const r = await api.post('/clock/out', {
        lat, lng,
        break_minutes: breakMinutes ? parseInt(breakMinutes) : 0,
        mileage: mileage ? parseFloat(mileage) : null,
      });
      onEntryAdded({ ...r.data, project_name: status.project_name });
      setStatus(false);
      setSelectedProject('');
      setClockingOut(false);
      setBreakMinutes('');
      setMileage('');
    } catch (err) {
      setError(err.response?.data?.error || 'Clock-out failed');
    } finally {
      setLoading(false);
    }
  };

  if (status === null) return null;

  if (status) {
    return (
      <div style={styles.clockedInCard}>
        <div style={styles.clockedInTop}>
          <div>
            <div style={styles.clockedInLabel}>Currently clocked in</div>
            <div style={styles.projectName}>{status.project_name}</div>
          </div>
          <div style={styles.timer}>{formatElapsed(elapsed)}</div>
        </div>
        {clockingOut ? (
          <div style={styles.clockOutStep}>
            <div style={styles.clockOutFields}>
              <div style={styles.clockOutField}>
                <label style={styles.clockOutLabel}>Break (min)</label>
                <input
                  style={styles.clockOutInput}
                  type="number" min="0" max="480" step="1"
                  placeholder="0"
                  value={breakMinutes}
                  onChange={e => setBreakMinutes(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={styles.clockOutField}>
                <label style={styles.clockOutLabel}>Mileage (mi)</label>
                <input
                  style={styles.clockOutInput}
                  type="number" min="0" step="0.1"
                  placeholder="Optional"
                  value={mileage}
                  onChange={e => setMileage(e.target.value)}
                />
              </div>
            </div>
            {error && <p style={styles.error}>{error}</p>}
            <div style={styles.clockOutActions}>
              <button style={styles.clockOutBtn} className="clock-btn" onClick={handleClockOut} disabled={loading}>
                {loading ? 'Clocking out...' : 'Confirm Clock Out'}
              </button>
              <button style={styles.cancelClockOutBtn} onClick={() => { setClockingOut(false); setError(''); }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {error && <p style={styles.error}>{error}</p>}
            <button style={styles.clockOutBtn} className="clock-btn" onClick={() => setClockingOut(true)} disabled={loading}>
              Clock Out
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h2 style={styles.heading}>Clock In</h2>
      <div style={styles.form}>
        <div>
          <label style={styles.label}>{t.project}</label>
          <select
            style={styles.input}
            value={selectedProject}
            onChange={e => setSelectedProject(e.target.value)}
          >
            <option value="">{t.selectProject}</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.wage_type === 'prevailing' ? t.prevailing : t.regular})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={styles.label}>{t.notesOptional}</label>
          <input
            style={styles.input}
            type="text"
            placeholder={t.notesPlaceholder}
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
        {error && <p style={styles.error}>{error}</p>}
        <button style={styles.clockInBtn} className="clock-btn" onClick={handleClockIn} disabled={loading}>
          {loading ? 'Clocking in...' : 'Clock In'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' },
  clockedInCard: { background: '#1a56db', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.15)', color: '#fff' },
  clockedInTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  clockedInLabel: { fontSize: 13, opacity: 0.8, marginBottom: 4 },
  projectName: { fontSize: 18, fontWeight: 700 },
  timer: { fontSize: 36, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: 1 },
  heading: { marginBottom: 16, fontSize: 18, fontWeight: 700 },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  label: { fontSize: 13, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 },
  input: { padding: '9px 11px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, width: '100%' },
  error: { color: '#fca5a5', fontSize: 13, margin: 0 },
  clockInBtn: { padding: '13px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700 },
  clockOutBtn: { width: '100%', padding: '13px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: '2px solid rgba(255,255,255,0.5)', borderRadius: 8, fontSize: 16, fontWeight: 700 },
  clockOutStep: { display: 'flex', flexDirection: 'column', gap: 12 },
  clockOutFields: { display: 'flex', gap: 12 },
  clockOutField: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1 },
  clockOutLabel: { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)' },
  clockOutInput: { padding: '8px 10px', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 7, fontSize: 14, background: 'rgba(255,255,255,0.15)', color: '#fff', width: '100%' },
  clockOutActions: { display: 'flex', flexDirection: 'column', gap: 8 },
  cancelClockOutBtn: { width: '100%', padding: '10px', background: 'transparent', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, fontSize: 14, cursor: 'pointer' },
};
