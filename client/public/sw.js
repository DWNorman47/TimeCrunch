const CACHE_NAME = 'opsfloa-v1';
const STATIC_ASSETS = ['/', '/index.html'];
const QUEUE_DB = 'tc-offline-queue';
const QUEUE_STORE = 'punches';

// ── IndexedDB helpers ──────────────────────────────────────────────────────────

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB, 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
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

// ── Clock request interception ─────────────────────────────────────────────────

async function handleClockRequest(event) {
  try {
    const response = await fetch(event.request.clone());
    return response;
  } catch {
    // Offline — queue the request
    const body = await event.request.clone().json().catch(() => ({}));
    const auth = event.request.headers.get('Authorization') || '';
    await enqueue({
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
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: 'POST',
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
    clients.forEach(c => c.postMessage({ type: 'QUEUE_REPLAYED', count: replayed }));
  }
}

// ── Service worker lifecycle ───────────────────────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
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

  // Intercept clock-in and clock-out POSTs for offline queueing
  if (event.request.method === 'POST' && (url.includes('/api/clock/in') || url.includes('/api/clock/out'))) {
    event.respondWith(handleClockRequest(event));
    return;
  }

  // Pass all other non-GET requests through
  if (event.request.method !== 'GET') return;
  if (url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
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
  if (event.tag === 'clock-queue-replay') {
    event.waitUntil(replayQueue());
  }
});
