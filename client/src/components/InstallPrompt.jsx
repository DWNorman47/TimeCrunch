import React, { useState, useEffect } from 'react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = e => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const install = async () => {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setDeferredPrompt(null);
    else setDismissed(true);
  };

  return (
    <div style={styles.banner}>
      <span style={styles.text}>Install Time Crunch for quick clock-in access</span>
      <button style={styles.installBtn} onClick={install}>Install</button>
      <button style={styles.dismissBtn} onClick={() => setDismissed(true)}>✕</button>
    </div>
  );
}

const styles = {
  banner: {
    position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
    background: '#1a56db', color: '#fff', borderRadius: 12, padding: '12px 18px',
    display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
    zIndex: 9999, maxWidth: 420, width: 'calc(100vw - 32px)',
  },
  text: { flex: 1, fontSize: 14, fontWeight: 500 },
  installBtn: {
    background: '#fff', color: '#1a56db', border: 'none', padding: '7px 16px',
    borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
  },
  dismissBtn: {
    background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
    width: 28, height: 28, borderRadius: '50%', fontSize: 12, cursor: 'pointer', flexShrink: 0,
  },
};
