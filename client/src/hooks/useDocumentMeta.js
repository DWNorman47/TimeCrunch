import { useEffect } from 'react';

/**
 * Set the document title + optional meta description + robots for the current
 * route. Restores whatever was there before on unmount so an SPA route change
 * leaves the HEAD clean.
 *
 * Used on public routes so search snippets and browser tabs show something
 * more specific than the index.html default. Authenticated routes pass
 * robots='noindex' to keep them out of search results if a logged-in user
 * somehow gets crawled (shouldn't happen, but belt-and-suspenders).
 */
export function useDocumentMeta({ title, description, robots } = {}) {
  useEffect(() => {
    const prevTitle = document.title;

    if (title) document.title = title;

    const descEl = description ? upsertMeta('name', 'description', description) : null;
    const robotsEl = robots ? upsertMeta('name', 'robots', robots) : null;

    return () => {
      document.title = prevTitle;
      // Only remove what we added; leave pre-existing tags alone
      if (descEl?.dataset.tcManaged) descEl.remove();
      if (robotsEl?.dataset.tcManaged) robotsEl.remove();
    };
  }, [title, description, robots]);
}

function upsertMeta(attr, name, content) {
  let el = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    el.dataset.tcManaged = 'true'; // so cleanup only removes our own inserts
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
  return el;
}
