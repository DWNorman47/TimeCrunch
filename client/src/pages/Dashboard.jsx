import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ClockInOut from '../components/ClockInOut';
import TimeEntryForm from '../components/TimeEntryForm';
import EntryList from '../components/EntryList';
import TimesheetView from '../components/TimesheetView';
import UpcomingShifts from '../components/UpcomingShifts';
import WorkerSummary from '../components/WorkerSummary';
import ChangePassword from '../components/ChangePassword';
import MFASetup from '../components/MFASetup';
import PayStubView from '../components/PayStubView';
import NotificationSetup from '../components/NotificationSetup';
import TimesheetSignOff from '../components/TimesheetSignOff';
import CompanyChat from '../components/CompanyChat';
import AppSwitcher from '../components/AppSwitcher';
import NotificationBell from '../components/NotificationBell';
import { getT } from '../i18n';
import api from '../api';

export default function Dashboard() {
  const { user, logout, updateUser } = useAuth();
  const t = getT(user?.language);
  const [entries, setEntries] = useState([]);
  const [projects, setProjects] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [tab, setTab] = useState('clock');
  const [entryView, setEntryView] = useState('list');
  const [shiftPrefill, setShiftPrefill] = useState(null);

  const handleFillFromShift = shift => {
    setShiftPrefill(shift);
    setTab('clock');
  };

  const fetchData = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [e, p, s] = await Promise.all([api.get('/time-entries'), api.get('/projects'), api.get('/settings')]);
      setEntries(e.data);
      setProjects(p.data);
      setSettings(s.data);
    } catch {
      setLoadError(true);
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

  const handleExportPDF = () => {
    const win = window.open('', '_blank');
    const company = user?.company_name || 'Time Sheet';
    const workerName = user?.full_name || '';
    const sorted = [...entries].sort((a, b) => a.work_date.localeCompare(b.work_date));
    let totalHours = 0;
    const fmtTime = t => { const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr % 12 || 12}:${m} ${hr < 12 ? 'AM' : 'PM'}`; };
    const fmtDate = d => new Date(d.substring(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const fmtH = h => { const wh = Math.floor(h); const wm = Math.round((h - wh) * 60); return wm > 0 ? `${wh}h ${wm}m` : `${wh}h`; };
    const rows = sorted.map(e => {
      let ms = new Date(`1970-01-01T${e.end_time}`) - new Date(`1970-01-01T${e.start_time}`);
      if (ms < 0) ms += 86400000;
      const h = ms / 3600000 - (e.break_minutes || 0) / 60;
      totalHours += h;
      return `<tr><td>${fmtDate(e.work_date)}</td><td>${e.project_name || ''}</td><td>${fmtTime(e.start_time)} – ${fmtTime(e.end_time)}</td><td>${e.break_minutes > 0 ? e.break_minutes + 'm' : '—'}</td><td>${fmtH(h)}</td><td>${e.wage_type === 'prevailing' ? 'Prevailing' : 'Regular'}</td><td>${e.status || 'pending'}</td></tr>`;
    }).join('');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Timesheet — ${workerName}</title><style>body{font-family:system-ui,sans-serif;margin:32px;color:#111;font-size:13px}h1{font-size:20px;margin:0 0 4px}.sub{color:#666;margin:0 0 20px}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#f3f4f6;text-align:left;padding:8px 10px;border-bottom:2px solid #e5e7eb;font-size:11px;text-transform:uppercase;letter-spacing:.5px}td{padding:7px 10px;border-bottom:1px solid #f3f4f6}.total td{font-weight:700;border-top:2px solid #e5e7eb;padding-top:10px}@media print{body{margin:16px}}</style></head><body><h1>${company} — Timesheet</h1><p class="sub">${workerName} · Exported ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p><table><thead><tr><th>Date</th><th>Project</th><th>Time</th><th>Break</th><th>Hours</th><th>Wage</th><th>Status</th></tr></thead><tbody>${rows}<tr class="total"><td colspan="4">Total</td><td>${fmtH(totalHours)}</td><td colspan="2"></td></tr></tbody></table></body></html>`);
    win.document.close();
    win.print();
  };

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
          <AppSwitcher currentApp="timeclock" userRole={user?.role} />
          {user?.company_name && <span style={styles.companyName} className="company-name">{user.company_name}</span>}
        </div>
        <div style={styles.headerRight} className="header-right">
          <NotificationBell />
          <span style={styles.userName} className="header-username">{user.full_name}</span>
          <select style={styles.langSelect} value={user?.language || 'English'} onChange={e => handleLanguageChange(e.target.value)}>
            <option value="English">EN</option>
            <option value="Spanish">ES</option>
          </select>
          <button style={styles.headerBtn} className="header-btn" onClick={logout}>{t.logout}</button>
        </div>
      </header>

      {showChangePassword && <ChangePassword onClose={() => setShowChangePassword(false)} t={t} />}

      <main style={styles.main} className="mobile-main">
        <div style={styles.tabs} className="tab-bar">
          <button style={tab === 'clock' ? styles.tabActive : styles.tab} onClick={() => setTab('clock')}>🕐 Clock</button>
          <button style={tab === 'messages' ? styles.tabActive : styles.tab} onClick={() => setTab('messages')}>💬 Messages</button>
          <button style={tab === 'timesheet' ? styles.tabActive : styles.tab} onClick={() => setTab('timesheet')}>📋 Timesheet</button>
          <button style={tab === 'account' ? styles.tabActive : styles.tab} onClick={() => setTab('account')}>👤 Account</button>
        </div>

        {tab === 'messages' && <CompanyChat />}

        {tab === 'clock' && (
          <>
            <ClockInOut projects={projects} onEntryAdded={handleEntryAdded} t={t} />
            <TimeEntryForm projects={projects} onEntryAdded={handleEntryAdded} t={t} prefill={shiftPrefill} />
          </>
        )}

        {tab === 'timesheet' && (
          <>
            <UpcomingShifts onFillEntry={handleFillFromShift} />
            {!loading && <WorkerSummary entries={entries} hourlyRate={user?.hourly_rate} overtimeMultiplier={settings?.overtime_multiplier ?? 1.5} prevailingRate={settings?.prevailing_wage_rate ?? 45} overtimeRule={settings?.overtime_rule ?? 'daily'} overtimeThreshold={settings?.overtime_threshold ?? 8} showWages={settings?.show_worker_wages ?? false} />}
            <TimesheetSignOff t={t} />
            <div style={styles.timesheetToolbar}>
              <div style={styles.viewToggle}>
                <button style={entryView === 'timesheet' ? styles.toggleActive : styles.toggleBtn} onClick={() => setEntryView('timesheet')}>{t.timesheetView}</button>
                <button style={entryView === 'list' ? styles.toggleActive : styles.toggleBtn} onClick={() => setEntryView('list')}>{t.listView}</button>
              </div>
              {!loading && entries.length > 0 && (
                <button style={styles.exportBtn} onClick={handleExportPDF}>⬇ Export PDF</button>
              )}
            </div>
            {loadError ? <p style={{ color: '#dc2626', padding: '12px' }}>{t.loadError} <button onClick={fetchData} style={{ textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>{t.retry}</button></p> : loading ? <p>{t.loadingEntries}</p> : entryView === 'timesheet' ? (
              <TimesheetView entries={entries} language={user?.language} />
            ) : (
              <EntryList entries={entries} onDeleted={handleEntryDeleted} onUpdated={handleEntryUpdated} t={t} language={user?.language} currentUserId={user?.id} />
            )}
          </>
        )}

        {tab === 'account' && (
          <>
            <NotificationSetup />
            <div style={styles.accountCard} className="mobile-card">
              <div style={styles.accountRow}>
                <div>
                  <div style={styles.accountLabel}>Password</div>
                  <div style={styles.accountSub}>Change your login password</div>
                </div>
                <button style={styles.accountBtn} onClick={() => setShowChangePassword(true)}>Change Password</button>
              </div>
            </div>
            <MFASetup />
            <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '8px 0 4px' }}>
              Need help? Email us at <a href="mailto:info@opsfloa.com" style={{ color: '#1a56db' }}>info@opsfloa.com</a>
            </div>
            {!loading && (settings?.show_worker_wages ?? false) && <PayStubView />}
          </>
        )}
      </main>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#f4f6f9' },
  header: { background: '#1a56db', color: '#fff', padding: '0 24px', paddingTop: 'env(safe-area-inset-top)', height: 'calc(56px + env(safe-area-inset-top))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoGroup: { display: 'flex', alignItems: 'center', gap: 10 },
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
  timesheetToolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  viewToggle: { display: 'flex', gap: 4, background: '#e8edf5', borderRadius: 8, padding: 3, width: 'fit-content' },
  exportBtn: { background: 'none', border: '1px solid #d1d5db', color: '#374151', padding: '6px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  toggleBtn: { padding: '6px 14px', background: 'none', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, color: '#666', cursor: 'pointer' },
  toggleActive: { padding: '6px 14px', background: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, color: '#1a56db', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  accountCard: { background: '#fff', borderRadius: 12, padding: '14px 18px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' },
  accountRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  accountLabel: { fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 2 },
  accountSub: { fontSize: 12, color: '#6b7280' },
  accountBtn: { background: 'none', border: '1px solid #d1d5db', color: '#374151', padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
};
