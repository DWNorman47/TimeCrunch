import { useEffect } from 'react';

/**
 * Persists form state to localStorage so it survives the browser killing
 * the page when the user switches apps (common on mobile PWAs).
 *
 * Usage:
 *   const { clearPersisted } = useFormPersist('my-form-key', form, setForm);
 *   // Call clearPersisted() on successful submit.
 */
export function useFormPersist(key, form, setForm) {
  const storageKey = `opsfloa_form_${key}`;

  // Restore on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        setForm(f => ({ ...f, ...parsed }));
      }
    } catch {
      // ignore corrupt data
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save on every change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(form));
    } catch {
      // ignore quota errors
    }
  }, [storageKey, form]);

  const clearPersisted = () => {
    try { localStorage.removeItem(storageKey); } catch {}
  };

  return { clearPersisted };
}
