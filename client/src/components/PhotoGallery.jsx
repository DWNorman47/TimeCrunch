import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';

function fmtDate(str) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PhotoGallery({ projects }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [lightbox, setLightbox] = useState(null); // index into photos

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const loadPhotos = async (f = filters) => {
    try {
      const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
      const r = await api.get('/field-reports/photos', { params });
      setPhotos(r.data);
    } catch {}
  };

  useEffect(() => { loadPhotos().finally(() => setLoading(false)); }, []);
  useEffect(() => { if (!loading) loadPhotos(filters); }, [filters]);

  // Group photos by date
  const grouped = photos.reduce((acc, p) => {
    const day = p.reported_at?.substring(0, 10) ?? 'Unknown';
    if (!acc[day]) acc[day] = [];
    acc[day].push(p);
    return acc;
  }, {});

  const days = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div>
      <div style={styles.topRow}>
        <h1 style={styles.heading}>Photo Gallery</h1>
        <span style={styles.count}>{photos.length} photo{photos.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={styles.filterBar}>
        {projects.length > 0 && (
          <select style={styles.filterSelect} value={filters.project_id || ''} onChange={e => setFilter('project_id', e.target.value)}>
            <option value="">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <input style={styles.filterInput} type="date" value={filters.from || ''} onChange={e => setFilter('from', e.target.value)} title="From date" />
        <input style={styles.filterInput} type="date" value={filters.to || ''} onChange={e => setFilter('to', e.target.value)} title="To date" />
      </div>

      {lightbox !== null && (
        <div style={styles.backdrop} onClick={() => setLightbox(null)}>
          <img src={photos[lightbox].url} style={styles.lightboxImg} alt="" />
          <div style={styles.lightboxMeta}>
            {photos[lightbox].caption && <div style={styles.caption}>{photos[lightbox].caption}</div>}
            <div style={styles.metaLine}>
              {isAdmin && photos[lightbox].worker_name && <span>{photos[lightbox].worker_name} · </span>}
              {photos[lightbox].project_name && <span>{photos[lightbox].project_name} · </span>}
              <span>{fmtDate(photos[lightbox].reported_at)}</span>
              {photos[lightbox].lat && (
                <a href={`https://www.google.com/maps?q=${photos[lightbox].lat},${photos[lightbox].lng}`}
                   target="_blank" rel="noreferrer" style={styles.mapLink} onClick={e => e.stopPropagation()}>
                  📍 Map
                </a>
              )}
            </div>
          </div>
          <div style={styles.navRow} onClick={e => e.stopPropagation()}>
            <button style={styles.navBtn} onClick={() => setLightbox(l => Math.max(0, l - 1))} disabled={lightbox === 0}>‹</button>
            <span style={styles.navCount}>{lightbox + 1} / {photos.length}</span>
            <button style={styles.navBtn} onClick={() => setLightbox(l => Math.min(photos.length - 1, l + 1))} disabled={lightbox === photos.length - 1}>›</button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={styles.hint}>Loading…</p>
      ) : photos.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>📷</div>
          <p style={styles.emptyText}>No photos yet. Photos attached to field notes appear here.</p>
        </div>
      ) : (
        days.map(day => (
          <div key={day} style={styles.dayGroup}>
            <div style={styles.dayHeader}>
              <span style={styles.dayLabel}>{fmtDate(day + 'T12:00:00')}</span>
              <span style={styles.dayCount}>{grouped[day].length} photo{grouped[day].length !== 1 ? 's' : ''}</span>
            </div>
            <div style={styles.grid}>
              {grouped[day].map(photo => {
                const idx = photos.indexOf(photo);
                return (
                  <div key={photo.id} style={styles.tile} onClick={() => setLightbox(idx)}>
                    <img src={photo.url} style={styles.tileImg} alt={photo.caption || ''} loading="lazy" />
                    {photo.caption && <div style={styles.tileCaption}>{photo.caption}</div>}
                    {photo.project_name && <div style={styles.tileProject}>{photo.project_name}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

const styles = {
  topRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  heading: { fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 },
  count: { fontSize: 13, color: '#6b7280', fontWeight: 500 },
  filterBar: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 },
  filterSelect: { padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff', color: '#374151', flex: 1, minWidth: 140 },
  filterInput: { padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff', color: '#374151' },
  hint: { color: '#9ca3af', fontSize: 14 },
  empty: { textAlign: 'center', padding: '60px 20px' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  dayGroup: { marginBottom: 28 },
  dayHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  dayLabel: { fontSize: 14, fontWeight: 700, color: '#374151' },
  dayCount: { fontSize: 12, color: '#9ca3af' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 },
  tile: { position: 'relative', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', aspectRatio: '1', background: '#f3f4f6' },
  tileImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.15s' },
  tileCaption: { position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.65))', color: '#fff', fontSize: 10, padding: '14px 6px 5px', lineHeight: 1.3 },
  tileProject: { position: 'absolute', top: 5, left: 5, background: 'rgba(109,40,217,0.85)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 8 },
  // Lightbox
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, cursor: 'pointer' },
  lightboxImg: { maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain', borderRadius: 8 },
  lightboxMeta: { marginTop: 12, textAlign: 'center' },
  caption: { color: '#fff', fontSize: 14, marginBottom: 4 },
  metaLine: { color: 'rgba(255,255,255,0.6)', fontSize: 12, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' },
  mapLink: { color: '#60a5fa', textDecoration: 'none', fontWeight: 600 },
  navRow: { display: 'flex', alignItems: 'center', gap: 20, marginTop: 16 },
  navBtn: { background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 24, width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  navCount: { color: '#fff', fontSize: 13 },
};
