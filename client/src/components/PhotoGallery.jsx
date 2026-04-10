import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';

function fmtDate(str) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isVideo(item) {
  return item.media_type === 'video' || /\.(mp4|mov|webm|avi|m4v)$/i.test(item.url || '');
}

function MediaTile({ item, onClick }) {
  const video = isVideo(item);
  return (
    <div style={styles.tile} onClick={onClick}>
      {video ? (
        <div style={styles.videoThumb}>
          <video src={item.url} style={styles.tileImg} preload="metadata" muted playsInline />
          <div style={styles.playOverlay}>▶</div>
        </div>
      ) : (
        <img src={item.url} style={styles.tileImg} alt={item.caption || ''} loading="lazy" />
      )}
      {item.caption && <div style={styles.tileCaption}>{item.caption}</div>}
      {item.project_name && <div style={styles.tileProject}>{item.project_name}</div>}
    </div>
  );
}

function Lightbox({ items, index, onClose }) {
  const [idx, setIdx] = useState(index);
  const item = items[idx];
  const video = isVideo(item);
  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.lbContent} onClick={e => e.stopPropagation()}>
        {video ? (
          <video
            key={item.url}
            src={item.url}
            style={styles.lightboxVideo}
            controls
            autoPlay
            playsInline
          />
        ) : (
          <img src={item.url} style={styles.lightboxImg} alt="" />
        )}
      </div>
      <div style={styles.lightboxMeta} onClick={e => e.stopPropagation()}>
        {item.caption && <div style={styles.caption}>{item.caption}</div>}
        <div style={styles.metaLine}>
          {item.worker_name && <span>{item.worker_name} · </span>}
          {item.project_name && <span>{item.project_name} · </span>}
          <span>{fmtDate(item.reported_at)}</span>
          {item.lat && (
            <a href={`https://www.google.com/maps?q=${item.lat},${item.lng}`}
               target="_blank" rel="noopener noreferrer" style={styles.mapLink}>
              📍 Map
            </a>
          )}
        </div>
      </div>
      <div style={styles.navRow} onClick={e => e.stopPropagation()}>
        <button style={styles.navBtn} onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}>‹</button>
        <span style={styles.navCount}>{idx + 1} / {items.length}</span>
        <button style={styles.navBtn} onClick={() => setIdx(i => Math.min(items.length - 1, i + 1))} disabled={idx === items.length - 1}>›</button>
      </div>
      <button style={styles.closeBtn} onClick={onClose}>✕</button>
    </div>
  );
}

export default function PhotoGallery({ projects }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [lightbox, setLightbox] = useState(null);

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const loadMedia = async (f = filters) => {
    try {
      const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
      const r = await api.get('/field-reports/photos', { params });
      setMedia(r.data);
    } catch {}
  };

  useEffect(() => { loadMedia().finally(() => setLoading(false)); }, []);
  useEffect(() => { if (!loading) loadMedia(filters); }, [filters]);

  const grouped = media.reduce((acc, item) => {
    const day = item.reported_at?.substring(0, 10) ?? 'Unknown';
    if (!acc[day]) acc[day] = [];
    acc[day].push(item);
    return acc;
  }, {});

  const days = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const photoCount = media.filter(m => !isVideo(m)).length;
  const videoCount = media.filter(m => isVideo(m)).length;

  return (
    <div>
      <div style={styles.topRow}>
        <h1 style={styles.heading}>Media Gallery</h1>
        <span style={styles.count}>
          {photoCount > 0 && `${photoCount} photo${photoCount !== 1 ? 's' : ''}`}
          {photoCount > 0 && videoCount > 0 && ' · '}
          {videoCount > 0 && `${videoCount} video${videoCount !== 1 ? 's' : ''}`}
          {media.length === 0 && '0 items'}
        </span>
      </div>

      <div style={styles.filterBar}>
        {projects.length > 0 && (
          <select style={styles.filterSelect} value={filters.project_id || ''} onChange={e => setFilter('project_id', e.target.value)}>
            <option value="">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <input style={styles.filterInput} type="date" value={filters.from || ''} onChange={e => setFilter('from', e.target.value)} title={t.fromDate} />
        <input style={styles.filterInput} type="date" value={filters.to || ''} onChange={e => setFilter('to', e.target.value)} title={t.toDate} />
      </div>

      {lightbox !== null && (
        <Lightbox items={media} index={lightbox} onClose={() => setLightbox(null)} />
      )}

      {loading ? (
        <p style={styles.hint}>Loading…</p>
      ) : media.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>🖼️</div>
          <p style={styles.emptyText}>No media yet. Photos and videos from field notes appear here.</p>
        </div>
      ) : (
        days.map(day => (
          <div key={day} style={styles.dayGroup}>
            <div style={styles.dayHeader}>
              <span style={styles.dayLabel}>{fmtDate(day + 'T12:00:00')}</span>
              <span style={styles.dayCount}>{grouped[day].length} item{grouped[day].length !== 1 ? 's' : ''}</span>
            </div>
            <div style={styles.grid}>
              {grouped[day].map(item => {
                const idx = media.indexOf(item);
                return <MediaTile key={item.id} item={item} onClick={() => setLightbox(idx)} />;
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
  tile: { position: 'relative', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', aspectRatio: '1', background: '#111827' },
  videoThumb: { width: '100%', height: '100%', position: 'relative' },
  tileImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  playOverlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#fff', background: 'rgba(0,0,0,0.35)', pointerEvents: 'none' },
  tileCaption: { position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.65))', color: '#fff', fontSize: 10, padding: '14px 6px 5px', lineHeight: 1.3 },
  tileProject: { position: 'absolute', top: 5, left: 5, background: 'rgba(109,40,217,0.85)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 8 },
  // Lightbox
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 },
  lbContent: { maxWidth: '100%', maxHeight: '72vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  lightboxImg: { maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain', borderRadius: 8 },
  lightboxVideo: { maxWidth: '100%', maxHeight: '72vh', borderRadius: 8, outline: 'none' },
  lightboxMeta: { marginTop: 12, textAlign: 'center' },
  caption: { color: '#fff', fontSize: 14, marginBottom: 4 },
  metaLine: { color: 'rgba(255,255,255,0.6)', fontSize: 12, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' },
  mapLink: { color: '#60a5fa', textDecoration: 'none', fontWeight: 600 },
  navRow: { display: 'flex', alignItems: 'center', gap: 20, marginTop: 16 },
  navBtn: { background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 24, width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  navCount: { color: '#fff', fontSize: 13 },
  closeBtn: { position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 18, width: 36, height: 36, borderRadius: '50%', cursor: 'pointer' },
};
