import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import WorkerMetrics from '../components/WorkerMetrics';
import ManageWorkers from '../components/ManageWorkers';
import ManageProjects from '../components/ManageProjects';
import ManageRates from '../components/ManageRates';
import ProjectReports from '../components/ProjectReports';
import ChangePassword from '../components/ChangePassword';
import QuickBooks from '../components/QuickBooks';
import LiveWorkers from '../components/LiveWorkers';
import AuditLog from '../components/AuditLog';
import ApprovalQueue from '../components/ApprovalQueue';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import ManagePayPeriods from '../components/ManagePayPeriods';
import ManageSchedule from '../components/ManageSchedule';
import ExportPanel from '../components/ExportPanel';
import OvertimeReport from '../components/OvertimeReport';
import BillingPanel from '../components/BillingPanel';
import { getT } from '../i18n';
import api from '../api';

export default function AdminDashboard() {
  const { logout, user } = useAuth();
  const [workers, setWorkers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [billing, setBilling] = useState(null);

  useEffect(() => {
    api.get('/stripe/status').then(r => setBilling(r.data)).catch(() => {});
  }, []);
  const TABS = ['live', 'analytics', 'approvals', 'metrics', 'projects', 'export', 'manage', 'audit', 'integrations', 'billing'];
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
          <span style={styles.logo}>Time Crunch</span>
          {user?.company_name && <span style={styles.companyName} className="company-name">{user.company_name}</span>}
        </div>
        <div style={styles.headerRight}>
          <button style={styles.headerBtn} className="header-btn" onClick={() => setShowChangePassword(true)}>Change Password</button>
          <button style={styles.headerBtn} className="header-btn" onClick={logout}>Logout</button>
        </div>
      </header>

      {showChangePassword && <ChangePassword onClose={() => setShowChangePassword(false)} t={getT('English')} />}

      {billing?.subscription_status === 'trial' && (() => {
        const days = Math.max(0, Math.ceil((new Date(billing.trial_ends_at) - new Date()) / 86400000));
        if (days > 7) return null;
        return (
          <div style={{ ...styles.trialBanner, background: days <= 2 ? '#fef2f2' : '#fffbeb', borderColor: days <= 2 ? '#fecaca' : '#fcd34d', color: days <= 2 ? '#991b1b' : '#92400e' }}>
            {days === 0 ? '⚠ Your trial has expired.' : `⏳ ${days} day${days !== 1 ? 's' : ''} left in your trial.`}
            {' '}<button style={styles.trialUpgradeBtn} onClick={() => switchTab('billing')}>Subscribe now →</button>
          </div>
        );
      })()}

      <main style={styles.main} className="admin-main">
        <div style={styles.tabs} className="tab-bar">
          <button style={tab === 'live' ? styles.tabActive : styles.tab} onClick={() => switchTab('live')}>🟢 Live</button>
          <button style={tab === 'analytics' ? styles.tabActive : styles.tab} onClick={() => switchTab('analytics')}>Analytics</button>
          <button style={tab === 'approvals' ? styles.tabActive : styles.tab} onClick={() => switchTab('approvals')}>Approvals</button>
          <button style={tab === 'metrics' ? styles.tabActive : styles.tab} onClick={() => switchTab('metrics')}>Worker Reports</button>
          <button style={tab === 'projects' ? styles.tabActive : styles.tab} onClick={() => switchTab('projects')}>Project Reports</button>
          <button style={tab === 'export' ? styles.tabActive : styles.tab} onClick={() => switchTab('export')}>Export</button>
          <button style={tab === 'manage' ? styles.tabActive : styles.tab} onClick={() => switchTab('manage')}>Manage</button>
          <button style={tab === 'audit' ? styles.tabActive : styles.tab} onClick={() => switchTab('audit')}>Audit Log</button>
          <button style={tab === 'integrations' ? styles.tabActive : styles.tab} onClick={() => switchTab('integrations')}>Integrations</button>
          <button style={tab === 'billing' ? styles.tabActive : styles.tab} onClick={() => switchTab('billing')}>💳 Billing</button>
        </div>

        {loading ? <p>Loading...</p> : tab === 'live' ? (
          <LiveWorkers />
        ) : tab === 'analytics' ? (
          <>
            <h2 style={styles.heading}>Analytics</h2>
            <AnalyticsDashboard />
          </>
        ) : tab === 'approvals' ? (
          <>
            <h2 style={styles.heading}>Entry Approvals</h2>
            <ApprovalQueue />
          </>
        ) : tab === 'metrics' ? (
          <>
            <h2 style={styles.heading}>Worker Reports</h2>
            <OvertimeReport />
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
        ) : tab === 'export' ? (
          <>
            <h2 style={styles.heading}>Export</h2>
            <ExportPanel workers={workers} projects={projects} />
          </>
        ) : tab === 'audit' ? (
          <>
            <h2 style={styles.heading}>Audit Log</h2>
            <AuditLog />
          </>
        ) : tab === 'integrations' ? (
          <>
            <h2 style={styles.heading}>Integrations</h2>
            <QuickBooks workers={workers} projects={projects} />
          </>
        ) : tab === 'billing' ? (
          <>
            <h2 style={styles.heading}>Billing</h2>
            <BillingPanel />
          </>
        ) : (
          <>
            <ManageSchedule workers={workers} projects={projects} />
            <ManageWorkers workers={workers} onWorkerAdded={handleWorkerAdded} onWorkerDeleted={handleWorkerDeleted} onWorkerUpdated={handleWorkerUpdated} onWorkerRestored={handleWorkerRestored} defaultRate={settings?.default_hourly_rate ?? 30} />
            <ManageProjects projects={projects} onProjectAdded={handleProjectAdded} onProjectDeleted={handleProjectDeleted} onProjectUpdated={handleProjectUpdated} onProjectRestored={handleProjectRestored} />
            <ManageRates settings={settings} onSettingsUpdated={setSettings} />
            <ManagePayPeriods />
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
  headerRight: { display: 'flex', gap: 10 },
  headerBtn: { background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' },
  main: { maxWidth: 900, margin: '32px auto', padding: '0 16px' },
  tabs: { display: 'flex', gap: 4, marginBottom: 24, background: '#e8edf5', borderRadius: 10, padding: 4, width: '100%', overflowX: 'auto', flexWrap: 'nowrap', scrollbarWidth: 'none' },
  tab: { padding: '8px 16px', background: 'none', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 14, color: '#666', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  tabActive: { padding: '8px 16px', background: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 14, color: '#1a56db', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', whiteSpace: 'nowrap', flexShrink: 0 },
  heading: { marginBottom: 20, fontSize: 22 },
  trialBanner: { padding: '10px 24px', border: '1px solid', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 },
  trialUpgradeBtn: { background: 'none', border: 'none', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: 14, color: 'inherit', padding: 0 },
};
