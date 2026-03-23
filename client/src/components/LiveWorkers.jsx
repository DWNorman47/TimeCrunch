import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../api';
import { useT } from '../hooks/useT';

// Fix default marker icons broken by Webpack/Vite bundling
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function formatElapsed(clockInTime) {
  const seconds = Math.floor((Date.now() - new Date(clockInTime)) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function ElapsedTimer({ clockInTime }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <span style={styles.elapsed}>{formatElapsed(clockInTime)}</span>;
}

export default function LiveWorkers() {
  const t = useT();
  const [workers, setWorkers] = useState([]);
  const [inactiveWorkers, setInactiveWorkers] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedWorker, setSelectedWorker] = useState('');
  const [dismissedInactive, setDismissedInactive] = useState(false);
  const intervalRef = useRef(null);

  const fetchActive = () => {
    api.get('/admin/active-clocks')
      .then(r => { setWorkers(r.data); setLastUpdated(new Date()); })
      .catch(() => {});
  };

  const fetchInactive = () => {
    api.get('/admin/notifications')
      .then(r => { setInactiveWorkers(r.data); setDismissedInactive(false); })
      .catch(() => {});
  };

  useEffect(() => {
    fetchActive();
    fetchInactive();
    intervalRef.current = setInterval(fetchActive, 30000);
    return () => clearInterval(intervalRef.current);
  }, []);

  // Unique projects from currently clocked-in workers
  const activeProjects = [...new Map(
    workers.filter(w => w.project_name).map(w => [w.project_name, w.project_name])
  ).values()].sort();

  const handleWorkerSelect = e => {
    const userId = e.target.value;
    setSelectedWorker(userId);
    if (userId) {
      const w = workers.find(w => String(w.user_id) === userId);
      setSelectedProject(w?.project_name || '');
    }
  };

  const handleProjectSelect = e => {
    setSelectedProject(e.target.value);
    setSelectedWorker('');
  };

  const filtered = selectedProject
    ? workers.filter(w => w.project_name === selectedProject)
    : workers;

  const mapped = filtered.filter(w => w.clock_in_lat && w.clock_in_lng);
  const center = mapped.length > 0
    ? [mapped[0].clock_in_lat, mapped[0].clock_in_lng]
    : [39.5, -98.35];

  return (
    <div style={styles.wrap}>
      {inactiveWorkers.length > 0 && !dismissedInactive && (
        <div style={styles.inactiveBanner}>
          <div style={styles.inactiveBannerLeft}>
            <span style={styles.inactiveIcon}>⚠️</span>
            <div>
              <div style={styles.inactiveBannerTitle}>{t.inactiveWorkers}</div>
              <div style={styles.inactiveBannerList}>
                {inactiveWorkers.map(w => (
                  <span key={w.id} style={styles.inactivePill}>
                    {w.full_name} <span style={styles.inactiveDays}>({w.days_inactive}d)</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button style={styles.dismissBtn} onClick={() => setDismissedInactive(true)}>✕</button>
        </div>
      )}
      <div style={styles.header}>
        <h2 style={styles.title}>{t.liveWorkers}</h2>
        <div style={styles.liveIndicator}>
          <span style={styles.liveDot} />
          <span style={styles.liveText}>{t.liveLabel}</span>
          {lastUpdated && (
            <span style={styles.updated}>Updated {lastUpdated.toLocaleTimeString()}</span>
          )}
          <button style={styles.refreshBtn} onClick={fetchActive}>{t.refresh}</button>
        </div>
      </div>

      {workers.length > 0 && (
        <div style={styles.filters}>
          <select style={styles.filterSelect} value={selectedProject} onChange={handleProjectSelect}>
            <option value="">{t.allProjects} ({workers.length})</option>
            {activeProjects.map(p => (
              <option key={p} value={p}>
                {p} ({workers.filter(w => w.project_name === p).length})
              </option>
            ))}
          </select>
          <select style={styles.filterSelect} value={selectedWorker} onChange={handleWorkerSelect}>
            <option value="">{t.findWorker}</option>
            {workers.map(w => (
              <option key={w.user_id} value={w.user_id}>{w.full_name}</option>
            ))}
          </select>
        </div>
      )}

      {workers.length === 0 ? (
        <div style={styles.empty}>{t.noClockedIn}</div>
      ) : filtered.length === 0 ? (
        <div style={styles.empty}>{t.noWorkersOnProject}</div>
      ) : (
        <>
          <div style={styles.workerList}>
            {filtered.map(w => (
              <div key={w.user_id} style={styles.workerCard}>
                <div style={styles.workerTop}>
                  <div>
                    <div style={styles.workerName}>{w.full_name}</div>
                    <div style={styles.workerProject}>{w.project_name}</div>
                  </div>
                  <ElapsedTimer clockInTime={w.clock_in_time} />
                </div>
                {w.notes && <div style={styles.workerNotes}>{w.notes}</div>}
                <div style={styles.workerMeta}>
                  <span>{t.clockedIn} {new Date(w.clock_in_time).toLocaleTimeString()}</span>
                  {w.clock_in_lat
                    ? <span style={styles.locationTag}>{t.locationCaptured}</span>
                    : <span style={styles.noLocation}>{t.noLocation}</span>
                  }
                </div>
              </div>
            ))}
          </div>

          {mapped.length > 0 && (
            <div style={styles.mapWrap}>
              <h3 style={styles.mapTitle}>{t.clockInLocations}</h3>
              <MapContainer center={center} zoom={mapped.length === 1 ? 13 : 5} style={styles.map}>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                {mapped.map(w => (
                  <Marker key={w.user_id} position={[w.clock_in_lat, w.clock_in_lng]}>
                    <Popup>
                      <strong>{w.full_name}</strong><br />
                      {w.project_name}<br />
                      In: {new Date(w.clock_in_time).toLocaleTimeString()}
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 20 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 22, fontWeight: 700 },
  liveIndicator: { display: 'flex', alignItems: 'center', gap: 8 },
  liveDot: { width: 10, height: 10, borderRadius: '50%', background: '#16a34a', animation: 'pulse 2s infinite' },
  liveText: { fontWeight: 700, color: '#16a34a', fontSize: 14 },
  updated: { fontSize: 12, color: '#9ca3af' },
  refreshBtn: { background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 10px', fontSize: 12, color: '#6b7280', cursor: 'pointer' },
  filters: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  filterSelect: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, color: '#374151', background: '#fff', cursor: 'pointer', minWidth: 200 },
  empty: { background: '#fff', borderRadius: 12, padding: 32, textAlign: 'center', color: '#888', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  workerList: { display: 'flex', flexDirection: 'column', gap: 12 },
  workerCard: { background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderLeft: '4px solid #1a56db' },
  workerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  workerName: { fontWeight: 700, fontSize: 16 },
  workerProject: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  elapsed: { fontSize: 22, fontWeight: 800, color: '#1a56db', fontVariantNumeric: 'tabular-nums' },
  workerNotes: { fontSize: 13, color: '#555', fontStyle: 'italic', marginBottom: 6 },
  workerMeta: { display: 'flex', gap: 16, fontSize: 12, color: '#9ca3af', flexWrap: 'wrap' },
  locationTag: { color: '#16a34a' },
  noLocation: { color: '#d1d5db' },
  mapWrap: { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  mapTitle: { fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#374151' },
  map: { height: 380, width: '100%', borderRadius: 8 },
  inactiveBanner: { background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  inactiveBannerLeft: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  inactiveIcon: { fontSize: 18, lineHeight: 1.4 },
  inactiveBannerTitle: { fontWeight: 700, fontSize: 14, color: '#92400e', marginBottom: 6 },
  inactiveBannerList: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  inactivePill: { background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 20, padding: '2px 10px', fontSize: 13, color: '#78350f', fontWeight: 500 },
  inactiveDays: { color: '#b45309', fontWeight: 700 },
  dismissBtn: { background: 'none', border: 'none', color: '#9ca3af', fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1 },
};
