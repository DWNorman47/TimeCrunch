/**
 * UpdatePrompt smoke — guards the "silent swallow" failure mode where the
 * banner never renders (and the user keeps running a stale bundle forever).
 * We can't easily simulate a service-worker update in jsdom, so we drive the
 * "controllerchange" path directly.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UpdatePrompt from '../UpdatePrompt';

function setupSW({ initialController }) {
  const listeners = {};
  const sw = {
    get controller() { return initialController; },
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

  test('first-ever load does not show the banner', async () => {
    // No initial controller = this is the very first page load.
    const listeners = setupSW({ initialController: null });
    render(<UpdatePrompt />);
    // Fire controllerchange anyway — it should be ignored because the user
    // wasn't previously controlled (would happen naturally on first SW boot).
    listeners.controllerchange?.();
    expect(screen.queryByText(/new version/i)).not.toBeInTheDocument();
  });

  test('controllerchange after a prior controller shows the prompt with What\'s new link', async () => {
    const listeners = setupSW({ initialController: { state: 'activated' } });
    render(<UpdatePrompt />);
    await act(async () => { listeners.controllerchange(); });
    expect(screen.getByText(/new version of OpsFloa is ready/i)).toBeInTheDocument();
    const link = screen.getByText(/what's new/i).closest('a');
    expect(link).toHaveAttribute('href', '/changelog');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });

  test('dismiss button hides the banner', async () => {
    const listeners = setupSW({ initialController: { state: 'activated' } });
    render(<UpdatePrompt />);
    await act(async () => { listeners.controllerchange(); });
    fireEvent.click(screen.getByLabelText(/dismiss/i));
    expect(screen.queryByText(/new version of OpsFloa is ready/i)).not.toBeInTheDocument();
  });
});
