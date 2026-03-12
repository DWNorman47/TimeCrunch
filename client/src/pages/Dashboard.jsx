import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import TimeEntryForm from '../components/TimeEntryForm';
import EntryList from '../components/EntryList';
import ChangePassword from '../components/ChangePassword';
import { getT } from '../i18n';
import api from '../api';

export default function Dashboard() {
  const { user, logout, updateUser } = useAuth();
  const t = getT(user?.language);
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

  const handleLanguageChange = async lang => {
    try {
      await api.post('/auth/update-language', { language: lang });
      updateUser({ language: lang });
    } catch {
      // silently ignore
    }
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <span style={styles.logo}>Time Crunch</span>
        <div style={styles.headerRight}>
          <span style={styles.userName}>{user.full_name}</span>
          <select
            style={styles.langSelect}
            value={user?.language || 'English'}
            onChange={e => handleLanguageChange(e.target.value)}
          >
            <option value="English">🇺🇸 EN</option>
            <option value="Spanish">🇲🇽 ES</option>
          </select>
          <button style={styles.logoutBtn} onClick={() => setShowChangePassword(true)}>{t.changePassword}</button>
          <button style={styles.logoutBtn} onClick={logout}>{t.logout}</button>
        </div>
      </header>
      {showChangePassword && <ChangePassword onClose={() => setShowChangePassword(false)} t={t} />}
      <main style={styles.main}>
        <TimeEntryForm projects={projects} onEntryAdded={handleEntryAdded} t={t} />
        {loading ? <p>{t.loadingEntries}</p> : (
          <EntryList entries={entries} onDeleted={handleEntryDeleted} t={t} language={user?.language} />
        )}
      </main>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#f4f6f9' },
  header: { background: '#1a56db', color: '#fff', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo: { fontWeight: 700, fontSize: 20 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  userName: { fontSize: 14 },
  langSelect: { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '5px 8px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  logoutBtn: { background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, fontWeight: 600 },
  main: { maxWidth: 700, margin: '32px auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 24 },
};
