/**
 * Single source of truth for client-side API caching behavior.
 *
 * Every key cached via offlineDb.getOrFetch MUST have an entry here, and every
 * write endpoint that can stale a cached collection should be listed under
 * `invalidatedBy` with a URL regex. The axios interceptor in api.js reads this
 * registry on every successful write to decide what to purge.
 *
 * If you add a new cached endpoint, add its key here with:
 *   - `ttl`:           how long a cached entry is considered fresh
 *   - `invalidatedBy`: URL patterns that should wipe this cache when written
 *
 * Adding an entry to getOrFetch without a matching entry here will fall back
 * to a 15-minute default TTL, which is usually wrong — prefer declaring it.
 */

// Shorthand TTL constants so entries read like durations, not math.
const SECONDS = 1000;
const MINUTES = 60 * SECONDS;
const HOURS   = 60 * MINUTES;

export const CACHE_REGISTRY = {
  // Projects show up in worker clock-in pickers and admin project lists.
  // A stale list blocks workers from seeing new projects — keep TTL short.
  projects: {
    ttl: 5 * MINUTES,
    invalidatedBy: [
      /\/admin\/projects(\/|\?|$)/,
    ],
  },

  // Settings drive feature gating (Project Integration, module toggles).
  // Staleness here means admin toggles don't propagate to workers.
  settings: {
    ttl: 5 * MINUTES,
    invalidatedBy: [
      /\/admin\/settings/,
    ],
  },

  // Schedule/shifts data — changes less often than projects, but still worth
  // invalidating when an admin edits the schedule.
  shifts: {
    ttl: 1 * HOURS,
    invalidatedBy: [
      /\/admin\/shifts/,
      /\/shifts/,
    ],
  },

  // Worker's own time entries — invalidated when the worker submits one or
  // an admin edits an entry.
  entries: {
    ttl: 15 * MINUTES,
    invalidatedBy: [
      /\/time-entries/,
      /\/clock\/(in|out)/,
      /\/admin\/entries/,
    ],
  },

  // Cycle count assignments a worker is responsible for.
  'my-count-assignments': {
    ttl: 15 * MINUTES,
    invalidatedBy: [
      /\/inventory\/cycle-counts/,
    ],
  },
};

// Fallback TTL for any key not in the registry. Kept intentionally short so an
// undeclared cache entry degrades gracefully instead of pinning stale data.
export const DEFAULT_TTL = 15 * MINUTES;

export function ttlFor(key) {
  return CACHE_REGISTRY[key]?.ttl ?? DEFAULT_TTL;
}

// Given a just-written URL, return the list of cache keys that should be
// invalidated. Used by the axios response interceptor.
export function keysInvalidatedByUrl(url) {
  const out = [];
  for (const [key, cfg] of Object.entries(CACHE_REGISTRY)) {
    if (cfg.invalidatedBy?.some(re => re.test(url))) out.push(key);
  }
  return out;
}
