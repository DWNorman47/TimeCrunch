/**
 * Team module — worker-facing directory with an admin-only Manage sub-tab.
 *
 * Directory: everyone-in-the-company view (name, role, classification).
 * Manage:    embedded ManageWorkers; identical to the old Administration → Team
 *            tab which is being deprecated.
 */

import React, { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../hooks/useT';
import api from '../api';
import { getOrFetch } from '../offlineDb';
import AppSwitcher from '../components/AppSwitcher';
import { RefreshButton, LanguageSwitcher } from '../components/HeaderActions';
import TabBar from '../components/TabBar';
import ErrorBoundary from '../components/ErrorBoundary';
import RetryBanner from '../components/RetryBanner';
import { silentError } from '../errorReporter';

const ManageWorkers = lazy(() => import('../components/ManageWorkers'));

function TabLoader() {
  return <div style={{ padding: '40px 0', textAlign: 'center', color: '#6b7280', fontSize: 14 }}>Loading…</div>;
}

const ROLE_LABELS = {
  worker:      { label: 'Worker',      bg: '#e0e7ff', fg: '#3730a3' },
  admin:       { label: 'Admin',       bg: '#fef3c7', fg: '#92400e' },
  super_admin: { label: 'Super Admin', bg: '#fee2e2', fg: '#991b1b' },
};

const WORKER_TYPE_LABELS = {
  employee:      'Employee',
  contractor:    'Contractor',
  subcontractor: 'Subcontractor',
  owner:         'Owner',
};

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last  = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function DirectoryView({ team, loading, search, onSearchChange }) {
  const lower = search.trim().toLowerCase();
  const filtered = lower
    ? team.filter(m =>
        (m.full_name || '').toLowerCase().includes(lower) ||
        (m.username || '').toLowerCase().includes(lower) ||
        (m.classification || '').toLowerCase().includes(lower)
      )
    : team;

  if (loading) return <TabLoader />;

  return (
    <div>
      <div style={s.searchRow}>
        <input
          type="search"
          placeholder="Search by name, username, or classification…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          style={s.search}
          aria-label="Search team directory"
        />
        <span style={s.counter}>
          {filtered.length} {filtered.length === 1 ? 'person' : 'people'}
          {lower && filtered.length !== team.length && ` of ${team.length}`}
        </span>
      </div>
      {filtered.length === 0 ? (
        <div style={s.empty}>
          {lower ? 'No matches.' : 'No team members yet.'}
        </div>
      ) : (
        <div style={s.grid}>
          {filtered.map(m => {
            const role = ROLE_LABELS[m.role] || ROLE_LABELS.worker;
            return (
              <div key={m.id} style={s.card}>
                <div style={s.avatar}>{initials(m.full_name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.name}>
                    {m.full_name}
                    {m.must_change_password && <span style={s.pendingPill} title="Hasn't signed in yet">pending</span>}
                  </div>
                  <div style={s.meta}>
                    <span style={{ ...s.rolePill, background: role.bg, color: role.fg }}>{role.label}</span>
                    {m.worker_type && m.role === 'worker' && (
                      <span style={s.typePill}>{WORKER_TYPE_LABELS[m.worker_type] || m.worker_type}</span>
                    )}
                    {m.classification && <span style={s.classPill}>{m.classification}</span>}
                  </div>
                  <div style={s.username}>@{m.username}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TeamPage() {
  const { user, logout } = useAuth();
  const t = useT();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const TEAM_TABS = isAdmin ? ['directory', 'manage'] : ['directory'];
  const hashTab = window.location.hash.replace('#', '');
  const [teamTab, setTeamTab] = useState(TEAM_TABS.includes(hashTab) ? hashTab : 'directory');
  const switchTab = t => { setTeamTab(t); history.replaceState(null, '', '#' + t); };

  const [features, setFeatures] = useState({});
  const [team, setTeam] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Admin-only state (workers, settings, QBO) — only fetched when the admin
  // actually opens the Manage sub-tab. Keeps worker page loads lean.
  const [adminWorkers, setAdminWorkers] = useState([]);
  const [adminSettings, setAdminSettings] = useState(null);
  const [adminLoaded, setAdminLoaded] = useState(false);
  const [adminLoadError, setAdminLoadError] = useState(null);

  const loadTeam = useCallback(() => {
    setTeamLoading(true);
    api.get('/team')
      .then(r => setTeam(r.data.team || []))
      .catch(silentError('teampage'))
      .finally(() => setTeamLoading(false));
  }, []);

  const loadAdmin = useCallback(async () => {
    setAdminLoadError(null);
    try {
      const [w, s, f] = await Promise.all([
        api.get('/admin/workers', { params: { all_roles: true } }),
        api.get('/admin/settings'),
        getOrFetch('settings', () => api.get('/settings').then(r => r.data)),
      ]);
      setAdminWorkers(w.data);
      setAdminSettings(s.data);
      setFeatures(f);
      setAdminLoaded(true);
    } catch (err) {
      setAdminLoadError(err?.message || 'Failed to load admin data');
    }
  }, []);

  useEffect(() => { loadTeam(); }, [loadTeam]);

  useEffect(() => {
    if (isAdmin && !features.module_team) {
      // Pull settings once so the AppSwitcher gets the right feature map.
      getOrFetch('settings', () => api.get('/settings').then(r => r.data))
        .then(setFeatures).catch(silentError('teampage-settings'));
    }
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (isAdmin && teamTab === 'manage' && !adminLoaded) loadAdmin();
  }, [teamTab, isAdmin, adminLoaded, loadAdmin]);

  const handleWorkerAdded    = w  => { setAdminWorkers(prev => [...prev, { ...w, total_entries: 0, total_hours: 0, regular_hours: 0, overtime_hours: 0, prevailing_hours: 0 }]); loadTeam(); };
  const handleWorkerDeleted  = id => { setAdminWorkers(prev => prev.filter(w => w.id !== id)); loadTeam(); };
  const handleWorkerUpdated  = w  => { setAdminWorkers(prev => prev.map(x => x.id === w.id ? { ...x, ...w } : x)); loadTeam(); };
  const handleWorkerRestored = w  => { setAdminWorkers(prev => [...prev, w]); loadTeam(); };

  return (
    <div style={s.page}>
      <header style={s.header} className="app-header">
        <div style={s.headerTopRow}>
          <div style={s.logoGroup}>
            <AppSwitcher currentApp="team" userRole={user?.role} features={features} />
            {user?.company_name && <span style={s.companyName} className="company-name-desktop">{user.company_name}</span>}
          </div>
          <div style={s.headerRight} className="header-right">
            {!isAdmin && <span style={s.userName} className="header-username">{user?.full_name}</span>}
            <RefreshButton title={t.refresh || 'Refresh'} />
            <LanguageSwitcher />
            <button style={s.headerBtn} className="header-btn" onClick={logout}>{t.logout}</button>
          </div>
        </div>
        {user?.company_name && <div className="company-name-row"><span className="company-name">{user.company_name}</span></div>}
      </header>

      <main id="main-content" style={s.main}>
        {isAdmin && (
          <TabBar
            active={teamTab}
            onChange={switchTab}
            tabs={[
              { id: 'directory', label: 'Directory' },
              { id: 'manage',    label: 'Manage' },
            ]}
          />
        )}

        <ErrorBoundary key={teamTab} mode="inline" label={teamTab === 'manage' ? 'Team · Manage' : 'Team · Directory'}>
          {teamTab === 'directory' && (
            <DirectoryView team={team} loading={teamLoading} search={search} onSearchChange={setSearch} />
          )}
          {teamTab === 'manage' && isAdmin && (
            <>
              <RetryBanner message={adminLoadError} onRetry={loadAdmin} />
              {!adminLoaded && !adminLoadError ? <TabLoader /> : (
                <Suspense fallback={<TabLoader />}>
                  <ManageWorkers
                    workers={adminWorkers}
                    onWorkerAdded={handleWorkerAdded}
                    onWorkerDeleted={handleWorkerDeleted}
                    onWorkerUpdated={handleWorkerUpdated}
                    onWorkerRestored={handleWorkerRestored}
                    defaultRate={adminSettings?.default_hourly_rate ?? 0}
                    defaultTempPassword={adminSettings?.default_temp_password ?? ''}
                    showRate={true}
                    identityEditable={true}
                    currency={adminSettings?.currency ?? 'USD'}
                    currentUser={user}
                    trackClassifications={adminSettings?.cp_track_classifications !== false}
                    trackFringes={adminSettings?.cp_track_fringes !== false}
                    collectSsn={adminSettings?.cp_collect_ssn !== false}
                  />
                </Suspense>
              )}
            </>
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}

const s = {
  page:    { minHeight: '100vh', background: '#f4f6f9' },
  header:  { background: '#0ea5e9', color: '#fff', padding: '0 24px', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 'calc(56px + env(safe-area-inset-top))', position: 'sticky', top: 0, zIndex: 100 },
  headerTopRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: 56 },
  logoGroup: { display: 'flex', alignItems: 'center', gap: 12 },
  companyName: { fontSize: 15, fontWeight: 600, opacity: 0.9 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  userName: { fontSize: 14, opacity: 0.9 },
  headerBtn: { background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  main:    { maxWidth: 860, margin: '0 auto', padding: '24px 16px' },

  searchRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  search:    { flex: 1, minWidth: 220, padding: '9px 14px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 },
  counter:   { fontSize: 13, color: '#6b7280', fontWeight: 600 },
  grid:      { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 },
  card:      { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' },
  avatar:    { width: 44, height: 44, borderRadius: '50%', background: '#e0e7ff', color: '#3730a3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, flexShrink: 0 },
  name:      { fontSize: 15, fontWeight: 700, color: '#111827', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  meta:      { display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  rolePill:  { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  typePill:  { fontSize: 11, fontWeight: 600, background: '#f3f4f6', color: '#4b5563', padding: '2px 8px', borderRadius: 10 },
  classPill: { fontSize: 11, fontWeight: 600, background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: 10 },
  username:  { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  pendingPill: { fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  empty:     { padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 14 },
};
