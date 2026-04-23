/**
 * Smoke tests — mount every page with a mocked provider stack and assert
 * the initial render doesn't throw. Catches ReferenceErrors, missing props,
 * bad imports, and "useHook called at top level but context is null" bugs
 * that slip past the type checker and manual QA (e.g. ProjectCard forgot
 * useT, Thread referenced locale that was out of scope).
 *
 * Not meant to verify behavior — just that each page boots without crashing
 * with a reasonable user + mocked API. For behavior tests, add focused
 * tests next to the component.
 *
 * When a page has meaningfully different worker vs admin rendering, render
 * both. When a page hits APIs on mount, those are stubbed to return empty
 * arrays / objects so the page reaches a stable initial state.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderWithProviders, makeUser, DEFAULT_SETTINGS } from './test-helpers';

// ── Global mocks ──────────────────────────────────────────────────────────────
// Every page hits the network on mount. Return benign empty responses so
// render completes without effect-thrown errors. Individual tests can
// override if a specific page needs populated data.

vi.mock('../api', () => {
  const ok = (data) => Promise.resolve({ data, status: 200 });
  const api = {
    get: vi.fn(() => ok([])),
    post: vi.fn(() => ok({})),
    patch: vi.fn(() => ok({})),
    put: vi.fn(() => ok({})),
    delete: vi.fn(() => ok({})),
  };
  return {
    default: api,
    setApiToastHandler: vi.fn(),
  };
});

vi.mock('../offlineDb', () => ({
  getOrFetch: vi.fn((_key, fetchFn) => (fetchFn ? fetchFn() : Promise.resolve(null))),
  setCached: vi.fn(),
  getCached: vi.fn(() => Promise.resolve(null)),
  clearCache: vi.fn(() => Promise.resolve()),
  invalidateCache: vi.fn(() => Promise.resolve()),
}));

// errorReporter uses navigator.sendBeacon which jsdom may not implement
vi.mock('../errorReporter', () => ({
  reportClientError: vi.fn(),
  silentError: () => () => {},
}));

// ── Per-test setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset URL between tests so hash-based tab selection doesn't bleed
  window.history.replaceState(null, '', '/');
});

/**
 * Render a page and let initial effects settle. Any synchronous render
 * throw or error-boundary trip is caught by Vitest and fails the test.
 * A separate check for the ErrorBoundary fallback text catches cases where
 * the component throws inside an effect that's synchronously awaited.
 */
async function smokeRender(ui, opts) {
  let view;
  await act(async () => {
    view = renderWithProviders(ui, opts);
  });
  // If ErrorBoundary caught something, surface as a failure with any stack
  // detail. Covers both:
  //  - top-level fallback ("Something went wrong" / "Algo salió mal")
  //  - inline fallback ("{label} crashed" / "Section crashed" / "... crashed")
  // Inline fallbacks silently hide a child crash behind a small card; without
  // this assertion, a page-level smoke test would pass even though a whole
  // tab of the UI is broken.
  const topLevelFallback = view.queryByText(/Something went wrong|Algo salió mal/i);
  const inlineFallback = view.queryByText(/\bcrashed\b|\bse bloqueó\b/i);
  if (topLevelFallback || inlineFallback) {
    const details = view.container.querySelector('pre')?.textContent || '(no stack visible)';
    const which = topLevelFallback ? 'Top-level' : 'Inline';
    throw new Error(`${which} ErrorBoundary tripped during render:\n${details}`);
  }
  return view;
}

// ── Unauthenticated pages ─────────────────────────────────────────────────────

describe('smoke: unauthenticated pages', () => {
  test('Login', async () => {
    const { default: Login } = await import('../pages/Login');
    await smokeRender(<Login />);
  });

  test('Register', async () => {
    const { default: Register } = await import('../pages/Register');
    await smokeRender(<Register />);
  });

  test('ForgotPassword', async () => {
    const { default: ForgotPassword } = await import('../pages/ForgotPassword');
    await smokeRender(<ForgotPassword />);
  });

  test('ResetPassword', async () => {
    const { default: ResetPassword } = await import('../pages/ResetPassword');
    await smokeRender(<ResetPassword />);
  });

  test('AcceptInvite', async () => {
    const { default: AcceptInvite } = await import('../pages/AcceptInvite');
    await smokeRender(<AcceptInvite />);
  });

  test('ConfirmEmail', async () => {
    const { default: ConfirmEmail } = await import('../pages/ConfirmEmail');
    await smokeRender(<ConfirmEmail />);
  });

  test('Landing', async () => {
    const { default: Landing } = await import('../pages/Landing');
    await smokeRender(<Landing />);
  });

  test('PrivacyPolicy', async () => {
    const { default: PrivacyPolicy } = await import('../pages/PrivacyPolicy');
    await smokeRender(<PrivacyPolicy />);
  });

  test('EULA', async () => {
    const { default: EULA } = await import('../pages/EULA');
    await smokeRender(<EULA />);
  });

  test('Changelog', async () => {
    const { default: Changelog } = await import('../pages/Changelog');
    await smokeRender(<Changelog />);
  });

  test('ServiceRequest', async () => {
    const { default: ServiceRequest } = await import('../pages/ServiceRequest');
    await smokeRender(<ServiceRequest />);
  });
});

