import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import { useOffline } from '../contexts/OfflineContext';
import { useFormPersist } from '../hooks/useFormPersist';

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

export default function ClockInOut({ projects, onEntryAdded, t, geolocationEnabled = true, projectsEnabled = true }) {
  const { isOffline, queueCount, onSync } = useOffline() || {};
  const [status, setStatus] = useState(null); // null = loading, false = not clocked in, object = clocked in
  const [clockInForm, setClockInForm] = useState({ selectedProject: '', notes: '' });
  const { clearPersisted: clearClockInPersisted } = useFormPersist('clock-in', clockInForm, setClockInForm);
  const selectedProject = clockInForm.selectedProject;
  const notes = clockInForm.notes;
  const setSelectedProject = v => setClockInForm(f => ({ ...f, selectedProject: v }));
  const setNotes = v => setClockInForm(f => ({ ...f, notes: v }));
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [breakAdded, setBreakAdded] = useState(false);
  const [mileageAdded, setMileageAdded] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState('');
  const [mileage, setMileage] = useState('');
  const timerRef = useRef(null);

  useEffect(() => {
    api.get('/clock/status').then(r => setStatus(r.data || false)).catch(() => setStatus(false));
  }, []);

  // Refresh clock status after offline queue syncs
  useEffect(() => {
    if (!onSync) return;
    return onSync(count => {
      if (count > 0) {
        api.get('/clock/status').then(r => setStatus(r.data || false)).catch(() => {});
      }
    });
  }, [onSync]);

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

  const toLocalTime = d => {
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const handleClockIn = async () => {
    if (projectsEnabled && !selectedProject) { setError(t.selectProjectFirst); return; }
    setError('');
    setLoading(true);
    const { lat, lng } = geolocationEnabled ? await getLocation() : { lat: null, lng: null };
    const local_work_date = new Date().toLocaleDateString('en-CA');
    try {
      const r = await api.post('/clock/in', { project_id: selectedProject, notes: notes || undefined, lat, lng, local_work_date, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      if (r.data?.offline) {
        // Queued offline — show a pending state
        setStatus({ offline_queued: true, project_name: projects.find(p => p.id == selectedProject)?.name });
        setNotes('');
        clearClockInPersisted();
      } else {
        setStatus(r.data);
        setNotes('');
        clearClockInPersisted();
      }
    } catch (err) {
      const data = err.response?.data;
      setError(data?.geofence ? data.error : (data?.error || t.clockInFailed));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelClockIn = async () => {
    if (!confirm('Cancel this clock-in? No time entry will be created.')) return;
    setLoading(true);
    try {
      await api.delete('/clock/cancel');
      setStatus(false);
      setSelectedProject('');
      clearClockInPersisted();
      setBreakAdded(false);
      setMileageAdded(false);
      setBreakMinutes('');
      setMileage('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel');
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    setError('');
    setLoading(true);
    const { lat, lng } = geolocationEnabled ? await getLocation() : { lat: null, lng: null };
    const local_clock_in = status.clock_in_time ? toLocalTime(new Date(status.clock_in_time)) : toLocalTime(new Date());
    const local_clock_out = toLocalTime(new Date());
    try {
      const r = await api.post('/clock/out', {
        lat, lng,
        break_minutes: breakMinutes ? parseInt(breakMinutes) : 0,
        mileage: mileage ? parseFloat(mileage) : null,
        local_clock_in,
        local_clock_out,
      });
      if (r.data?.offline) {
        // Queued offline — stay "clocked in" locally until sync
        setStatus(prev => ({ ...prev, clock_out_queued: true }));
      } else {
        onEntryAdded({ ...r.data, project_name: status.project_name });
        setStatus(false);
        setSelectedProject('');
        setBreakAdded(false);
        setMileageAdded(false);
        setBreakMinutes('');
        setMileage('');
      }
    } catch (err) {
      setError(err.response?.data?.error || t.clockOutFailed);
    } finally {
      setLoading(false);
    }
  };

  const offlineBanner = (isOffline || queueCount > 0) && (
    <div style={styles.offlineBanner}>
      {isOffline ? 'You are offline — punches will sync when reconnected.' : null}
      {queueCount > 0 && !isOffline ? `${queueCount} punch${queueCount !== 1 ? 'es' : ''} pending sync...` : null}
      {queueCount > 0 && isOffline ? ` ${queueCount} punch${queueCount !== 1 ? 'es' : ''} queued.` : null}
    </div>
  );

  if (status === null) return (
    <div style={styles.card}>
      {offlineBanner}
      <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>Loading clock status...</p>
    </div>
  );

  if (status) {
    const clockOutQueued = status.clock_out_queued;
    return (
      <div style={styles.clockedInCard}>
        {isOffline && <div style={styles.offlineBannerDark}>Offline — clock-out will sync when reconnected.</div>}
        <div style={styles.clockedInTop}>
          <div>
            <div style={styles.clockedInLabel}>{t.currentlyClockedIn}</div>
            <div style={styles.projectName}>{status.project_name}</div>
            {status.offline_queued && <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>Clock-in queued offline</div>}
            {clockOutQueued && <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>Clock-out queued — will sync</div>}
          </div>
          {!status.offline_queued && !clockOutQueued && <div style={styles.timer}>{formatElapsed(elapsed)}</div>}
        </div>

        {!clockOutQueued && (
          <>
            {/* Added rows */}
            {breakAdded && (
              <div style={styles.addedRow}>
                <span style={styles.addedIcon}>☕</span>
                <span style={styles.addedLabel}>Break</span>
                <input
                  style={styles.addedInput}
                  type="number" min="0" max="480" step="1"
                  placeholder="0"
                  value={breakMinutes}
                  onChange={e => setBreakMinutes(e.target.value)}
                  autoFocus
                />
                <span style={styles.addedUnit}>min</span>
                <button style={styles.removeBtn} onClick={() => { setBreakAdded(false); setBreakMinutes(''); }}>✕</button>
              </div>
            )}
            {mileageAdded && (
              <div style={styles.addedRow}>
                <span style={styles.addedIcon}>🚗</span>
                <span style={styles.addedLabel}>Mileage</span>
                <input
                  style={styles.addedInput}
                  type="number" min="0" step="0.1"
                  placeholder="0.0"
                  value={mileage}
                  onChange={e => setMileage(e.target.value)}
                />
                <span style={styles.addedUnit}>mi</span>
                <button style={styles.removeBtn} onClick={() => { setMileageAdded(false); setMileage(''); }}>✕</button>
              </div>
            )}

            {/* Add buttons */}
            {(!breakAdded || !mileageAdded) && (
              <div style={styles.addBtns}>
                {!breakAdded && <button style={styles.addBtn} onClick={() => setBreakAdded(true)}>+ Break</button>}
                {!mileageAdded && <button style={styles.addBtn} onClick={() => setMileageAdded(true)}>+ Mileage</button>}
              </div>
            )}

            {error && <p style={styles.errorDark}>{error}</p>}
            <button style={styles.clockOutBtn} className="clock-btn" onClick={handleClockOut} disabled={loading}>
              {loading ? t.clockingOut : t.clockOut}
            </button>
            <button style={styles.cancelClockInBtn} onClick={handleCancelClockIn} disabled={loading}>
              Cancel clock-in
            </button>
          </>
        )}
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <div style={styles.card}>
        {offlineBanner}
        <h2 style={styles.heading}>{t.clockIn}</h2>
        <div style={styles.noProjects}>
          <div style={styles.noProjectsIcon}>📋</div>
          <div style={styles.noProjectsTitle}>No projects available</div>
          <div style={styles.noProjectsText}>Your admin needs to add a project before you can clock in. Contact your manager to get set up.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      {offlineBanner}
      <h2 style={styles.heading}>{t.clockIn}</h2>
      <div style={styles.form}>
        {projectsEnabled && <div>
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
        </div>}
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
          {loading ? t.clockingIn : t.clockIn}
        </button>
      </div>
    </div>
  );
}

const styles = {
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' },
  clockedInCard: { background: '#1a56db', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.15)', color: '#fff', display: 'flex', flexDirection: 'column', gap: 10 },
  clockedInTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  clockedInLabel: { fontSize: 13, opacity: 0.8, marginBottom: 4 },
  projectName: { fontSize: 18, fontWeight: 700 },
  timer: { fontSize: 36, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: 1 },
  addedRow: { display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 12px' },
  addedIcon: { fontSize: 16 },
  addedLabel: { fontSize: 13, fontWeight: 600, flex: 1 },
  addedInput: { width: 70, padding: '5px 8px', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 6, fontSize: 14, background: 'rgba(255,255,255,0.15)', color: '#fff', textAlign: 'right' },
  addedUnit: { fontSize: 12, opacity: 0.8, minWidth: 20 },
  removeBtn: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 14, cursor: 'pointer', padding: '0 2px', lineHeight: 1 },
  addBtns: { display: 'flex', gap: 8 },
  addBtn: { padding: '7px 14px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  heading: { marginBottom: 16, fontSize: 18, fontWeight: 700 },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  label: { fontSize: 13, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 },
  input: { padding: '9px 11px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, width: '100%' },
  error: { color: '#ef4444', fontSize: 13, margin: 0, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px' },
  errorDark: { fontSize: 13, margin: 0, background: 'rgba(255,255,255,0.15)', borderRadius: 6, padding: '8px 12px', color: '#fff' },
  clockInBtn: { padding: '13px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700 },
  clockOutBtn: { width: '100%', padding: '13px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: '2px solid rgba(255,255,255,0.5)', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  cancelClockInBtn: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: '2px 0', alignSelf: 'center' },
  noProjects: { textAlign: 'center', padding: '24px 16px' },
  noProjectsIcon: { fontSize: 36, marginBottom: 10 },
  noProjectsTitle: { fontWeight: 700, fontSize: 16, color: '#374151', marginBottom: 6 },
  noProjectsText: { fontSize: 13, color: '#9ca3af', lineHeight: 1.5 },
  offlineBanner: { background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 7, padding: '8px 12px', fontSize: 13, fontWeight: 500, marginBottom: 12 },
  offlineBannerDark: { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontWeight: 500 },
};
