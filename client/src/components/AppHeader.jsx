/**
 * Single shared header used by every app page (worker + admin) so the top
 * strip is identical across modules and screen sizes.
 *
 * Mobile (≤768px, via app-switcher-name / header-username / header-right CSS):
 *   [icon-only AppSwitcher] ... [Bell] [↻] [EN] [Logout]
 *   [company name band below]
 *
 * Desktop (>768px):
 *   [icon+name AppSwitcher] [Company name] ... [Bell] [User's name] [↻] [EN] [Logout]
 *
 * Background color tracks the currentApp (derived from AppSwitcher's APPS
 * table) so module identity is preserved.
 *
 * Extras: pass `rightExtras` to render something before the refresh button
 * (e.g. the worker Dashboard's inline clock-in timer). Pass `below` to render
 * something between the top row and the mobile company-name band (e.g.
 * a trial-ending warning banner).
 */

import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../hooks/useT';
import AppSwitcher, { APPS } from './AppSwitcher';
import NotificationBell from './NotificationBell';
import { RefreshButton, LanguageSwitcher } from './HeaderActions';

export default function AppHeader({
  currentApp,
  features = {},
  userRole,
  rightExtras,
  below,
  companyBandExtras,
}) {
  const { user, logout } = useAuth();
  const t = useT();
  const app = APPS.find(a => a.id === currentApp);
  const bg = app?.bg || '#1a56db';

  return (
    <header style={{ ...s.header, background: bg }} className="app-header">
      <div style={s.headerTopRow}>
        <div style={s.logoGroup}>
          <AppSwitcher currentApp={currentApp} userRole={userRole || user?.role} features={features} />
          {user?.company_name && (
            <span style={s.companyName} className="company-name-desktop">{user.company_name}</span>
          )}
        </div>
        <div style={s.headerRight} className="header-right">
          <NotificationBell />
          {user?.full_name && (
            <span style={s.userName} className="header-username">{user.full_name}</span>
          )}
          {rightExtras}
          <RefreshButton title={t.refresh || 'Refresh'} />
          <LanguageSwitcher />
          <button style={s.headerBtn} className="header-btn" onClick={logout}>
            {t.logout}
          </button>
        </div>
      </div>
      {below}
      {user?.company_name && (
        <div className="company-name-row">
          <span className="company-name">{user.company_name}</span>
          {companyBandExtras}
        </div>
      )}
    </header>
  );
}

const s = {
  header: {
    color: '#fff',
    padding: '0 24px',
    paddingTop: 'env(safe-area-inset-top)',
    paddingBottom: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    minHeight: 'calc(56px + env(safe-area-inset-top))',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  headerTopRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    height: 56,
  },
  logoGroup: { display: 'flex', alignItems: 'center', gap: 12 },
  companyName: { fontSize: 15, fontWeight: 600, opacity: 0.9 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  userName: { fontSize: 14, opacity: 0.9, whiteSpace: 'nowrap' },
  headerBtn: {
    background: 'rgba(255,255,255,0.15)',
    color: '#fff',
    border: 'none',
    padding: '6px 14px',
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
