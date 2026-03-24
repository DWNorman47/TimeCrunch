import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePlan } from '../hooks/usePlan';
import { useT } from '../hooks/useT';
import NotificationBell from '../components/NotificationBell';
import WorkerMetrics from '../components/WorkerMetrics';
import ProjectReports from '../components/ProjectReports';
import LiveWorkers from '../components/LiveWorkers';
import ApprovalQueue from '../components/ApprovalQueue';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import ManagePayPeriods from '../components/ManagePayPeriods';
import ManageSchedule from '../components/ManageSchedule';
import ExportPanel from '../components/ExportPanel';
import OvertimeReport from '../components/OvertimeReport';
import CertifiedPayroll from '../components/CertifiedPayroll';
import CompanyChat from '../components/CompanyChat';
import LiveKPIs from '../components/LiveKPIs';
import BroadcastMessage from '../components/BroadcastMessage';
import AppSwitcher from '../components/AppSwitcher';
import TabBar from '../components/TabBar';
import MFASetup from '../components/MFASetup';
import api from '../api';

function FeatureToggle({ name, desc, serverEnabled, onToggle }) {
  const [enabled, setEnabled] = useState(serverEnabled);
  const [saving, setSaving] = useState(false);

  // Sync if server value changes from outside (e.g. initial load)
  useEffect(() => { setEnabled(serverEnabled); }, [serverEnabled]);

  const handleClick = async () => {
    const newVal = !enabled;
    setEnabled(newVal);         // optimistic: update immediately
    setSaving(true);
    try {
      await onToggle(newVal);
    } catch {
      setEnabled(!newVal);      // revert on failure
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={ftStyles.row}>
      <div style={ftStyles.info}>
        <span style={ftStyles.label}>{name}</span>
        <span style={ftStyles.desc}>{desc}</span>
      </div>
      <button
        style={{ ...ftStyles.toggle, background: enabled ? '#1a56db' : '#d1d5db', opacity: saving ? 0.6 : 1 }}
        onClick={handleClick}
        aria-pressed={enabled}
      >
        <span style={{ ...ftStyles.knob, transform: enabled ? 'translateX(46px)' : 'translateX(0)' }} />
      </button>
    </div>
  );
}

function FeatureToggles({ settings, onSettingsUpdated }) {
  const t = useT();
  const handleToggle = async (key, newVal) => {
    const r = await api.patch('/admin/settings', { [key]: newVal });
    onSettingsUpdated(r.data);
  };

  const featureDefs = [
    { key: 'feature_scheduling',      label: t.featScheduling,    desc: t.featSchedulingDesc },
    { key: 'feature_analytics',       label: t.featAnalytics,     desc: t.featAnalyticsDesc },
    { key: 'feature_chat',            label: t.featChat,          desc: t.featChatDesc },
    { key: 'feature_prevailing_wage', label: t.featPrevailingWage, desc: t.featPrevailingWageDesc },
    { key: 'feature_field',           label: t.featField,          desc: t.featFieldDesc },
  ];

  return (
    <div style={ftStyles.card}>
      <h3 style={ftStyles.title}>{t.featuresTitle}</h3>
      <p style={ftStyles.subtitle}>{t.featuresSubtitle}</p>
      <div style={ftStyles.list}>
        {featureDefs.map(({ key, label, desc }) => (
          <FeatureToggle
            key={key}
            name={label}
            desc={desc}
            serverEnabled={settings?.[key] !== false}
            onToggle={newVal => handleToggle(key, newVal)}
          />
        ))}
      </div>
    </div>
  );
}

const ftStyles = {
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 24 },
  title: { fontSize: 17, fontWeight: 700, margin: '0 0 4px' },
  subtitle: { fontSize: 13, color: '#6b7280', margin: '0 0 12px' },
  list: { display: 'flex', flexDirection: 'column', gap: 0 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderTop: '1px solid #f3f4f6' },
  info: { display: 'flex', flexDirection: 'column', gap: 1 },
  label: { fontSize: 14, fontWeight: 600, color: '#111827' },
  desc: { fontSize: 12, color: '#9ca3af' },
  toggle: { display: 'flex', alignItems: 'center', width: 70, height: 40, borderRadius: 7, border: 'none', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0, padding: 4 },
  knob: { display: 'block', width: 16, height: 32, borderRadius: 5, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'transform 0.2s', flexShrink: 0 },
};

