import { openDB } from 'idb';

const DB_NAME = 'opsfloa-cache';
const DB_VERSION = 1;
const STORE = 'api-cache';

const TTL = {
  projects: 24 * 60 * 60 * 1000,
  settings: 24 * 60 * 60 * 1000,
  shifts: 60 * 60 * 1000,
  entries: 15 * 60 * 1000,
};

let _db;
async function getDb() {
  if (!_db) {
    _db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      },
    });
  }
  return _db;
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
