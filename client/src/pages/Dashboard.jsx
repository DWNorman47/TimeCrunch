import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ClockInOut from '../components/ClockInOut';
import TimeEntryForm from '../components/TimeEntryForm';
import EntryList from '../components/EntryList';
import TimesheetView from '../components/TimesheetView';
import UpcomingShifts from '../components/UpcomingShifts';
import WorkerSummary from '../components/WorkerSummary';
import ChangePassword from '../components/ChangePassword';
import PayStubView from '../components/PayStubView';
import NotificationSetup from '../components/NotificationSetup';
import TimesheetSignOff from '../components/TimesheetSignOff';
import { getT } from '../i18n';
import api from '../api';

export default function Dashboard() {
  const { user, logout, updateUser } = useAuth();
  const t = getT(user?.language);
  const [entries, setEntries] = useState([]);
  const [projects, setProjects] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [tab, setTab] = useState('clock');
  const [entryView, setEntryView] = useState('timesheet');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [e, p, s] = await Promise.all([api.get('/time-entries'), api.get('/projects'), api.get('/settings')]);
      setEntries(e.data);
      setProjects(p.data);
      setSettings(s.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleEntryAdded = entry => {
    setEntries(prev => [entry, ...prev]);
    setTab('timesheet');
  };
  const handleEntryDeleted = id => setEntries(prev => prev.filter(e => e.id !== id));
  const handleEntryUpdated = entry => setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, ...entry } : e));

  const handleLanguageChange = async lang => {
    try {
      await api.post('/auth/update-language', { language: lang });
      updateUser({ language: lang });
    } catch {}
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logoGroup}>
          <span style={styles.logo}>Time Crunch</span>
          {user?.company_name && <span style={styles.companyName} className="company-name">{user.company_name}</span>}
        </div>
        <div style={styles.headerRight} className="header-right">
          <span style={styles.userName} className="header-username">{user.full_name}</span>
          <select style={styles.langSelect} value={user?.language || 'English'} onChange={e => handleLanguageChange(e.target.value)}>
            <option value="English">EN</option>
            <option value="Spanish">ES</option>
          </select>
          <button style={styles.headerBtn} className="header-btn" onClick={() => setShowChangePassword(true)}>{t.changePassword}</button>
          <button style={styles.headerBtn} className="header-btn" onClick={logout}>{t.logout}</button>
        </div>
      </header>

      {showChangePassword && <ChangePassword onClose={() => setShowChangePassword(false)} t={t} />}

      <main style={styles.main} className="mobile-main">
        <div style={styles.tabs} className="tab-bar">
          <button style={tab === 'clock' ? styles.tabActive : styles.tab} onClick={() => setTab('clock')}>🕐 Clock</button>
          <button style={tab === 'timesheet' ? styles.tabActive : styles.tab} onClick={() => setTab('timesheet')}>📋 Timesheet</button>
          <button style={tab === 'account' ? styles.tabActive : styles.tab} onClick={() => setTab('account')}>👤 Account</button>
        </div>

        {tab === 'clock' && (
          <>
            <ClockInOut projects={projects} onEntryAdded={handleEntryAdded} t={t} />
            <TimeEntryForm projects={projects} onEntryAdded={handleEntryAdded} t={t} />
          </>
        )}

        {tab === 'timesheet' && (
          <>
            <UpcomingShifts />
            {!loading && <WorkerSummary entries={entries} hourlyRate={user?.hourly_rate} overtimeMultiplier={settings?.overtime_multiplier ?? 1.5} prevailingRate={settings?.prevailing_wage_rate ?? 45} overtimeRule={settings?.overtime_rule ?? 'daily'} overtimeThreshold={settings?.overtime_threshold ?? 8} />}
            <TimesheetSignOff t={t} />
            <div style={styles.viewToggle}>
              <button style={entryView === 'timesheet' ? styles.toggleActive : styles.toggleBtn} onClick={() => setEntryView('timesheet')}>{t.timesheetView}</button>
              <button style={entryView === 'list' ? styles.toggleActive : styles.toggleBtn} onClick={() => setEntryView('list')}>{t.listView}</button>
            </div>
            {loading ? <p>{t.loadingEntries}</p> : entryView === 'timesheet' ? (
              <TimesheetView entries={entries} language={user?.language} />
            ) : (
              <EntryList entries={entries} onDeleted={handleEntryDeleted} onUpdated={handleEntryUpdated} t={t} language={user?.language} currentUserId={user?.id} />
            )}
          </>
        )}

        {tab === 'account' && (
          <>
            <NotificationSetup />
            {!loading && <PayStubView />}
          </>
        )}
      </main>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#f4f6f9' },
  header: { background: '#1a56db', color: '#fff', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoGroup: { display: 'flex', alignItems: 'baseline', gap: 10 },
  logo: { fontWeight: 700, fontSize: 20 },
  companyName: { fontSize: 14, fontWeight: 400, opacity: 0.75 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  userName: { fontSize: 14 },
  langSelect: { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '5px 8px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  headerBtn: { background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, fontWeight: 600 },
  main: { maxWidth: 700, margin: '24px auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 20 },
  tabs: { display: 'flex', gap: 4, background: '#e8edf5', borderRadius: 10, padding: 4, width: '100%' },
  tab: { flex: 1, padding: '9px 0', background: 'none', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 14, color: '#666', cursor: 'pointer', textAlign: 'center' },
  tabActive: { flex: 1, padding: '9px 0', background: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 14, color: '#1a56db', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', textAlign: 'center' },
  viewToggle: { display: 'flex', gap: 4, background: '#e8edf5', borderRadius: 8, padding: 3, width: 'fit-content' },
  toggleBtn: { padding: '6px 14px', background: 'none', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, color: '#666', cursor: 'pointer' },
  toggleActive: { padding: '6px 14px', background: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, color: '#1a56db', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
};
