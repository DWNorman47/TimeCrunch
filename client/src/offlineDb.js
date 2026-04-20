import { openDB } from 'idb';

const DB_NAME = 'opsfloa-cache';
const DB_VERSION = 2;
const STORE = 'api-cache';
const SYNC_STORE = 'pending-syncs';

const TTL = {
  // Projects appear in worker clock-in pickers, so a stale cache blocks them
  // from seeing freshly-created projects. Keep the window short.
  projects: 5 * 60 * 1000,
  // Settings drive gating (Project Integration, modules, etc.) so stale caches
  // block workers after an admin flips a toggle. Short TTL keeps that window small.
  settings: 5 * 60 * 1000,
  shifts: 60 * 60 * 1000,
  entries: 15 * 60 * 1000,
  'my-count-assignments': 15 * 60 * 1000,
};

let _db;
async function getDb() {
  if (!_db) {
    _db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
        if (!db.objectStoreNames.contains(SYNC_STORE)) {
          db.createObjectStore(SYNC_STORE, { keyPath: 'id', autoIncrement: true });
        }
      },
    });
  }
  return _db;
}

// Pending sync queue — for offline submissions
export async function enqueuePendingSync(item) {
  try {
    const db = await getDb();
    await db.add(SYNC_STORE, { ...item, queued_at: Date.now() });
  } catch { /* ignore */ }
}

export async function getPendingSyncs() {
  try {
    const db = await getDb();
    return await db.getAll(SYNC_STORE);
  } catch { return []; }
}

export async function removePendingSync(id) {
  try {
    const db = await getDb();
    await db.delete(SYNC_STORE, id);
  } catch { /* ignore */ }
}

export async function getCached(key) {
  try {
    const db = await getDb();
    return await db.get(STORE, key);
  } catch {
    return null;
  }
}

export async function setCached(key, data) {
  try {
    const db = await getDb();
    await db.put(STORE, { data, ts: Date.now() }, key);
  } catch {
    // ignore write failures
  }
}

export function isFresh(record, key) {
  if (!record) return false;
  const ttl = TTL[key] ?? 15 * 60 * 1000;
  return Date.now() - record.ts < ttl;
}

export async function clearCache() {
  try {
    const db = await getDb();
    await db.clear(STORE);
  } catch {
    // ignore
  }
}

export async function invalidateCache(key) {
  try {
    const db = await getDb();
    await db.delete(STORE, key);
  } catch {
    // ignore
  }
}

export async function getOrFetch(key, fetchFn) {
  const cached = await getCached(key);
  if (isFresh(cached, key)) return cached.data;
  try {
    const data = await fetchFn();
    await setCached(key, data);
    return data;
  } catch {
    if (cached) return cached.data;
    throw new Error('Offline and no cached data');
  }
}
