/**
 * Client-side permission hooks. The server is authoritative on every gated
 * route — these hooks just decide what to render. They're intentionally
 * thin: the user's permission set comes from /auth/me as a flat array.
 *
 * Three exported hooks:
 *   - usePerm(key) — boolean for one specific permission
 *   - useHasAnyPerm(keys) — boolean if user holds at least one of the keys
 *   - useHasAllPerms(keys) — boolean if user holds every key
 *
 * super_admin always returns true regardless of array contents (matches
 * the server-side hasPerm short-circuit).
 */

import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

function setFromUser(user) {
  if (!user) return null;
  if (user.role === 'super_admin') return 'all';
  return new Set(user.permissions || []);
}

export function usePerm(key) {
  const { user } = useAuth();
  const set = useMemo(() => setFromUser(user), [user]);
  if (set === 'all') return true;
  if (!set) return false;
  return set.has(key);
}

export function useHasAnyPerm(keys) {
  const { user } = useAuth();
  const set = useMemo(() => setFromUser(user), [user]);
  if (set === 'all') return true;
  if (!set) return false;
  return keys.some(k => set.has(k));
}

export function useHasAllPerms(keys) {
  const { user } = useAuth();
  const set = useMemo(() => setFromUser(user), [user]);
  if (set === 'all') return true;
  if (!set) return false;
  return keys.every(k => set.has(k));
}

/**
 * Imperative version for non-React contexts (e.g., navigation helpers).
 * Pass the user object directly.
 */
export function userHasPerm(user, key) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  return (user.permissions || []).includes(key);
}

export function userHasAnyPerm(user, keys) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  const perms = user.permissions || [];
  return keys.some(k => perms.includes(k));
}
