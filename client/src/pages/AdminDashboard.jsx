import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import WorkerMetrics from '../components/WorkerMetrics';
import ManageWorkers from '../components/ManageWorkers';
import ManageProjects from '../components/ManageProjects';
import ProjectReports from '../components/ProjectReports';
import ChangePassword from '../components/ChangePassword';
import api from '../api';

export default function AdminDashboard() {
  const { logout } = useAuth();
  const [workers, setWorkers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const TABS = ['metrics', 'projects', 'manage'];
  const hashTab = window.location.hash.replace('#', '');
  const [tab, setTab] = useState(TABS.includes(hashTab) ? hashTab : 'metrics');

  const switchTab = t => {
    setTab(t);
    window.location.hash = t;
  };

  useEffect(() => {
    Promise.all([api.get('/admin/workers'), api.get('/admin/projects')])
      .then(([w, p]) => { setWorkers(w.data); setProjects(p.data); })
      .finally(() => setLoading(false));
  }, []);

  const handleWorkerAdded = w => setWorkers(prev => [...prev, { ...w, total_entries: 0, total_hours: 0, regular_hours: 0, overtime_hours: 0, prevailing_hours: 0 }]);
  const handleWorkerDeleted = id => setWorkers(prev => prev.filter(w => w.id !== id));
  const handleWorkerUpdated = w => setWorkers(prev => prev.map(x => x.id === w.id ? { ...x, ...w } : x));
  const handleProjectAdded = p => setProjects(prev => [...prev, p]);
  const handleProjectDeleted = id => setProjects(prev => prev.filter(p => p.id !== id));
  const handleProjectUpdated = p => setProjects(prev => prev.map(x => x.id === p.id ? p : x));

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <span style={styles.logo}>Time Crunch — Admin</span>
        <div style={styles.headerRight}>
          <button style={styles.headerBtn} onClick={() => setShowChangePassword(true)}>Change Password</button>
          <button style={styles.headerBtn} onClick={logout}>Logout</button>
        </div>
      </header>

      {showChangePassword && <ChangePassword onClose={() => setShowChangePassword(false)} />}

      <main style={styles.main}>
        <div style={styles.tabs}>
          <button style={tab === 'metrics' ? styles.tabActive : styles.tab} onClick={() => switchTab('metrics')}>Worker Reports</button>
          <button style={tab === 'projects' ? styles.tabActive : styles.tab} onClick={() => switchTab('projects')}>Project Reports</button>
          <button style={tab === 'manage' ? styles.tabActive : styles.tab} onClick={() => switchTab('manage')}>Manage</button>
        </div>

        {loading ? <p>Loading...</p> : tab === 'metrics' ? (
          <>
            <h2 style={styles.heading}>Worker Reports</h2>
            {workers.length === 0
              ? <p style={{ color: '#666' }}>No workers yet. Add one in the Manage tab.</p>
              : workers.map(w => <WorkerMetrics key={w.id} worker={w} />)
            }
          </>
        ) : tab === 'projects' ? (
          <>
            <h2 style={styles.heading}>Project Reports</h2>
            <ProjectReports />
          </>
        ) : (
          <>
            <ManageWorkers workers={workers} onWorkerAdded={handleWorkerAdded} onWorkerDeleted={handleWorkerDeleted} onWorkerUpdated={handleWorkerUpdated} />
            <ManageProjects projects={projects} onProjectAdded={handleProjectAdded} onProjectDeleted={handleProjectDeleted} onProjectUpdated={handleProjectUpdated} />
          </>
        )}
      </main>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#f4f6f9' },
  header: { background: '#1a56db', color: '#fff', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo: { fontWeight: 700, fontSize: 20 },
  headerRight: { display: 'flex', gap: 10 },
  headerBtn: { background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' },
  main: { maxWidth: 900, margin: '32px auto', padding: '0 16px' },
  tabs: { display: 'flex', gap: 4, marginBottom: 24, background: '#e8edf5', borderRadius: 10, padding: 4, width: 'fit-content' },
  tab: { padding: '8px 20px', background: 'none', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 14, color: '#666', cursor: 'pointer' },
  tabActive: { padding: '8px 20px', background: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 14, color: '#1a56db', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' },
  heading: { marginBottom: 20, fontSize: 22 },
};
