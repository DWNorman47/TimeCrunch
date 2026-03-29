import React, { useState, useEffect } from 'react';
import api from '../api';
import PhotoCapture from './PhotoCapture';
import { useOffline } from '../contexts/OfflineContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toLocaleDateString('en-CA');
}

function shiftDate(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
}

function dayLabel(dateStr) {
  const today = todayISO();
  if (dateStr === today) return 'Today';
  if (dateStr === shiftDate(today, -1)) return 'Yesterday';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function getRecentProjects() {
  try { return JSON.parse(localStorage.getItem('field-recent-projects') || '[]'); } catch { return []; }
}

function markProjectUsed(id) {
  if (!id) return;
  const recent = getRecentProjects().filter(x => x !== String(id));
  localStorage.setItem('field-recent-projects', JSON.stringify([String(id), ...recent].slice(0, 30)));
}

function sortProjects(projects) {
  const recent = getRecentProjects();
  return [...projects].sort((a, b) => {
    const ai = recent.indexOf(String(a.id));
    const bi = recent.indexOf(String(b.id));
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    // Neither recently used — newest project first
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

function getLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve({ lat: null, lng: null });
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({ lat: null, lng: null }),
      { timeout: 8000 }
    );
  });
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ photos, startIndex, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  return (
    <div style={s.lbBackdrop} onClick={onClose}>
      <img src={photos[idx].url} style={s.lbImg} alt="" onClick={e => e.stopPropagation()} />
      {photos[idx].caption && <div style={s.lbCaption}>{photos[idx].caption}</div>}
      <div style={s.lbNav} onClick={e => e.stopPropagation()}>
        <button style={s.lbBtn} onClick={() => setIdx(i => i - 1)} disabled={idx === 0}>‹</button>
        <span style={s.lbCount}>{idx + 1} / {photos.length}</span>
        <button style={s.lbBtn} onClick={() => setIdx(i => i + 1)} disabled={idx === photos.length - 1}>›</button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FieldDayLog({ projects, isAdmin }) {
  const { onSync } = useOffline() || {};

  const [project, setProject] = useState('');
  const [date, setDate] = useState(todayISO());
  const [dayReports, setDayReports] = useState([]);
  const [loading, setLoading] = useState(false);

  const [photoOpen, setPhotoOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [capturePhotos, setCapturePhotos] = useState([]);
  const [captureNote, setCaptureNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [lightbox, setLightbox] = useState(null); // { photos, index }

  const isToday = date === todayISO();

  // Set default project once projects load
  useEffect(() => {
    if (!projects.length) return;
    const last = localStorage.getItem('field-last-project');
    if (last && projects.some(p => String(p.id) === last)) {
      setProject(last);
    } else {
      const sorted = sortProjects(projects);
      if (sorted[0]) setProject(String(sorted[0].id));
    }
  }, [projects]);

  const load = async (proj = project, d = date) => {
    setLoading(true);
    try {
      const params = { from: d, to: d };
      if (proj) params.project_id = proj;
      const r = await api.get('/field-reports', { params });
      setDayReports(r.data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { if (project !== '' || projects.length === 0) load(); }, [project, date]);
  useEffect(() => { if (!onSync) return; return onSync(count => { if (count > 0) load(); }); }, [onSync]);

  const selectProject = id => {
    setProject(id);
    localStorage.setItem('field-last-project', id);
    markProjectUsed(id);
  };

  const prevDay = () => setDate(d => shiftDate(d, -1));
  const nextDay = () => { if (!isToday) setDate(d => shiftDate(d, 1)); };

  const openPhoto = () => { setPhotoOpen(o => !o); setNoteOpen(false); setError(''); };
  const openNote  = () => { setNoteOpen(o => !o); setPhotoOpen(false); setError(''); };

  const submitPhotos = async () => {
    if (capturePhotos.length === 0) { setError('Add at least one photo.'); return; }
    setSaving(true); setError('');
    const { lat, lng } = await getLocation();
    try {
      const r = await api.post('/field-reports', {
        project_id: project || undefined,
        photos: capturePhotos,
        lat, lng,
        report_date: date,
      });
      const item = r.data?.offline
        ? { id: 'pending-' + Date.now(), pending: true, photos: capturePhotos.map(p => ({ url: p.url, caption: p.caption || '' })), notes: null, reported_at: new Date().toISOString(), project_id: project }
        : r.data;
      setDayReports(prev => [item, ...prev]);
      setCapturePhotos([]);
      setPhotoOpen(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit');
    } finally { setSaving(false); }
  };

  const submitNote = async () => {
    if (!captureNote.trim()) { setError('Enter a note.'); return; }
    setSaving(true); setError('');
    const { lat, lng } = await getLocation();
    try {
      const r = await api.post('/field-reports', {
        project_id: project || undefined,
        notes: captureNote,
        lat, lng,
        report_date: date,
      });
      const item = r.data?.offline
        ? { id: 'pending-' + Date.now(), pending: true, notes: captureNote, photos: [], reported_at: new Date().toISOString(), project_id: project }
        : r.data;
      setDayReports(prev => [item, ...prev]);
      setCaptureNote('');
      setNoteOpen(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit');
    } finally { setSaving(false); }
  };

  const handleReview = async (id) => {
    try {
      await api.patch(`/field-reports/${id}/review`);
      setDayReports(prev => prev.map(r => r.id === id ? { ...r, status: 'reviewed' } : r));
    } catch {}
  };

  // Flatten all photos across the day's reports
  const allPhotos = dayReports.flatMap(r =>
    (r.photos || []).map(p => ({
      ...p,
      worker_name: r.worker_name,
      reported_at: r.reported_at,
      pending: r.pending,
    }))
  );

  // Reports that have notes
  const allNotes = dayReports.filter(r => r.notes?.trim());

  const unreviewedNotes = allNotes.filter(r => r.status !== 'reviewed' && !r.pending).length;

  const sorted = sortProjects(projects);

  return (
    <div>
      {lightbox && (
        <Lightbox
          photos={lightbox.photos}
          startIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Top bar — project + date nav */}
      <div style={s.topBar}>
        <select style={s.projectSelect} value={project} onChange={e => selectProject(e.target.value)}>
          <option value="">All projects</option>
          {sorted.map(p => (
            <option key={p.id} value={String(p.id)}>{p.name}</option>
          ))}
        </select>

        <div style={s.dateNav}>
          <button style={s.dateArrow} onClick={prevDay}>‹</button>
          <span style={s.dateLabel}>{dayLabel(date)}</span>
          <button style={{ ...s.dateArrow, opacity: isToday ? 0.3 : 1 }} onClick={nextDay} disabled={isToday}>›</button>
        </div>
      </div>

      {/* Action row — today only */}
      {isToday && (
        <div style={s.actionRow}>
          <button
            style={photoOpen ? { ...s.actionBtn, ...s.actionBtnOn } : s.actionBtn}
            onClick={openPhoto}
          >
            📷 Add Photos
          </button>
          <button
            style={noteOpen ? { ...s.actionBtn, ...s.actionBtnOn } : s.actionBtn}
            onClick={openNote}
          >
            📝 Add Note
          </button>
        </div>
      )}

      {/* Photo capture panel */}
      {photoOpen && (
        <div style={s.capturePanel}>
          <PhotoCapture photos={capturePhotos} onChange={setCapturePhotos} />
          {error && <p style={s.error}>{error}</p>}
          <div style={s.captureActions}>
            <button style={s.submitBtn} onClick={submitPhotos} disabled={saving || capturePhotos.length === 0}>
              {saving ? 'Submitting…' : capturePhotos.length > 0
                ? `Submit ${capturePhotos.length} photo${capturePhotos.length !== 1 ? 's' : ''}`
                : 'Submit Photos'}
            </button>
            <button style={s.cancelBtn} onClick={() => { setPhotoOpen(false); setCapturePhotos([]); setError(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Note input panel */}
      {noteOpen && (
        <div style={s.capturePanel}>
          <textarea
            style={s.noteTextarea}
            rows={5}
            placeholder="Describe what you observed, completed, or found on site…"
            value={captureNote}
            onChange={e => setCaptureNote(e.target.value)}
            autoFocus
          />
          {error && <p style={s.error}>{error}</p>}
          <div style={s.captureActions}>
            <button style={s.submitBtn} onClick={submitNote} disabled={saving || !captureNote.trim()}>
              {saving ? 'Submitting…' : 'Submit Note'}
            </button>
            <button style={s.cancelBtn} onClick={() => { setNoteOpen(false); setCaptureNote(''); setError(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Day content */}
      {loading ? (
        <p style={s.hint}>Loading…</p>
      ) : dayReports.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyIcon}>📋</div>
          <p style={s.emptyText}>
            {isToday
              ? 'Nothing logged yet today. Use the buttons above to add photos or notes.'
              : 'No field notes for this day.'}
          </p>
        </div>
      ) : (
        <>
          {/* Photos section */}
          {allPhotos.length > 0 && (
            <div style={s.section}>
              <div style={s.sectionHead}>
                <span style={s.sectionTitle}>Photos</span>
                <span style={s.sectionCount}>{allPhotos.length}</span>
              </div>
              <div style={s.photoGrid}>
                {allPhotos.map((p, i) => (
                  <div key={i} style={s.photoCell} onClick={() => setLightbox({ photos: allPhotos, index: i })}>
                    <img src={p.url} style={s.photoThumb} alt={p.caption || `photo ${i + 1}`} />
                    {p.caption && <div style={s.photoCaption}>{p.caption}</div>}
                    {isAdmin && p.worker_name && <div style={s.photoWorker}>{p.worker_name}</div>}
                    {p.pending && <div style={s.pendingDot}>⏳</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes section */}
          {allNotes.length > 0 && (
            <div style={s.section}>
              <div style={s.sectionHead}>
                <span style={s.sectionTitle}>Notes</span>
                <span style={s.sectionCount}>{allNotes.length}</span>
                {isAdmin && unreviewedNotes > 0 && (
                  <span style={s.unreviewedBadge}>{unreviewedNotes} unreviewed</span>
                )}
              </div>
              <div style={s.notesList}>
                {allNotes.map(r => (
                  <div key={r.id} style={s.noteCard}>
                    <div style={s.noteCardHead}>
                      {isAdmin && r.worker_name && (
                        <span style={s.noteWorker}>{r.worker_name}</span>
                      )}
                      <span style={s.noteTime}>
                        {new Date(r.reported_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      {r.pending && <span style={s.pendingBadge}>⏳ Pending sync</span>}
                      {r.lat && (
                        <a href={`https://www.google.com/maps?q=${r.lat},${r.lng}`} target="_blank" rel="noreferrer" style={s.mapLink}>📍</a>
                      )}
                      {isAdmin && !r.pending && r.status !== 'reviewed' && (
                        <button style={s.reviewBtn} onClick={() => handleReview(r.id)}>✓ Review</button>
                      )}
                      {r.status === 'reviewed' && (
                        <span style={s.reviewedBadge}>✓ Reviewed</span>
                      )}
                    </div>
                    <p style={s.noteText}>{r.notes}</p>
                    {/* Any photos attached to this note report */}
                    {r.photos?.length > 0 && (
                      <div style={s.notePhotoStrip}>
                        {r.photos.map((p, i) => (
                          <img
                            key={i}
                            src={p.url}
                            style={s.noteThumb}
                            alt=""
                            onClick={() => setLightbox({ photos: r.photos, index: i })}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  topBar: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' },
  projectSelect: { flex: 1, minWidth: 160, padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, background: '#fff', fontWeight: 600, color: '#111827' },
  dateNav: { display: 'flex', alignItems: 'center', gap: 2, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '4px 8px' },
  dateArrow: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#374151', padding: '2px 6px', lineHeight: 1 },
  dateLabel: { fontSize: 14, fontWeight: 700, color: '#111827', minWidth: 96, textAlign: 'center' },
  actionRow: { display: 'flex', gap: 10, marginBottom: 16 },
  actionBtn: { flex: 1, padding: '13px 0', background: '#fff', border: '2px solid #e5e7eb', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', textAlign: 'center' },
  actionBtnOn: { borderColor: '#059669', color: '#059669', background: '#f0fdf4' },
  capturePanel: { background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', marginBottom: 16 },
  noteTextarea: { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' },
  captureActions: { display: 'flex', gap: 8, marginTop: 12 },
  submitBtn: { background: '#059669', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  cancelBtn: { background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', padding: '10px 16px', borderRadius: 8, fontSize: 14, cursor: 'pointer' },
  error: { color: '#ef4444', fontSize: 13, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', margin: '8px 0 0' },
  section: { marginBottom: 22 },
  sectionHead: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 12, fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em' },
  sectionCount: { fontSize: 11, fontWeight: 700, color: '#fff', background: '#9ca3af', padding: '1px 7px', borderRadius: 10 },
  unreviewedBadge: { fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '1px 8px', borderRadius: 10 },
  photoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 6 },
  photoCell: { position: 'relative', cursor: 'pointer', borderRadius: 8, overflow: 'hidden', aspectRatio: '1' },
  photoThumb: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  photoCaption: { position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, padding: '3px 5px', lineHeight: 1.3 },
  photoWorker: { position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, textTransform: 'uppercase' },
  pendingDot: { position: 'absolute', top: 4, right: 4, fontSize: 13 },
  notesList: { display: 'flex', flexDirection: 'column', gap: 8 },
  noteCard: { background: '#fff', borderRadius: 10, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  noteCardHead: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  noteWorker: { fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em' },
  noteTime: { fontSize: 12, color: '#9ca3af' },
  pendingBadge: { fontSize: 10, fontWeight: 600, color: '#92400e', background: '#fef3c7', padding: '1px 6px', borderRadius: 6 },
  mapLink: { fontSize: 13, color: '#6b7280', textDecoration: 'none' },
  reviewBtn: { marginLeft: 'auto', background: '#059669', color: '#fff', border: 'none', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' },
  reviewedBadge: { marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#065f46', background: '#d1fae5', padding: '2px 8px', borderRadius: 10 },
  noteText: { fontSize: 14, color: '#374151', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' },
  notePhotoStrip: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 },
  noteThumb: { width: 72, height: 54, objectFit: 'cover', borderRadius: 6, cursor: 'pointer' },
  hint: { color: '#9ca3af', fontSize: 14 },
  empty: { textAlign: 'center', padding: '60px 20px' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  // Lightbox
  lbBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, cursor: 'pointer' },
  lbImg: { maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8 },
  lbCaption: { color: '#fff', fontSize: 14, marginTop: 12, opacity: 0.85 },
  lbNav: { display: 'flex', alignItems: 'center', gap: 20, marginTop: 16 },
  lbBtn: { background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 24, width: 44, height: 44, borderRadius: '50%', cursor: 'pointer' },
  lbCount: { color: '#fff', fontSize: 13 },
};
