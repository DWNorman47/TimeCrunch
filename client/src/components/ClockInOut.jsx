import React, { useState, useEffect, useRef } from 'react';
import api from '../api';
import { useOffline } from '../contexts/OfflineContext';
import { useFormPersist } from '../hooks/useFormPersist';

function getLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve({ lat: null, lng: null });
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => resolve({ lat: null, lng: null, permissionDenied: err.code === 1 }),
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
  const [locationDenied, setLocationDenied] = useState(false);
  const [switchingProject, setSwitchingProject] = useState(false);
  const [switchProject, setSwitchProject] = useState('');
  const [pendingChecklist, setPendingChecklist] = useState(null); // { template_id, items, name }
  const [checklistAnswers, setChecklistAnswers] = useState({});
  const [checklistSubmitting, setChecklistSubmitting] = useState(false);
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

  // Push live location while clocked in (every 60s)
  useEffect(() => {
    if (!status || !status.clock_in_time || !geolocationEnabled || !navigator.geolocation) return;
    const pushLocation = () => {
      navigator.geolocation.getCurrentPosition(
        pos => api.post('/clock/location', { lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {}),
        () => {}
      );
    };
    pushLocation(); // send immediately on clock-in
    const id = setInterval(pushLocation, 60000);
    return () => clearInterval(id);
  }, [!!status?.clock_in_time, geolocationEnabled]);

  const toLocalTime = d => {
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const selectedProjectData = projects?.find(p => String(p.id) === String(selectedProject));
  const projectHasGeofence = !!(selectedProjectData?.geo_lat && selectedProjectData?.geo_lng && selectedProjectData?.geo_radius_ft);

  const handleClockIn = async () => {
    if (projectsEnabled && !selectedProject) { setError(t.selectProjectFirst); return; }
    setError('');
    setLocationDenied(false);
    setLoading(true);
    // Capture clock-in time immediately before GPS wait — GPS can take several seconds
    const clock_in_time = new Date().toISOString();
    // Always fetch GPS when the selected project has a geofence, even if geolocation feature is off globally
    const loc = (geolocationEnabled || projectHasGeofence) ? await getLocation() : { lat: null, lng: null };
    if (loc.permissionDenied) setLocationDenied(true);
    const { lat, lng } = loc;
    const local_work_date = new Date().toLocaleDateString('en-CA');
    try {
      const r = await api.post('/clock/in', { project_id: selectedProject, notes: notes || undefined, lat, lng, local_work_date, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, location_denied: loc.permissionDenied || false, clock_in_time });
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
      if (data?.checklist_required) {
        // Fetch template so we can show inline checklist
        api.get(`/safety-checklists/templates`).then(r => {
          const tmpl = r.data.find(t => t.id === data.template_id);
          if (tmpl) setPendingChecklist(tmpl);
          else setError(t.checklistRequiredFieldApp);
        }).catch(() => setError(t.checklistRequiredField));
      } else {
        setError(data?.geofence ? data.error : (data?.error || t.clockInFailed));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChecklistSubmit = async () => {
    setChecklistSubmitting(true);
    try {
      await api.post('/safety-checklists/submissions', {
        template_id: pendingChecklist.id,
        template_name: pendingChecklist.name,
        project_id: selectedProject || null,
        answers: checklistAnswers,
        check_date: new Date().toLocaleDateString('en-CA'),
      });
      setPendingChecklist(null);
      setChecklistAnswers({});
      // Retry clock-in now that checklist is complete
      handleClockIn();
    } catch (err) {
      setError(err.response?.data?.error || t.failedSubmitChecklist);
    } finally {
      setChecklistSubmitting(false);
    }
  };

  const handleCancelClockIn = async () => {
    if (!confirm(t.cancelClockInConfirm)) return;
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
      setError(err.response?.data?.error || t.failedCancel);
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

  const handleSwitchProject = async () => {
    if (!switchProject) { setError(t.selectNewProject); return; }
    setError('');
    setLoading(true);
    const { lat, lng } = geolocationEnabled ? await getLocation() : { lat: null, lng: null };
    const local_clock_in = status.clock_in_time ? toLocalTime(new Date(status.clock_in_time)) : toLocalTime(new Date());
    const local_clock_out = toLocalTime(new Date());
    try {
      await api.post('/clock/out', {
        lat, lng,
        break_minutes: breakMinutes ? parseInt(breakMinutes) : 0,
        mileage: mileage ? parseFloat(mileage) : null,
        local_clock_in,
        local_clock_out,
      });
      const local_work_date = new Date().toLocaleDateString('en-CA');
      const switch_clock_in_time = new Date().toISOString();
      const r = await api.post('/clock/in', { project_id: switchProject, lat, lng, local_work_date, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, clock_in_time: switch_clock_in_time });
      setStatus(r.data);
      setSwitchingProject(false);
      setSwitchProject('');
      setBreakAdded(false);
      setMileageAdded(false);
      setBreakMinutes('');
      setMileage('');
    } catch (err) {
      setError(err.response?.data?.error || t.failedSwitchProject);
    } finally {
      setLoading(false);
    }
  };

  const offlineBanner = (isOffline || queueCount > 0) && (
    <div style={styles.offlineBanner}>
      {isOffline ? t.offlineWarning : null}
      {queueCount > 0 && !isOffline ? `${queueCount} punch${queueCount !== 1 ? 'es' : ''} pending sync...` : null}
      {queueCount > 0 && isOffline ? ` ${queueCount} punch${queueCount !== 1 ? 'es' : ''} queued.` : null}
    </div>
  );

  if (status === null) return (
    <div style={styles.card}>
      {offlineBanner}
      <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>{t.clockingStatus}</p>
    </div>
  );

  if (status) {
    const clockOutQueued = status.clock_out_queued;
    return (
      <div style={styles.clockedInCard}>
        {isOffline && <div style={styles.offlineBannerDark}>{t.offlineClockOutWarn}</div>}
        <div style={styles.clockedInTop}>
          <div>
            <div style={styles.clockedInLabel}>{t.currentlyClockedIn}</div>
            <div style={styles.projectName}>{status.project_name}</div>
            {status.offline_queued && <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{t.clockInQueuedOffline}</div>}
            {clockOutQueued && <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{t.clockOutQueuedSync}</div>}
          </div>
          {!status.offline_queued && !clockOutQueued && <div style={styles.timer}>{formatElapsed(elapsed)}</div>}
        </div>

        {!clockOutQueued && (
          <>
            {/* Added rows */}
            {breakAdded && (
              <div style={styles.addedRow}>
                <span style={styles.addedIcon}>☕</span>
                <span style={styles.addedLabel}>{t.breakLabel}</span>
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
                <span style={styles.addedLabel}>{t.mileageLabel}</span>
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
                {!breakAdded && <button style={styles.addBtn} onClick={() => setBreakAdded(true)}>{t.addBreak}</button>}
                {!mileageAdded && <button style={styles.addBtn} onClick={() => setMileageAdded(true)}>{t.addMileage}</button>}
              </div>
            )}

            {error && <p style={styles.errorDark}>{error}</p>}

            {switchingProject ? (
              <div style={styles.switchBox}>
                <select
                  style={styles.switchSelect}
                  value={switchProject}
                  onChange={e => setSwitchProject(e.target.value)}
                  autoFocus
                >
                  <option value="">{t.selectNewProject}</option>
                  {projects?.filter(p => String(p.id) !== String(status.project_id)).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <div style={styles.switchActions}>
                  <button style={styles.switchConfirmBtn} onClick={handleSwitchProject} disabled={loading || !switchProject}>
                    {loading ? '...' : t.confirmSwitch}
                  </button>
                  <button style={styles.switchCancelBtn} onClick={() => { setSwitchingProject(false); setSwitchProject(''); setError(''); }}>
                    {t.cancel}
                  </button>
                </div>
              </div>
            ) : (
              projectsEnabled && projects?.length > 1 && (
                <button style={styles.switchProjectBtn} onClick={() => setSwitchingProject(true)} disabled={loading}>
                  {t.switchProject}
                </button>
              )
            )}

            <button style={styles.clockOutBtn} className="clock-btn" onClick={handleClockOut} disabled={loading}>
              {loading ? t.clockingOut : t.clockOut}
            </button>
            <button style={styles.cancelClockInBtn} onClick={handleCancelClockIn} disabled={loading}>
              {t.cancelClockIn}
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
          <div style={styles.noProjectsTitle}>{t.noProjectsTitle}</div>
          <div style={styles.noProjectsText}>{t.noProjectsText}</div>
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
        {projectHasGeofence && (
          <div style={styles.geofenceHint}>{t.geofenceLocationHint}</div>
        )}
        {locationDenied && (
          <div style={styles.locationDenied}>
            <div style={styles.locationDeniedTitle}>{t.locationAccessBlocked}</div>
            <p style={styles.locationDeniedText}>{t.locationAccessHelp}</p>
            <ul style={styles.locationDeniedList}>
              <li><strong>iPhone/iPad:</strong> Settings → Privacy → Location Services → Safari (or your browser) → While Using</li>
              <li><strong>Android:</strong> Tap the lock icon in your browser's address bar → Permissions → Location → Allow</li>
              <li><strong>Desktop Chrome:</strong> Click the lock icon in the address bar → Site settings → Location → Allow</li>
              <li><strong>Desktop Firefox:</strong> Click the lock icon → Connection secure → More information → Permissions → Access your location</li>
            </ul>
            <p style={styles.locationDeniedText}>{t.locationAfterUpdate}</p>
          </div>
        )}
        {error && <p style={styles.error}>{error}</p>}
        {pendingChecklist && (
          <div style={styles.checklistGate}>
            <div style={styles.checklistGateTitle}>☑ Required: {pendingChecklist.name}</div>
            <div style={styles.checklistGateSub}>{t.checklistCompleteToClock}</div>
            {(pendingChecklist.items || []).map((item, i) => (
              <div key={i} style={styles.checklistGateItem}>
                {item.type === 'text' ? (
                  <>
                    <div style={styles.checklistGateLabel}>{item.label}</div>
                    <input
                      style={styles.checklistGateTextInput}
                      type="text"
                      placeholder={t.notesPlaceholder}
                      value={checklistAnswers[i] || ''}
                      onChange={e => setChecklistAnswers(a => ({ ...a, [i]: e.target.value }))}
                    />
                  </>
                ) : (
                  <label style={styles.checklistGateCheckRow}>
                    <input
                      type="checkbox"
                      checked={!!checklistAnswers[i]}
                      onChange={e => setChecklistAnswers(a => ({ ...a, [i]: e.target.checked }))}
                      style={{ width: 18, height: 18, flexShrink: 0 }}
                    />
                    <span style={styles.checklistGateLabel}>{item.label}</span>
                  </label>
                )}
              </div>
            ))}
            <button
              style={styles.checklistGateSubmitBtn}
              onClick={handleChecklistSubmit}
              disabled={checklistSubmitting}
            >
              {checklistSubmitting ? t.checklistSubmitting : t.submitChecklistClockIn}
            </button>
            <button style={styles.checklistGateCancelBtn} onClick={() => { setPendingChecklist(null); setChecklistAnswers({}); }}>
              {t.cancel}
            </button>
          </div>
        )}
        {!pendingChecklist && (
          <button style={styles.clockInBtn} className="clock-btn" onClick={handleClockIn} disabled={loading}>
            {loading ? t.clockingIn : t.clockIn}
          </button>
        )}
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
  locationDenied: { background: '#fefce8', border: '1px solid #fde047', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 },
  locationDeniedTitle: { fontSize: 14, fontWeight: 700, color: '#854d0e' },
  locationDeniedText: { fontSize: 12, color: '#713f12', margin: 0 },
  locationDeniedList: { fontSize: 12, color: '#713f12', margin: '2px 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 },
  geofenceHint: { fontSize: 12, color: '#0369a1', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, padding: '7px 11px' },
  error: { color: '#ef4444', fontSize: 13, margin: 0, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px' },
  errorDark: { fontSize: 13, margin: 0, background: 'rgba(255,255,255,0.15)', borderRadius: 6, padding: '8px 12px', color: '#fff' },
  clockInBtn: { padding: '13px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700 },
  switchProjectBtn: { width: '100%', padding: '11px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  switchBox: { background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 },
  switchSelect: { padding: '9px 11px', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 7, fontSize: 14, background: 'rgba(255,255,255,0.15)', color: '#fff', width: '100%' },
  switchActions: { display: 'flex', gap: 8 },
  switchConfirmBtn: { flex: 1, padding: '9px', background: '#fff', color: '#1a56db', border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  switchCancelBtn: { padding: '9px 14px', background: 'none', border: '1px solid rgba(255,255,255,0.4)', color: 'rgba(255,255,255,0.8)', borderRadius: 7, fontSize: 13, cursor: 'pointer' },
  clockOutBtn: { width: '100%', padding: '13px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: '2px solid rgba(255,255,255,0.5)', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  cancelClockInBtn: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: '2px 0', alignSelf: 'center' },
  checklistGate: { background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 },
  checklistGateTitle: { fontSize: 14, fontWeight: 700, color: '#15803d' },
  checklistGateSub: { fontSize: 12, color: '#166534', marginTop: -6 },
  checklistGateItem: { display: 'flex', flexDirection: 'column', gap: 4 },
  checklistGateCheckRow: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' },
  checklistGateLabel: { fontSize: 13, color: '#374151', fontWeight: 500 },
  checklistGateTextInput: { padding: '7px 10px', border: '1px solid #d1fae5', borderRadius: 6, fontSize: 13, width: '100%' },
  checklistGateSubmitBtn: { padding: '11px', background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  checklistGateCancelBtn: { background: 'none', border: 'none', color: '#6b7280', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', alignSelf: 'center' },
  noProjects: { textAlign: 'center', padding: '24px 16px' },
  noProjectsIcon: { fontSize: 36, marginBottom: 10 },
  noProjectsTitle: { fontWeight: 700, fontSize: 16, color: '#374151', marginBottom: 6 },
  noProjectsText: { fontSize: 13, color: '#9ca3af', lineHeight: 1.5 },
  offlineBanner: { background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 7, padding: '8px 12px', fontSize: 13, fontWeight: 500, marginBottom: 12 },
  offlineBannerDark: { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontWeight: 500 },
};
