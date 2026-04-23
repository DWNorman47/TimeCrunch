/**
 * Shared helpers for the smoke test suite.
 *
 * Provides:
 *  - renderWithProviders(ui, { user, route }) — wraps a component in the
 *    same provider stack the real app uses (Router + Auth + Toast + Offline),
 *    with fakeable auth so tests can render as worker / admin / super_admin.
 *  - makeUser(role) — small factories for common user shapes.
 *  - DEFAULT_SETTINGS — a complete settings object that satisfies every
 *    settings?.feature_* / settings?.module_* check in the app.
 *
 * The api module and offlineDb are mocked globally inside smoke.test.jsx
 * (vi.mock hoists, so can't live here).
 */

import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { ToastProvider } from '../contexts/ToastContext';
import { OfflineContext } from '../contexts/OfflineContext';

export function makeUser(role = 'worker', overrides = {}) {
  return {
    id: 1,
    full_name: 'Test User',
    username: 'test',
    email: 'test@example.com',
    language: 'English',
    role,
    company_id: 1,
    company_name: 'Test Co',
    subscription_status: 'trial',
    plan: 'starter',
    admin_permissions: null,
    worker_access_ids: null,
    ...overrides,
  };
}

const FAKE_AUTH_VALUE = {
  user: null,
  loading: false,
  login: () => Promise.resolve(null),
  loginWithToken: () => Promise.resolve(null),
  confirmMfa: () => Promise.resolve(null),
  logout: () => {},
  updateUser: () => {},
  firstLogin: false,
  clearFirstLogin: () => {},
};

const FAKE_OFFLINE_VALUE = {
  isOffline: false,
  queueCount: 0,
  sendToSW: () => {},
  onSync: () => () => {},
};

export const DEFAULT_SETTINGS = {
  module_timeclock: true,
  module_field: true,
  module_projects: true,
  module_inventory: false,
  module_analytics: true,
  module_team: true,
  feature_scheduling: true,
  feature_analytics: true,
  feature_chat: true,
  feature_prevailing_wage: true,
  feature_reimbursements: true,
  feature_pto: true,
  feature_project_integration: true,
  feature_overtime: true,
  feature_geolocation: false,
  feature_inactive_alerts: true,
  feature_overtime_alerts: true,
  feature_broadcast: true,
  feature_media_gallery: false,
  show_worker_wages: true,
  currency: 'USD',
  overtime_threshold: 8,
  overtime_rule: 'daily',
  overtime_multiplier: 1.5,
  week_start: 0,
  default_hourly_rate: 20,
  prevailing_wage_rate: 30,
  notification_use_work_hours: false,
  notification_start_hour: 6,
  notification_end_hour: 20,
  company_timezone: 'America/Los_Angeles',
};

export function renderWithProviders(ui, { user = null, route = '/' } = {}) {
  const authValue = { ...FAKE_AUTH_VALUE, user };
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthContext.Provider value={authValue}>
        <ToastProvider>
          <OfflineContext.Provider value={FAKE_OFFLINE_VALUE}>
            {ui}
          </OfflineContext.Provider>
        </ToastProvider>
      </AuthContext.Provider>
    </MemoryRouter>
  );
}
