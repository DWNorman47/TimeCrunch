import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import AppSwitcher from '../components/AppSwitcher';
import TabBar from '../components/TabBar';
import PhotoCapture from '../components/PhotoCapture';
import DailyReports from '../components/DailyReports';
import Punchlist from '../components/Punchlist';
import SafetyTalks from '../components/SafetyTalks';
import IncidentReports from '../components/IncidentReports';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function fmtDate(str) {
  return new Date(str).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ── Report card (shared by worker + admin views) ──────────────────────────────

function ReportCard({ report, isAdmin, onReviewed, onDeleted }) {
  const [expanded, setExpanded] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const handleReview = async () => {
    setReviewing(true);
    try {
      await api.patch(`/field-reports/${report.id}/review`);
      onReviewed(report.id);
    } finally { setReviewing(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this report?')) return;
    setDeleting(true);
    try {
      await api.delete(`/field-reports/${report.id}`);
      onDeleted(report.id);
    } finally { setDeleting(false); }
  };

  return (
    <>
      {lightbox !== null && (
        <div style={styles.lightboxBackdrop} onClick={() => setLightbox(null)}>
          <img src={report.photos[lightbox].url} style={styles.lightboxImg} alt="" />
          {report.photos[lightbox].caption && <div style={styles.lightboxCaption}>{report.photos[lightbox].caption}</div>}
          <div style={styles.lightboxNav}>
            {lightbox > 0 && <button style={styles.lightboxBtn} onClick={e => { e.stopPropagation(); setLightbox(lightbox - 1); }}>‹</button>}
            <span style={{ color: '#fff', fontSize: 13 }}>{lightbox + 1} / {report.photos.length}</span>
            {lightbox < report.photos.length - 1 && <button style={styles.lightboxBtn} onClick={e => { e.stopPropagation(); setLightbox(lightbox + 1); }}>›</button>}
          </div>
        </div>
      )}

      <div style={styles.card}>
        <div style={styles.cardHeader} onClick={() => setExpanded(e => !e)}>
          <div style={styles.cardLeft}>
            {isAdmin && <div style={styles.workerName}>{report.worker_name}</div>}
            <div style={styles.cardTitle}>{report.title || 'Field Report'}</div>
            <div style={styles.cardMeta}>
              {fmtDate(report.reported_at)}
              {report.project_name && <span style={styles.projectTag}>{report.project_name}</span>}
              {report.photos.length > 0 && <span style={styles.photoCount}>📷 {report.photos.length}</span>}
              {report.lat && (
                <a href={`https://www.google.com/maps?q=${report.lat},${report.lng}`} target="_blank" rel="noreferrer" style={styles.mapLink} onClick={e => e.stopPropagation()}>📍 Map</a>
              )}
            </div>
          </div>
          <div style={styles.cardRight}>
            <span style={report.status === 'reviewed' ? styles.badgeReviewed : styles.badgeSubmitted}>
              {report.status === 'reviewed' ? 'Reviewed' : 'Submitted'}
            </span>
            <span style={styles.chevron}>{expanded ? '▲' : '▼'}</span>
          </div>
        </div>

        {expanded && (
          <div style={styles.cardBody}>
            {report.notes && <p style={styles.notes}>{report.notes}</p>}

            {report.photos.length > 0 && (
              <div style={styles.photoStrip}>
                {report.photos.map((p, i) => (
                  <div key={i} style={styles.thumb} onClick={() => setLightbox(i)}>
                    <img src={p.url} style={styles.thumbImg} alt={p.caption || `photo ${i + 1}`} />
                    {p.caption && <div style={styles.thumbCaption}>{p.caption}</div>}
                  </div>
                ))}
              </div>
            )}

            <div style={styles.cardActions}>
              {isAdmin && report.status !== 'reviewed' && (
                <button style={styles.reviewBtn} onClick={handleReview} disabled={reviewing}>
                  {reviewing ? '...' : '✓ Mark Reviewed'}
                </button>
              )}
              {(!isAdmin || report.status !== 'reviewed') && (
                <button style={styles.deleteBtn} onClick={handleDelete} disabled={deleting}>
                  {deleting ? '...' : 'Delete'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── New Report Form ───────────────────────────────────────────────────────────

function NewReportForm({ projects, onSubmitted, onCancel }) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [projectId, setProjectId] = useState('');
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async e => {
    e.preventDefault();
    if (!notes.trim() && photos.length === 0) { setError('Add notes or at least one photo.'); return; }
    setSaving(true); setError('');
    const { lat, lng } = await getLocation();
    try {
      const r = await api.post('/field-reports', { title: title || undefined, notes: notes || undefined, project_id: projectId || undefined, lat, lng, photos });
      onSubmitted(r.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit report');
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <h3 style={styles.formTitle}>New Field Report</h3>

      <div style={styles.fieldGroup}>
        <label style={styles.label}>Title <span style={styles.optional}>(optional)</span></label>
        <input style={styles.input} type="text" placeholder="e.g. Site inspection, Damage found, Work complete" value={title} onChange={e => setTitle(e.target.value)} />
      </div>

      {projects.length > 0 && (
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Project <span style={styles.optional}>(optional)</span></label>
          <select style={styles.input} value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      <div style={styles.fieldGroup}>
        <label style={styles.label}>Notes</label>
        <textarea style={styles.textarea} rows={4} placeholder="Describe what you found, what was done, any issues..." value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <div style={styles.fieldGroup}>
        <label style={styles.label}>Photos</label>
        <PhotoCapture photos={photos} onChange={setPhotos} />
      </div>

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.formActions}>
        <button style={styles.submitBtn} type="submit" disabled={saving}>
          {saving ? 'Submitting...' : 'Submit Report'}
        </button>
        <button style={styles.cancelBtn} type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ── Admin filter bar ──────────────────────────────────────────────────────────

function FilterBar({ workers, projects, filters, onChange }) {
  const set = (k, v) => onChange({ ...filters, [k]: v });
  return (
    <div style={styles.filterBar}>
      <select style={styles.filterSelect} value={filters.worker_id || ''} onChange={e => set('worker_id', e.target.value)}>
        <option value="">All workers</option>
        {workers.map(w => <option key={w.id} value={w.id}>{w.full_name}</option>)}
      </select>
      <select style={styles.filterSelect} value={filters.project_id || ''} onChange={e => set('project_id', e.target.value)}>
        <option value="">All projects</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select style={styles.filterSelect} value={filters.status || ''} onChange={e => set('status', e.target.value)}>
        <option value="">All statuses</option>
        <option value="submitted">Submitted</option>
        <option value="reviewed">Reviewed</option>
      </select>
      <input style={styles.filterInput} type="date" value={filters.from || ''} onChange={e => set('from', e.target.value)} placeholder="From" title="From date" />
      <input style={styles.filterInput} type="date" value={filters.to || ''} onChange={e => set('to', e.target.value)} placeholder="To" title="To date" />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FieldPage() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [reports, setReports] = useState([]);
  const [projects, setProjects] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [features, setFeatures] = useState({});
  const [loading, setLoading] = useState(true);
  const FIELD_TABS = ['notes', 'daily', 'punchlist', 'safety', 'incident'];
  const hashTab = window.location.hash.replace('#', '');
  const [fieldTab, setFieldTab] = useState(FIELD_TABS.includes(hashTab) ? hashTab : 'notes');
  const switchTab = t => { setFieldTab(t); window.location.hash = t; };
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({});

  const loadReports = async (f = filters) => {
    try {
      const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
      const r = await api.get('/field-reports', { params });
      setReports(r.data);
    } catch {}
  };

  useEffect(() => {
    const init = async () => {
      const promises = [api.get('/projects'), api.get('/settings')];
      if (isAdmin) promises.push(api.get('/admin/workers'));
      const [p, s, w] = await Promise.all(promises);
      setFeatures(s.data);
      setProjects(p.data);
      if (w) setWorkers(w.data);
      await loadReports();
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => { if (!loading) loadReports(filters); }, [filters]);

  const handleSubmitted = report => {
    setReports(prev => [report, ...prev]);
    setShowForm(false);
  };

  const handleReviewed = id => setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'reviewed' } : r));
  const handleDeleted = id => setReports(prev => prev.filter(r => r.id !== id));

  const unreviewed = reports.filter(r => r.status !== 'reviewed').length;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logoGroup}>
          <AppSwitcher currentApp="field" userRole={user?.role} features={features} />
          {user?.company_name && <span style={styles.companyName}>{user.company_name}</span>}
        </div>
        <div style={styles.headerRight}>
          {!isAdmin && <span style={styles.userName}>{user?.full_name}</span>}
          <button style={styles.headerBtn} onClick={logout}>Logout</button>
        </div>
      </header>

      <main style={styles.main}>
        {/* Module tabs */}
        <TabBar
          active={fieldTab}
          onChange={switchTab}
          tabs={[
            { id: 'notes', label: '📷 Notes' },
            { id: 'daily', label: '📋 Daily' },
            { id: 'punchlist', label: '✅ Punch' },
            { id: 'safety', label: '🦺 Safety' },
            { id: 'incident', label: '🚨 Incidents' },
          ]}
        />

        {fieldTab === 'daily' ? (
          <DailyReports projects={projects} />
        ) : fieldTab === 'punchlist' ? (
          <Punchlist projects={projects} />
        ) : fieldTab === 'safety' ? (
          <SafetyTalks projects={projects} />
        ) : fieldTab === 'incident' ? (
          <IncidentReports projects={projects} />
        ) : (
        <>
        <div style={styles.topRow}>
          <div>
            <h1 style={styles.heading}>Field Notes</h1>
            {isAdmin && unreviewed > 0 && (
              <p style={styles.unreviewedNote}>{unreviewed} unreviewed report{unreviewed !== 1 ? 's' : ''}</p>
            )}
          </div>
          {!isAdmin && !showForm && (
            <button style={styles.newBtn} onClick={() => setShowForm(true)}>+ New Report</button>
          )}
        </div>

        {showForm && (
          <div style={styles.formCard}>
            <NewReportForm projects={projects} onSubmitted={handleSubmitted} onCancel={() => setShowForm(false)} />
          </div>
        )}

        {isAdmin && (
          <FilterBar workers={workers} projects={projects} filters={filters} onChange={setFilters} />
        )}

        {loading ? (
          <p style={styles.hint}>Loading...</p>
        ) : reports.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>📷</div>
            <p style={styles.emptyText}>{isAdmin ? 'No field reports yet.' : 'No reports yet. Tap + New Report to get started.'}</p>
          </div>
        ) : (
          <div style={styles.reportList}>
            {reports.map(r => (
              <ReportCard key={r.id} report={r} isAdmin={isAdmin} onReviewed={handleReviewed} onDeleted={handleDeleted} />
            ))}
          </div>
        )}
        </>
        )}
      </main>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: { minHeight: '100vh', background: '#f4f6f9' },
  header: { background: '#059669', color: '#fff', padding: '0 24px', paddingTop: 'env(safe-area-inset-top)', height: 'calc(56px + env(safe-area-inset-top))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoGroup: { display: 'flex', alignItems: 'center', gap: 10 },
  companyName: { fontSize: 14, fontWeight: 400, opacity: 0.75 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  userName: { fontSize: 14, opacity: 0.85 },
  headerBtn: { background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' },
  main: { maxWidth: 860, margin: '0 auto', padding: '24px 16px' },
  topRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12 },
  heading: { fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 },
  unreviewedNote: { fontSize: 13, color: '#d97706', fontWeight: 600, margin: '4px 0 0' },
  newBtn: { background: '#059669', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0 },
  formCard: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 20 },
  filterBar: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  filterSelect: { padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff', color: '#374151', flex: 1, minWidth: 120 },
  filterInput: { padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff', color: '#374151' },
  reportList: { display: 'flex', flexDirection: 'column', gap: 10 },
  // Card
  card: { background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 16px', cursor: 'pointer', gap: 12 },
  cardLeft: { flex: 1, minWidth: 0 },
  cardRight: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  workerName: { fontSize: 12, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 2 },
  cardTitle: { fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  cardMeta: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#6b7280', flexWrap: 'wrap' },
  projectTag: { background: '#ede9fe', color: '#6d28d9', padding: '1px 7px', borderRadius: 10, fontWeight: 600 },
  photoCount: { color: '#6b7280' },
  mapLink: { color: '#2563eb', fontWeight: 600, textDecoration: 'none' },
  chevron: { fontSize: 10, color: '#9ca3af' },
  badgeSubmitted: { fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: 10 },
  badgeReviewed: { fontSize: 11, fontWeight: 700, color: '#065f46', background: '#d1fae5', padding: '2px 8px', borderRadius: 10 },
  cardBody: { padding: '0 16px 14px', borderTop: '1px solid #f3f4f6' },
  notes: { fontSize: 14, color: '#374151', lineHeight: 1.6, margin: '12px 0', whiteSpace: 'pre-wrap' },
  photoStrip: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  thumb: { cursor: 'pointer', borderRadius: 8, overflow: 'hidden', position: 'relative' },
  thumbImg: { width: 110, height: 80, objectFit: 'cover', display: 'block' },
  thumbCaption: { position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, padding: '2px 5px', lineHeight: 1.3 },
  cardActions: { display: 'flex', gap: 8 },
  reviewBtn: { background: '#059669', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' },
  deleteBtn: { background: 'none', border: '1px solid #fca5a5', color: '#ef4444', padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  // Form
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  formTitle: { fontSize: 17, fontWeight: 700, margin: 0 },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 5 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151' },
  optional: { fontWeight: 400, color: '#9ca3af' },
  input: { padding: '9px 11px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14 },
  textarea: { padding: '9px 11px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 },
  error: { color: '#ef4444', fontSize: 13, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', margin: 0 },
  formActions: { display: 'flex', gap: 10 },
  submitBtn: { background: '#059669', color: '#fff', border: 'none', padding: '11px 22px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  cancelBtn: { background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', padding: '11px 22px', borderRadius: 8, fontSize: 14, cursor: 'pointer' },
  // Empty
  empty: { textAlign: 'center', padding: '60px 20px' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  hint: { color: '#9ca3af', fontSize: 14 },
  // Lightbox
  lightboxBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, cursor: 'pointer' },
  lightboxImg: { maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8 },
  lightboxCaption: { color: '#fff', fontSize: 14, marginTop: 12, opacity: 0.85 },
  lightboxNav: { display: 'flex', alignItems: 'center', gap: 20, marginTop: 16 },
  lightboxBtn: { background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 24, width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
};
