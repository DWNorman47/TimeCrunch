import React, { useState, useEffect } from 'react';
import api from '../api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export default function NotificationSetup() {
  const [state, setState] = useState('idle'); // idle | subscribed | denied | unsupported | loading
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    navigator.serviceWorker.ready.then(async reg => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) { setSubscription(sub); setState('subscribed'); }
    });
  }, []);

  const subscribe = async () => {
    setState('loading');
    try {
      const { data } = await api.get('/push/vapid-public-key');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      });
      const { endpoint, keys } = sub.toJSON();
      await api.post('/push/subscribe', { endpoint, p256dh: keys.p256dh, auth: keys.auth });
      setSubscription(sub);
      setState('subscribed');
    } catch (err) {
      if (Notification.permission === 'denied') setState('denied');
      else setState('idle');
    }
  };

  const unsubscribe = async () => {
    if (!subscription) return;
    setState('loading');
    try {
      await api.delete('/push/subscribe', { data: { endpoint: subscription.endpoint } });
      await subscription.unsubscribe();
      setSubscription(null);
      setState('idle');
    } catch {
      setState('subscribed');
    }
  };

  if (state === 'unsupported') return null;

  return (
    <div style={styles.row}>
      <div style={styles.info}>
        <span style={styles.icon}>🔔</span>
        <div>
          <div style={styles.label}>Push notifications</div>
          <div style={styles.sub}>Get notified when entries are rejected, shifts are assigned, or you receive a message.</div>
        </div>
      </div>
      {state === 'subscribed' ? (
        <button style={styles.offBtn} onClick={unsubscribe}>Turn off</button>
      ) : state === 'denied' ? (
        <span style={styles.denied}>Blocked in browser settings</span>
      ) : (
        <button style={styles.onBtn} onClick={subscribe} disabled={state === 'loading'}>
          {state === 'loading' ? 'Enabling...' : 'Enable'}
        </button>
      )}
    </div>
  );
}

const styles = {
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, background: '#fff', borderRadius: 10, padding: '14px 18px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', flexWrap: 'wrap' },
  info: { display: 'flex', alignItems: 'center', gap: 12 },
  icon: { fontSize: 22 },
  label: { fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 2 },
  sub: { fontSize: 12, color: '#6b7280', lineHeight: 1.4 },
  onBtn: { background: '#1a56db', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 },
  offBtn: { background: 'none', border: '1px solid #d1d5db', color: '#6b7280', padding: '7px 16px', borderRadius: 7, fontSize: 13, cursor: 'pointer', flexShrink: 0 },
  denied: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
};
