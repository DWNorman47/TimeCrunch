import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import WorkerMetrics from '../components/WorkerMetrics';
import ManageWorkers from '../components/ManageWorkers';
import ManageProjects from '../components/ManageProjects';
import ManageRates from '../components/ManageRates';
import ProjectReports from '../components/ProjectReports';
import QuickBooks from '../components/QuickBooks';
import LiveWorkers from '../components/LiveWorkers';
import AuditLog from '../components/AuditLog';
import ApprovalQueue from '../components/ApprovalQueue';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import ManagePayPeriods from '../components/ManagePayPeriods';
import ManageSchedule from '../components/ManageSchedule';
import ExportPanel from '../components/ExportPanel';
import OvertimeReport from '../components/OvertimeReport';
import CompanyChat from '../components/CompanyChat';
import LiveKPIs from '../components/LiveKPIs';
import AppSwitcher from '../components/AppSwitcher';
import { getT } from '../i18n';
import api from '../api';

export default function AdminDashboard() {
  const { logout, user } = useAuth();
  const [workers, setWorkers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState(null);

  useEffect(() => {
    api.get('/stripe/status').then(r => setBilling(r.data)).catch(() => {});
  }, []);
  const TABS = ['live', 'analytics', 'approvals', 'reports', 'manage', 'settings'];
  const hashTab = window.location.hash.replace('#', '');
  const [tab, setTab] = useState(TABS.includes(hashTab) ? hashTab : 'live');

  const switchTab = t => {
    setTab(t);
    window.location.hash = t;
  };

  useEffect(() => {
    Promise.all([api.get('/admin/workers'), api.get('/admin/projects'), api.get('/admin/settings')])
      .then(([w, p, s]) => { setWorkers(w.data); setProjects(p.data); setSettings(s.data); })
      .finally(() => setLoading(false));
  }, []);

  const handleWorkerAdded = w => setWorkers(prev => [...prev, { ...w, total_entries: 0, total_hours: 0, regular_hours: 0, overtime_hours: 0, prevailing_hours: 0 }]);
  const handleWorkerDeleted = id => setWorkers(prev => prev.filter(w => w.id !== id));
  const handleWorkerUpdated = w => setWorkers(prev => prev.map(x => x.id === w.id ? { ...x, ...w } : x));
  const handleWorkerRestored = w => setWorkers(prev => [...prev, w]);
  const handleProjectAdded = p => setProjects(prev => [...prev, p]);
  const handleProjectDeleted = id => setProjects(prev => prev.filter(p => p.id !== id));
  const handleProjectUpdated = p => setProjects(prev => prev.map(x => x.id === p.id ? p : x));
  const handleProjectRestored = p => setProjects(prev => [...prev, p]);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logoGroup}>
          <AppSwitcher currentApp="timeclock" userRole={user?.role} />
          {user?.company_name && <span style={styles.companyName} className="company-name">{user.company_name}</span>}
        </div>
        <div style={styles.headerRight}>
          <button style={styles.headerBtn} className="header-btn" onClick={logout}>Logout</button>
        </div>
      </header>

      {billing?.subscription_status === 'trial' && (() => {
        const days = Math.max(0, Math.ceil((new Date(billing.trial_ends_at) - new Date()) / 86400000));
        if (days > 7) return null;
        return (
          <div style={{ ...styles.trialBanner, background: days <= 2 ? '#fef2f2' : '#fffbeb', borderColor: days <= 2 ? '#fecaca' : '#fcd34d', color: days <= 2 ? '#991b1b' : '#92400e' }}>
            {days === 0 ? '⚠ Your trial has expired.' : `⏳ ${days} day${days !== 1 ? 's' : ''} left in your trial.`}
            {' '}<button style={styles.trialUpgradeBtn} onClick={() => window.location.href = '/administration#billing'}>Subscribe now →</button>
          </div>
        );
      })()}

      <main style={styles.main} className="admin-main">
        <div style={styles.tabs} className="tab-bar">
          <button style={tab === 'live' ? styles.tabActive : styles.tab} onClick={() => switchTab('live')}>🟢 Live</button>
          <button style={tab === 'analytics' ? styles.tabActive : styles.tab} onClick={() => switchTab('analytics')}>Analytics</button>
          <button style={tab === 'approvals' ? styles.tabActive : styles.tab} onClick={() => switchTab('approvals')}>Approvals</button>
          <button style={tab === 'reports' ? styles.tabActive : styles.tab} onClick={() => switchTab('reports')}>Reports</button>
          <button style={tab === 'manage' ? styles.tabActive : styles.tab} onClick={() => switchTab('manage')}>Manage</button>
          <button style={tab === 'settings' ? styles.tabActive : styles.tab} onClick={() => switchTab('settings')}>Integrations</button>
        </div>

        {loading ? <p>Loading...</p> : tab === 'live' ? (
          <>
            <LiveKPIs />
            <div style={styles.liveLayout} className="live-layout">
              <div style={styles.liveMain}><LiveWorkers /></div>
              <div style={styles.liveChat}><CompanyChat workers={workers} /></div>
            </div>
          </>
        ) : tab === 'analytics' ? (
          <>
            <h2 style={styles.heading}>Analytics</h2>
            <AnalyticsDashboard />
          </>
        ) : tab === 'approvals' ? (
          <>
            <h2 style={styles.heading}>Approvals</h2>
            <ApprovalQueue />
          </>
        ) : tab === 'reports' ? (
          <>
            <h2 style={styles.heading}>Reports</h2>
            <h3 style={styles.subheading}>Worker Reports</h3>
            {workers.length === 0
              ? <p style={{ color: '#666' }}>No workers yet. Add one in the Manage tab.</p>
              : workers.map(w => <WorkerMetrics key={w.id} worker={w} />)
            }
            <h3 style={styles.subheading}>Project Reports</h3>
            <ProjectReports />
            <h3 style={styles.subheading}>Overtime Report</h3>
            <OvertimeReport />
            <h3 style={styles.subheading}>Export</h3>
            <ExportPanel workers={workers} projects={projects} />
          </>
        ) : tab === 'manage' ? (
          <>
            <ManageSchedule workers={workers} projects={projects} />
            <ManageWorkers workers={workers} onWorkerAdded={handleWorkerAdded} onWorkerDeleted={handleWorkerDeleted} onWorkerUpdated={handleWorkerUpdated} onWorkerRestored={handleWorkerRestored} defaultRate={settings?.default_hourly_rate ?? 30} />
            <ManageProjects projects={projects} onProjectAdded={handleProjectAdded} onProjectDeleted={handleProjectDeleted} onProjectUpdated={handleProjectUpdated} onProjectRestored={handleProjectRestored} />
            <ManageRates settings={settings} onSettingsUpdated={setSettings} />
            <ManagePayPeriods />
            <h3 style={styles.subheading}>Audit Log</h3>
            <AuditLog />
          </>
        ) : (
          <>
            <h2 style={styles.heading}>Integrations</h2>
            <QuickBooks workers={workers} projects={projects} />
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
  headerRight: { display: 'flex', gap: 10 },
  headerBtn: { background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' },
  main: { maxWidth: 900, margin: '32px auto', padding: '0 16px' },
  tabs: { display: 'flex', gap: 4, marginBottom: 24, background: '#e8edf5', borderRadius: 10, padding: 4, width: '100%', overflowX: 'auto', flexWrap: 'nowrap', scrollbarWidth: 'none' },
  tab: { flex: 1, padding: '9px 0', background: 'none', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 14, color: '#666', cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'center' },
  tabActive: { flex: 1, padding: '9px 0', background: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 14, color: '#1a56db', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', whiteSpace: 'nowrap', textAlign: 'center' },
  heading: { marginBottom: 20, fontSize: 22 },
  subheading: { fontSize: 18, fontWeight: 600, margin: '32px 0 16px' },
  trialBanner: { padding: '10px 24px', border: '1px solid', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 },
  trialUpgradeBtn: { background: 'none', border: 'none', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: 14, color: 'inherit', padding: 0 },
  liveLayout: { display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' },
  liveMain: {},
  liveChat: {},
  accountCard: { background: '#fff', borderRadius: 12, padding: '14px 18px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', marginBottom: 24 },
  accountRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  accountLabel: { fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 2 },
  accountSub: { fontSize: 12, color: '#6b7280' },
  accountBtn: { background: 'none', border: '1px solid #d1d5db', color: '#374151', padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
};
