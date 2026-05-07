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
import { PageIntro, PageShell } from '../components/PageShell';
import TabBar from '../components/TabBar';
import ErrorBoundary from '../components/ErrorBoundary';
import RetryBanner from '../components/RetryBanner';
import EmptyState from '../components/EmptyState';
import { silentError } from '../errorReporter';

const ManageWorkers = lazy(() => import('../components/ManageWorkers'));
const ManageRoles   = lazy(() => import('../components/ManageRoles'));

function TabLoader() {
  return <div className="ops-loading-state">Loading...</div>;
}

const ROLE_META = {
  worker:      { bg: '#e0e7ff', fg: '#3730a3' },
  admin:       { bg: '#fef3c7', fg: '#92400e' },
  super_admin: { bg: '#fee2e2', fg: '#991b1b' },
};
const roleLabel = (role, t, workerLabel = null) => ({
  worker:      workerLabel || t.workerRole,
  admin:       t.adminRole,
  super_admin: t.superAdminRole,
}[role] || role);

const workerTypeLabel = (type, t) => ({
  employee:      t.workerTypeEmployee,
  contractor:    t.workerTypeContractor,
  subcontractor: t.workerTypeSubcontractor,
  owner:         t.workerTypeOwner,
}[type] || type);

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last  = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function DirectoryView({ team, loading, search, onSearchChange, t, workerLabel }) {
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
      <div className="ops-directory-toolbar">
        <input
          type="search"
          placeholder={t.teamSearchPlaceholder}
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="ops-directory-search"
          aria-label={t.teamSearchAria}
        />
        <span className="ops-directory-count">
          {filtered.length} {filtered.length === 1 ? t.teamPersonSingular : t.teamPersonPlural}
          {lower && filtered.length !== team.length && ` ${t.teamOfWord} ${team.length}`}
        </span>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          mark="T"
          title={lower ? t.teamNoMatches : `No ${workerLabel.toLowerCase()} records yet`}
          body={lower ? 'Try a different name, username, or classification.' : `People added to this company will appear here.`}
        />
      ) : (
        <div className="ops-directory-grid">
          {filtered.map(m => {
            const role = ROLE_META[m.role] || ROLE_META.worker;
            return (
              <div key={m.id} className="ops-person-card">
                <div className="ops-avatar">{initials(m.full_name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ops-person-name">
                    {m.full_name}
                    {m.must_change_password && <span style={s.pendingPill} title={t.teamNotSignedInYet}>{t.teamPendingBadge}</span>}
                  </div>
                  <div className="ops-person-meta">
                    <span style={{ ...s.rolePill, background: role.bg, color: role.fg }}>{roleLabel(m.role, t, workerLabel)}</span>
                    {m.worker_type && m.role === 'worker' && (
                      <span style={s.typePill}>{workerTypeLabel(m.worker_type, t)}</span>
                    )}
                    {m.classification && <span style={s.classPill}>{m.classification}</span>}
                  </div>
                  <div className="ops-person-username">@{m.username}</div>
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
  const { user } = useAuth();
  const t = useT();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const TEAM_TABS = isAdmin ? ['directory', 'manage', 'roles'] : ['directory'];
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
  const workerLabel = features?.label_worker || adminSettings?.label_worker || 'Team Member';

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
    // Always fetch settings (workers + admins) so the AppSwitcher's
    // module_* filters know what the company has turned off. Without this,
    // a disabled module like Field still showed in the switcher when
    // viewed from /team because features stayed `{}`.
    getOrFetch('settings', () => api.get('/settings').then(r => r.data))
      .then(setFeatures).catch(silentError('teampage-settings'));
  }, []);

  useEffect(() => {
    if (isAdmin && teamTab === 'manage' && !adminLoaded) loadAdmin();
  }, [teamTab, isAdmin, adminLoaded, loadAdmin]);

  const handleWorkerAdded    = w  => { setAdminWorkers(prev => [...prev, { ...w, total_entries: 0, total_hours: 0, regular_hours: 0, overtime_hours: 0, prevailing_hours: 0 }]); loadTeam(); };
  const handleWorkerDeleted  = id => { setAdminWorkers(prev => prev.filter(w => w.id !== id)); loadTeam(); };
  const handleWorkerUpdated  = w  => { setAdminWorkers(prev => prev.map(x => x.id === w.id ? { ...x, ...w } : x)); loadTeam(); };
  const handleWorkerRestored = w  => { setAdminWorkers(prev => [...prev, w]); loadTeam(); };

  return (
    <PageShell currentApp="team" features={features} maxWidth={940}>
        <PageIntro
          introId="team"
          kicker="Team"
          title={isAdmin ? `Manage ${workerLabel.toLowerCase()} access without clutter.` : 'Find the people you work with.'}
          description={isAdmin
            ? 'Directory, access, roles, and permissions are separated so daily lookup stays simple and admin setup stays available.'
            : 'The directory keeps names, roles, and classifications easy to scan.'}
          meta={<span className="ops-pill">{team.length} {team.length === 1 ? 'person' : 'people'}</span>}
        />
        {isAdmin && (
          <TabBar
            active={teamTab}
            onChange={switchTab}
            tabs={[
              { id: 'directory', label: t.teamDirectoryTab },
              { id: 'manage',    label: `Manage ${workerLabel}` },
              { id: 'roles',     label: t.teamRolesTab || 'Roles' },
            ]}
          />
        )}

        <ErrorBoundary key={teamTab} mode="inline" label={teamTab === 'manage' ? `${t.teamManageTab}` : `${t.teamDirectoryTab}`}>
          {teamTab === 'directory' && (
            <DirectoryView team={team} loading={teamLoading} search={search} onSearchChange={setSearch} t={t} workerLabel={workerLabel} />
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
                    workerLabel={workerLabel}
                  />
                </Suspense>
              )}
            </>
          )}
          {teamTab === 'roles' && isAdmin && (
            <Suspense fallback={<TabLoader />}>
              <ManageRoles />
            </Suspense>
          )}
        </ErrorBoundary>
    </PageShell>
  );
}

const s = {
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
