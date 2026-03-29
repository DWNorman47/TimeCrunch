import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

// Injected by vite-plugin-pwa at build time
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

const QUEUE_DB = 'tc-offline-queue';
const QUEUE_STORE = 'punches';

// ── IndexedDB helpers ──────────────────────────────────────────────────────────

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB, 2);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueue(entry) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const req = tx.objectStore(QUEUE_STORE).add(entry);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllQueued() {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dequeue(id) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getQueueCount() {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const req = tx.objectStore(QUEUE_STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function broadcastQueueCount() {
  const count = await getQueueCount();
  const clients = await self.clients.matchAll();
  clients.forEach(c => c.postMessage({ type: 'QUEUE_COUNT', count }));
}

// ── Offline request handler (clock, time entries, field modules) ───────────────

async function handleOfflineableRequest(event, type) {
  try {
    const response = await fetch(event.request.clone());
    return response;
  } catch {
    const body = await event.request.clone().json().catch(() => ({}));
    const auth = event.request.headers.get('Authorization') || '';
    await enqueue({
      type,
      method: event.request.method,
      url: event.request.url,
      body,
      auth,
      queued_at: new Date().toISOString(),
    });
    await broadcastQueueCount();
    return new Response(
      JSON.stringify({ queued: true, offline: true }),
      { status: 202, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ── Replay queue ───────────────────────────────────────────────────────────────

async function replayQueue() {
  const items = await getAllQueued();
  let replayed = 0;
  let authFailed = false;
  let partialFailure = false;
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: item.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(item.auth ? { Authorization: item.auth } : {}),
        },
        body: JSON.stringify(item.body),
      });
      if (res.status === 401) {
        authFailed = true;
        continue;
      }
      if (res.ok || res.status === 409) {
        await dequeue(item.id);
        replayed++;
      } else {
        // 400/403 — bad request, remove from queue to avoid loop
        await dequeue(item.id);
        partialFailure = true;
      }
    } catch {
      // Still offline — leave in queue
    }
  }
  await broadcastQueueCount();
  const clients = await self.clients.matchAll();
  if (authFailed) {
    clients.forEach(c => c.postMessage({ type: 'REPLAY_AUTH_FAILED' }));
  } else {
    if (partialFailure) {
      clients.forEach(c => c.postMessage({ type: 'REPLAY_PARTIAL_FAILURE' }));
    }
    clients.forEach(c => c.postMessage({ type: 'QUEUE_REPLAYED', count: replayed }));
  }
}

// ── Service worker lifecycle ───────────────────────────────────────────────────

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// ── Push notifications ─────────────────────────────────────────────────────────

self.addEventListener('push', event => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'OpsFloa', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const c of list) {
        if (c.url && 'focus' in c) return c.focus();
      }
      return clients.openWindow(event.notification.data?.url || '/');
    })
  );
});

// ── Fetch handler ──────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const url = event.request.url;

  if (event.request.method === 'PATCH') {
    if (url.includes('/api/time-entries/') && !url.includes('/messages') && !url.includes('/sign-off')) {
      event.respondWith(handleOfflineableRequest(event, 'time-entry'));
      return;
    }
  }

  if (event.request.method === 'POST') {
    if (url.includes('/api/clock/in') || url.includes('/api/clock/out')) {
      event.respondWith(handleOfflineableRequest(event, 'clock'));
      return;
    }
    if (url.includes('/api/time-entries') && !url.includes('/messages') && !url.includes('/sign-off')) {
      event.respondWith(handleOfflineableRequest(event, 'time-entry'));
      return;
    }
    if (
      url.includes('/api/field-reports') ||
      url.includes('/api/daily-reports') ||
      url.includes('/api/punchlist') ||
      url.includes('/api/incidents') ||
      url.includes('/api/safety-talks') ||
      url.includes('/api/equipment') ||
      url.includes('/api/rfis') ||
      url.includes('/api/sub-reports') ||
      url.includes('/api/inspections')
    ) {
      event.respondWith(handleOfflineableRequest(event, 'field'));
      return;
    }
  }
});

// ── Message handler (page → SW) ────────────────────────────────────────────────

self.addEventListener('message', event => {
  if (event.data?.type === 'REPLAY_QUEUE') {
    event.waitUntil(replayQueue());
  }
  if (event.data?.type === 'GET_QUEUE_COUNT') {
    event.waitUntil(broadcastQueueCount());
  }
});

// ── Background Sync (Chrome/Edge) ──────────────────────────────────────────────

self.addEventListener('sync', event => {
  if (event.tag === 'clock-queue-replay' || event.tag === 'field-queue-replay') {
    event.waitUntil(replayQueue());
  }
});