function UpgradePrompt({ requiredPlan, feature }) {
  const t = useT();
  const planName = requiredPlan === 'qbo' ? 'QuickBooks Online add-on' : requiredPlan === 'business' ? 'Business' : 'Starter';
  return (
    <div style={{ background: '#f9fafb', border: '2px dashed #d1d5db', borderRadius: 10, padding: '32px 24px', textAlign: 'center', marginBottom: 24 }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 6 }}>{feature} requires the {planName} plan</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>{t.upgradePlanPrompt}</div>
      <button style={{ background: '#1a56db', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        onClick={() => window.location.href = '/administration#billing'}>
        {t.viewPlans}
      </button>
    </div>
  );
}

const isPwa = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export default function AdminDashboard() {
  const { logout, user } = useAuth();
  const plan = usePlan();
  const t = useT();
  const [workers, setWorkers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [settings, setSettings] = useState(null);
  const [companyInfo, setCompanyInfo] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [billing, setBilling] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    api.get('/stripe/status').then(r => setBilling(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const fetchPending = () => {
      api.get('/admin/kpis').then(r => setPendingCount(r.data.pending_approvals ?? 0)).catch(() => {});
    };
    fetchPending();
    const interval = setInterval(fetchPending, 60000);
    return () => clearInterval(interval);
  }, []);
  // Permission helper — null admin_permissions means full access
  const canDo = key => !user?.admin_permissions || user.admin_permissions[key] === true;

  const ALL_TABS = ['live', 'analytics', 'approvals', 'reports', 'manage', 'settings'];
  const hashTab = window.location.hash.replace('#', '');
  const [tab, setTab] = useState(ALL_TABS.includes(hashTab) ? hashTab : 'live');

  const switchTab = t => {
    setTab(t);
    window.location.hash = t;
  };

  useEffect(() => {
    Promise.all([api.get('/admin/workers'), api.get('/admin/projects'), api.get('/admin/settings'), api.get('/company-info')])
      .then(([w, p, s, ci]) => { setWorkers(w.data); setProjects(p.data); setSettings(s.data); setCompanyInfo(ci.data || {}); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  const handleWorkerAdded    = w  => setWorkers(prev => [...prev, { ...w, total_entries: 0, total_hours: 0, regular_hours: 0, overtime_hours: 0, prevailing_hours: 0 }]);
  const handleWorkerDeleted  = id => setWorkers(prev => prev.filter(w => w.id !== id));
  const handleWorkerUpdated  = w  => setWorkers(prev => prev.map(x => x.id === w.id ? { ...x, ...w } : x));
  const handleWorkerRestored = w  => setWorkers(prev => [...prev, w]);
  const handleProjectAdded   = p  => setProjects(prev => [...prev, p]);
  const handleProjectDeleted = id => setProjects(prev => prev.filter(p => p.id !== id));
  const handleProjectUpdated = p  => setProjects(prev => prev.map(x => x.id === p.id ? p : x));
  const handleProjectRestored= p  => setProjects(prev => [...prev, p]);


  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logoGroup}>
          <AppSwitcher currentApp="timeclock" userRole={user?.role} features={settings} />
          {user?.company_name && <span style={styles.companyName} className="company-name">{user.company_name}</span>}
        </div>
        <div style={styles.headerRight}>
          <NotificationBell />
          {isPwa && <button style={styles.headerBtn} onClick={() => window.location.reload()}>↻</button>}
          <button style={styles.headerBtn} className="header-btn" onClick={logout}>{t.logout}</button>
        </div>
      </header>

      {billing?.subscription_status === 'trial_expired' && (
        <div style={{ ...styles.trialBanner, background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>
          ⚠ {t.trialEnded}
          {' '}<button style={styles.trialUpgradeBtn} onClick={() => window.location.href = '/administration#billing'}>{t.subscribeNow}</button>
        </div>
      )}
      {billing?.subscription_status === 'trial' && (() => {
        const days = Math.max(0, Math.ceil((new Date(billing.trial_ends_at) - new Date()) / 86400000));
        if (days > 7) return null;
        return (
          <div style={{ ...styles.trialBanner, background: days <= 2 ? '#fef2f2' : '#fffbeb', borderColor: days <= 2 ? '#fecaca' : '#fcd34d', color: days <= 2 ? '#991b1b' : '#92400e' }}>
            {`⏳ ${days} day${days !== 1 ? 's' : ''} left in your trial.`}
            {' '}<button style={styles.trialUpgradeBtn} onClick={() => window.location.href = '/administration#billing'}>{t.subscribeNow}</button>
          </div>
        );
      })()}

      <main style={styles.main} className="admin-main">
        <TabBar
          breakpoint={720}
          active={tab}
          onChange={switchTab}
          tabs={[
            { id: 'live', label: t.tabLive },
            ...(settings?.feature_analytics !== false && canDo('view_reports') ? [{ id: 'analytics', label: t.tabAnalytics }] : []),
            ...(canDo('approve_entries') ? [{ id: 'approvals', label: t.tabApprovals, dot: pendingCount > 0 ? '#f59e0b' : null }] : []),
            ...(canDo('view_reports') ? [{ id: 'reports', label: t.tabReports }] : []),
            { id: 'manage', label: t.tabManage },
            ...(canDo('manage_settings') ? [{ id: 'settings', label: t.tabSettings }] : []),
          ]}
        />

        {loading ? <p>{t.loading}</p> : loadError ? (
          <div style={styles.errorBanner}>
            <strong>{t.failedLoadDashboard}</strong> Check your connection and{' '}
            <button style={styles.retryBtn} onClick={() => window.location.reload()}>{t.tryAgain}</button>.
          </div>
        ) : tab === 'live' ? (
          <>
            <LiveKPIs />
            {plan.isBusiness ? <BroadcastMessage /> : null}
            {settings?.feature_chat !== false ? (
              <div style={styles.liveLayout} className="live-layout">
                <div style={styles.liveMain}><LiveWorkers timezone={settings?.company_timezone ?? ''} /></div>
                <div style={styles.liveChat}><CompanyChat workers={workers} /></div>
              </div>
            ) : (
              <LiveWorkers timezone={settings?.company_timezone ?? ''} />
            )}
          </>
        ) : tab === 'analytics' ? (
          <>
            <h2 style={styles.heading}>{t.tabAnalytics}</h2>
            {plan.isBusiness
              ? <AnalyticsDashboard />
              : <UpgradePrompt requiredPlan="business" feature={t.fullAnalytics} />
            }
          </>
        ) : tab === 'approvals' ? (
          <>
            <h2 style={styles.heading}>{t.tabApprovals}</h2>
            <ApprovalQueue />
          </>
        ) : tab === 'reports' ? (
          <>
            <h2 style={styles.heading}>{t.tabReports}</h2>
            <h3 style={styles.subheading}>{t.workerReports}</h3>
            {workers.length === 0
              ? <p style={{ color: '#666' }}>{t.noWorkersYet}</p>
              : workers.map(w => <WorkerMetrics key={w.id} worker={w} currency={settings?.currency ?? 'USD'} companyInfo={companyInfo} />)
            }
            <h3 style={styles.subheading}>{t.projectReports}</h3>
            <ProjectReports currency={settings?.currency ?? 'USD'} />
            <h3 style={styles.subheading}>{t.overtimeReport}</h3>
            {plan.isStarter ? <OvertimeReport currency={settings?.currency ?? 'USD'} /> : <UpgradePrompt requiredPlan="starter" feature={t.overtimeReport} />}
            <h3 style={styles.subheading}>{t.certifiedPayroll}</h3>
            {plan.hasQbo ? <CertifiedPayroll projects={projects} /> : <UpgradePrompt requiredPlan="qbo" feature={t.certifiedPayroll} />}
            <h3 style={styles.subheading}>{t.export}</h3>
            {plan.isStarter ? <ExportPanel workers={workers} projects={projects} /> : <UpgradePrompt requiredPlan="starter" feature={t.export} />}
          </>
        ) : tab === 'manage' ? (
          <>
            {settings?.feature_scheduling !== false && <ManageSchedule workers={workers} projects={projects} />}
            {canDo('approve_entries') && <ManagePayPeriods />}
          </>
        ) : (
          <>
            <h2 style={styles.heading}>{t.tabSettings}</h2>
            <FeatureToggles settings={settings} onSettingsUpdated={setSettings} />
            <MFASetup />
            <div style={styles.supportNote}>
              {t.helpText.split('info@opsfloa.com')[0]}<a href="mailto:info@opsfloa.com" style={{ color: '#1a56db' }}>info@opsfloa.com</a>
            </div>
            <p style={{ fontSize: 13, color: '#6b7280' }}>{t.qboNote.split('Administration app')[0]}<a href="/administration#integrations" style={{ color: '#1a56db' }}>Administration app</a>.</p>
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
  errorBanner: { background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 8, padding: '16px 20px', fontSize: 14 },
  retryBtn: { background: 'none', border: 'none', color: '#991b1b', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 14 },
  accountCard: { background: '#fff', borderRadius: 12, padding: '14px 18px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', marginBottom: 24 },
  accountRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  accountLabel: { fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 2 },
  accountSub: { fontSize: 12, color: '#6b7280' },
  accountBtn: { background: 'none', border: '1px solid #d1d5db', color: '#374151', padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  supportNote: { fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '8px 0 4px' },
};
