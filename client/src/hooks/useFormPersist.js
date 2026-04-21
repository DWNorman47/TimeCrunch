import { useEffect, useRef } from 'react';
import { reportClientError } from '../errorReporter';

/**
 * Persists form state to localStorage so it survives the browser killing
 * the page when the user switches apps (common on mobile PWAs).
 *
 * Usage:
 *   const { clearPersisted } = useFormPersist('my-form-key', form, setForm);
 *   // Call clearPersisted() on successful submit.
 *
 * Optional validator: pass `{ validate }` to scrub restored values that no
 * longer make sense (e.g. a project_id that's since been archived). The
 * validator receives the parsed object and should return a cleaned copy.
 * Keys it removes or overwrites will not hit React state.
 *
 *   useFormPersist('clock-in', form, setForm, {
 *     validate: saved => ({
 *       ...saved,
 *       selectedProject: projects.some(p => String(p.id) === saved.selectedProject)
 *         ? saved.selectedProject
 *         : '',
 *     }),
 *   });
 *
 * Quota errors (iOS Safari private mode, storage-restricted contexts) are
 * reported to Sentry once per session/key so we hear about it without
 * spamming on every keystroke.
 */
export function useFormPersist(key, form, setForm, options = {}) {
  const storageKey = `opsfloa_form_${key}`;
  const quotaReportedRef = useRef(false);
  const { validate } = options;

  // Restore on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        let parsed = JSON.parse(saved);
        if (typeof validate === 'function') {
          try {
            parsed = validate(parsed) || {};
          } catch {
            parsed = {};
          }
        }
        setForm(f => ({ ...f, ...parsed }));
      }
    } catch {
      // Corrupt JSON in localStorage — recoverable, we just ignore.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save on every change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(form));
    } catch (err) {
      // QuotaExceededError / SecurityError (Safari private mode) / disabled
      // storage. Users silently lose draft persistence. Report once per
      // session/key so it's visible without burning quota on repeat writes.
      if (!quotaReportedRef.current) {
        quotaReportedRef.current = true;
        reportClientError({
          kind: 'unhandled',
          message: `localStorage write failed (useFormPersist:${key}): ${err?.name || 'error'}`,
          stack: err?.stack,
        });
      }
    }
  }, [storageKey, form, key]);

  const clearPersisted = () => {
    try { localStorage.removeItem(storageKey); } catch {}
  };

  return { clearPersisted };
}
