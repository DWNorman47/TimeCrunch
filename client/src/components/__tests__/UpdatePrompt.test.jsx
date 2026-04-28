/**
 * UpdatePrompt smoke — guards two failure modes:
 *  1. Banner never shows when an update truly is available (stale forever).
 *  2. Banner shows after a manual refresh, when the bundle and the new SW
 *     are already the same version (annoying false positive).
 *
 * jsdom has no real service-worker stack, so we drive the listeners directly
 * and post fake SW_VERSION replies.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UpdatePrompt from '../UpdatePrompt';

// UpdatePrompt uses useT → useAuth; stub the context so we don't need to
// wrap every test in AuthProvider.
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { language: 'English' } }),
}));

// __APP_VERSION__ is normally injected by Vite's `define`. Vitest doesn't
// run that step, so the prompt code falls back to `null` and skips its
// version comparison entirely. Define it here so the gate exercises the
// real comparison path the prompt uses in production.
globalThis.__APP_VERSION__ = '1.0.0+test';

function setupSW({ initialController, postedVersion }) {
  const listeners = {};
  const controller = initialController
    ? {
        ...initialController,
        postMessage: vi.fn(() => {
          // Simulate the SW replying with its version. Default to a
          // different version (i.e. there really IS an update). Tests
          // that want the "same version" case override `postedVersion`.
          const version = postedVersion ?? '2.0.0+newer';
          queueMicrotask(() => listeners.message?.({ data: { type: 'SW_VERSION', version } }));
        }),
      }
    : null;

  const sw = {
    get controller() { return controller; },
    addEventListener: (evt, cb) => { listeners[evt] = cb; },
    removeEventListener: () => {},
    getRegistration: () => Promise.resolve({
      installing: null,
      addEventListener: () => {},
    }),
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    value: sw,
    configurable: true,
    writable: true,
  });
  return listeners;
}

describe('<UpdatePrompt />', () => {
  beforeEach(() => {
    // Ensure a clean slate; jsdom doesn't have real SW support.
    // eslint-disable-next-line no-proto
    delete navigator.__proto__.serviceWorker;
  });

  test('renders nothing when no update has been detected', () => {
    setupSW({ initialController: { state: 'activated' } });
    const { container } = render(<UpdatePrompt />);
    // Component mounts and listens — the banner should not render yet.
    expect(container.firstChild).toBeNull();
  });

  test('first-ever load (no controller) does not show the banner', async () => {
    const listeners = setupSW({ initialController: null });
    render(<UpdatePrompt />);
    await act(async () => { listeners.controllerchange?.(); });
    expect(screen.queryByText(/new version/i)).not.toBeInTheDocument();
  });

  test('controllerchange with a NEWER SW version shows the prompt', async () => {
    const listeners = setupSW({ initialController: { state: 'activated' } });
    render(<UpdatePrompt />);
    await act(async () => {
      listeners.controllerchange();
      await Promise.resolve(); // flush the queued microtask reply
    });
    expect(screen.getByText(/new version of OpsFloa is ready/i)).toBeInTheDocument();
    const link = screen.getByText(/what's new/i).closest('a');
    expect(link).toHaveAttribute('href', '/changelog');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });

  test('controllerchange after a refresh (same version) does NOT show the prompt', async () => {
    const listeners = setupSW({
      initialController: { state: 'activated' },
      postedVersion: '1.0.0+test', // matches the bundle version above
    });
    render(<UpdatePrompt />);
    await act(async () => {
      listeners.controllerchange();
      await Promise.resolve();
    });
    expect(screen.queryByText(/new version of OpsFloa is ready/i)).not.toBeInTheDocument();
  });

  test('dismiss button hides the banner', async () => {
    const listeners = setupSW({ initialController: { state: 'activated' } });
    render(<UpdatePrompt />);
    await act(async () => {
      listeners.controllerchange();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByLabelText(/dismiss/i));
    expect(screen.queryByText(/new version of OpsFloa is ready/i)).not.toBeInTheDocument();
  });
});