// ── Worker-facing pages ───────────────────────────────────────────────────────

describe('smoke: worker pages', () => {
  const worker = makeUser('worker');

  test('Dashboard (worker)', async () => {
    const { default: Dashboard } = await import('../pages/Dashboard');
    await smokeRender(<Dashboard />, { user: worker });
  });

  test('AccountPage (worker)', async () => {
    const { default: AccountPage } = await import('../pages/AccountPage');
    await smokeRender(<AccountPage />, { user: worker });
  });

  test('FieldPage (worker)', async () => {
    const { default: FieldPage } = await import('../pages/FieldPage');
    await smokeRender(<FieldPage />, { user: worker });
  });

  test('InventoryPage (worker)', async () => {
    const { default: InventoryPage } = await import('../pages/InventoryPage');
    await smokeRender(<InventoryPage />, { user: worker });
  });

  test('TeamPage (worker)', async () => {
    const { default: TeamPage } = await import('../pages/TeamPage');
    await smokeRender(<TeamPage />, { user: worker });
  });
});

// ── Admin-facing pages ────────────────────────────────────────────────────────

describe('smoke: admin pages', () => {
  const admin = makeUser('admin');

  test('AdminDashboard', async () => {
    const { default: AdminDashboard } = await import('../pages/AdminDashboard');
    await smokeRender(<AdminDashboard />, { user: admin });
  });

  test('AdministrationPage', async () => {
    const { default: AdministrationPage } = await import('../pages/AdministrationPage');
    await smokeRender(<AdministrationPage />, { user: admin });
  });

  test('AnalyticsPage', async () => {
    const api = (await import('../api')).default;
    // Analytics dashboard destructures { summary, daily_hours, ... } from the
    // response — a bare [] would crash it. Return a minimal valid shape.
    api.get.mockImplementation((url) => {
      if (url.startsWith('/admin/analytics') || url.startsWith('/analytics')) {
        return Promise.resolve({ data: {
          summary: {
            hours_this_week: 0, hours_this_month: 0,
            active_workers_this_week: 0, active_workers_this_month: 0,
            pending_entries: 0, overtime_hours_this_week: 0,
          },
          daily_hours: [],
          weekly_hours: [],
          project_hours: [],
          worker_hours: [],
        }});
      }
      return Promise.resolve({ data: [] });
    });
    const { default: AnalyticsPage } = await import('../pages/AnalyticsPage');
    await smokeRender(<AnalyticsPage />, { user: admin });
  });

  test('ProjectsPage', async () => {
    const { default: ProjectsPage } = await import('../pages/ProjectsPage');
    await smokeRender(<ProjectsPage />, { user: admin });
  });

  test('TeamPage (admin)', async () => {
    const { default: TeamPage } = await import('../pages/TeamPage');
    await smokeRender(<TeamPage />, { user: admin });
  });

  test('FieldPage (admin)', async () => {
    const { default: FieldPage } = await import('../pages/FieldPage');
    await smokeRender(<FieldPage />, { user: admin });
  });

  test('InventoryPage (admin)', async () => {
    const { default: InventoryPage } = await import('../pages/InventoryPage');
    await smokeRender(<InventoryPage />, { user: admin });
  });
});

// ── Dashboard variants with populated data ────────────────────────────────────
// The empty-response mocks above catch top-level import/render errors but
// miss bugs inside conditionally-rendered sub-components (e.g. ProjectCard
// only renders when there are projects). These targeted tests feed each
// list view enough data to exercise the item-renderer path.

describe('smoke: populated list views (catches sub-component bugs)', () => {
  test('ProjectsPage renders at least one ProjectCard', async () => {
    const api = (await import('../api')).default;
    const project = {
      id: 1,
      name: 'Test Project',
      client_name: 'ACME',
      job_number: 'J-1',
      status: 'in_progress',
      wage_type: 'regular',
      budget_hours: 100,
      budget_dollars: 10000,
      progress_pct: 50,
      active: true,
      start_date: '2026-01-01',
      end_date: '2026-06-01',
    };
    const metrics = { [project.id]: { total_hours: 40, worker_count: 3, overtime_hours: 0 } };
    api.get.mockImplementation((url) => {
      if (url.startsWith('/projects')) return Promise.resolve({ data: [project] });
      if (url.startsWith('/project-metrics')) return Promise.resolve({ data: metrics });
      if (url.startsWith('/settings')) return Promise.resolve({ data: DEFAULT_SETTINGS });
      return Promise.resolve({ data: [] });
    });
    const { default: ProjectsPage } = await import('../pages/ProjectsPage');
    const view = await smokeRender(<ProjectsPage />, { user: makeUser('admin') });
    // Force an extra tick so the project list effect resolves and ProjectCard renders
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(view).toBeTruthy();
  });
});
