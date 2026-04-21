/**
 * UpdatePrompt — non-blocking banner that appears when a new service-worker
 * version has activated. The SW updates itself automatically (sw.js calls
 * self.skipWaiting + self.clients.claim), but the currently-loaded JS bundle
 * in the tab is still the previous version until the page reloads. This
 * banner lets the user reload at a moment that won't nuke their work.
 */

import React, { useEffect, useState } from 'react';

export default function UpdatePrompt() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;
    let reg = null;

    const markReady = () => { if (!cancelled) setUpdateReady(true); };

    // Track the currently-controlling SW so we can ignore the first-ever
    // controllerchange (which fires on initial page load, not on an update).
    const initialController = navigator.serviceWorker.controller;

    const onControllerChange = () => {
      if (initialController) markReady();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    // Also hook the registration path — catches the case where the new SW
    // finishes installing but hasn't taken control yet (if skipWaiting were
    // ever disabled in the future).
    navigator.serviceWorker.getRegistration().then(r => {
      if (cancelled || !r) return;
      reg = r;
      const onUpdateFound = () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'activated' && initialController) markReady();
        });
      };
      reg.addEventListener('updatefound', onUpdateFound);
    });

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  if (!updateReady) return null;

  const reload = () => {
    try { window.location.reload(); }
    catch { /* ignore */ }
  };

  return (
    <div style={styles.banner} role="status" aria-live="polite">
      <span style={styles.message}>
        <span style={styles.dot} aria-hidden="true" />
        A new version of OpsFloa is ready.
      </span>
      <button type="button" style={styles.reloadBtn} onClick={reload}>
        Reload
      </button>
      <button type="button" style={styles.dismissBtn} onClick={() => setUpdateReady(false)} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

const styles = {
  banner: {
    position: 'fixed',
    bottom: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: '#1f2937',
    color: '#fff',
    padding: '10px 14px',
    borderRadius: 10,
    boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
    fontSize: 14,
    zIndex: 2000,
    maxWidth: 'calc(100vw - 32px)',
  },
  message: { display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 500 },
  dot: {
    width: 8, height: 8, borderRadius: '50%',
    background: '#22c55e', display: 'inline-block',
  },
  reloadBtn: {
    background: '#2563eb', color: '#fff', border: 'none',
    padding: '6px 14px', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },
  dismissBtn: {
    background: 'transparent', color: '#9ca3af', border: 'none',
    fontSize: 16, cursor: 'pointer', padding: '4px 6px',
  },
};
