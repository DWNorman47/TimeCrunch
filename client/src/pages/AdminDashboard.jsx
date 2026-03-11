import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import WorkerMetrics from '../components/WorkerMetrics';
import ChangePassword from '../components/ChangePassword';
import api from '../api';

export default function AdminDashboard() {
  const { logout } = useAuth();
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showChangePassword, setShowChangePassword] = useState(false);

  useEffect(() => {
    api.get('/admin/workers')
      .then(r => setWorkers(r.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <span style={styles.logo}>Time Crunch — Admin</span>
        <button style={styles.logoutBtn} onClick={() => setShowChangePassword(true)}>Change Password</button>
        <button style={styles.logoutBtn} onClick={logout}>Logout</button>
      </header>
      {showChangePassword && <ChangePassword onClose={() => setShowChangePassword(false)} />}
      <main style={styles.main}>
        <h2 style={styles.heading}>Workers</h2>
        {loading ? <p>Loading...</p> : (
          workers.length === 0
            ? <p style={{ color: '#666' }}>No workers yet.</p>
            : workers.map(w => <WorkerMetrics key={w.id} worker={w} />)
        )}
      </main>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#f4f6f9' },
  header: { background: '#1a56db', color: '#fff', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo: { fontWeight: 700, fontSize: 20 },
  logoutBtn: { background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, fontWeight: 600 },
  main: { maxWidth: 900, margin: '32px auto', padding: '0 16px' },
  heading: { marginBottom: 20, fontSize: 22 },
};
