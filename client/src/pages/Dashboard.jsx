import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import TimeEntryForm from '../components/TimeEntryForm';
import EntryList from '../components/EntryList';
import ChangePassword from '../components/ChangePassword';
import api from '../api';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [entries, setEntries] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [e, p] = await Promise.all([api.get('/time-entries'), api.get('/projects')]);
      setEntries(e.data);
      setProjects(p.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleEntryAdded = entry => setEntries(prev => [entry, ...prev]);
  const handleEntryDeleted = id => setEntries(prev => prev.filter(e => e.id !== id));

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <span style={styles.logo}>Time Crunch</span>
        <div style={styles.headerRight}>
          <span style={styles.userName}>{user.full_name}</span>
          <button style={styles.logoutBtn} onClick={() => setShowChangePassword(true)}>Change Password</button>
          <button style={styles.logoutBtn} onClick={logout}>Logout</button>
        </div>
      </header>
      {showChangePassword && <ChangePassword onClose={() => setShowChangePassword(false)} />}
      <main style={styles.main}>
        <TimeEntryForm projects={projects} onEntryAdded={handleEntryAdded} />
        {loading ? <p>Loading entries...</p> : (
          <EntryList entries={entries} onDeleted={handleEntryDeleted} />
        )}
      </main>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#f4f6f9' },
  header: { background: '#1a56db', color: '#fff', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo: { fontWeight: 700, fontSize: 20 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 16 },
  userName: { fontSize: 14 },
  logoutBtn: { background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, fontWeight: 600 },
  main: { maxWidth: 700, margin: '32px auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 24 },
};
