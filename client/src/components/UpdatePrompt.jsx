/**
 * UpdatePrompt — non-blocking banner that appears when a new service-worker
 * version has activated. The SW updates itself automatically (sw.js calls
 * self.skipWaiting + self.clients.claim), but the currently-loaded JS bundle
 * in the tab is still the previous version until the page reloads. This
 * banner lets the user reload at a moment that won't nuke their work.
 */

import React, { useEffect, useState } from 'react';
import { useT } from '../hooks/useT';
import { useAuth } from '../contexts/AuthContext';

export default function UpdatePrompt() {
  const t = useT();
  const { user } = useAuth();
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;
    let reg = null;

    // Compare the controlling SW's version against the version baked into
    // the running JS bundle. They only differ when a NEW SW has activated
    // while the tab is still running OLD bundle code — which is the only
    // moment a "reload to upgrade" prompt is actually useful. After a
    // refresh the bundle is already current, so the versions match and we
    // stay silent (which is what users were complaining about).
    const checkVersion = () => {
      if (cancelled) return;
      const ctrl = navigator.serviceWorker.controller;
      if (!ctrl) return;
      ctrl.postMessage({ type: 'GET_VERSION' });
    };

    const onMessage = evt => {
      if (cancelled) return;
      if (evt.data?.type !== 'SW_VERSION') return;
      // eslint-disable-next-line no-undef
      const bundleVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null;
      if (bundleVersion && evt.data.version && evt.data.version !== bundleVersion) {
        setUpdateReady(true);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    const onControllerChange = () => checkVersion();
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    // Hook the registration path too — catches the case where the new SW
    // finishes installing but hasn't taken control yet (if skipWaiting were
    // ever disabled in the future).
    navigator.serviceWorker.getRegistration().then(r => {
      if (cancelled || !r) return;
      reg = r;
      const onUpdateFound = () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'activated') checkVersion();
        });
      };
      reg.addEventListener('updatefound', onUpdateFound);
    });

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, []);

  if (!updateReady || !user) return null;

  const reload = () => {
    try { window.location.reload(); }
    catch { /* ignore */ }
  };

  return (
    <div style={styles.banner} role="status" aria-live="polite">
      <span style={styles.message}>
        <span style={styles.dot} aria-hidden="true" />
        {t.updateReady}
      </span>
      <a href="/changelog" target="_blank" rel="noopener noreferrer" style={styles.whatsNew}>
        {t.updateWhatsNew}
      </a>
      <button type="button" style={styles.reloadBtn} onClick={reload}>
        {t.updateReload}
      </button>
      <button type="button" style={styles.dismissBtn} onClick={() => setUpdateReady(false)} aria-label={t.updateDismissAria}>
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
  whatsNew: {
    color: '#93c5fd', textDecoration: 'underline', fontSize: 13, marginRight: 2,
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
