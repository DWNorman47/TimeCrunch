import { useEffect, useRef } from 'react';

// Elements that should be reachable via Tab while the modal is open.
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

/**
 * Hook that makes a modal accessible:
 *  • Moves focus into the modal on open and restores it on close.
 *  • Traps Tab / Shift+Tab inside the modal.
 *  • Wires Escape to onClose.
 *
 * Usage:
 *   const ref = useModalA11y(onClose);
 *   return (
 *     <div style={overlay} onClick={handleBackdrop}>
 *       <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="my-title" style={modal}>
 *         ...
 *       </div>
 *     </div>
 *   );
 *
 * The caller is responsible for adding role="dialog", aria-modal="true",
 * and an aria-labelledby (or aria-label) pointing at the modal's title.
 */
export function useModalA11y(onClose) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const previouslyFocused = document.activeElement;

    // Send focus into the modal. If no focusable child, focus the modal itself.
    const focusables = node.querySelectorAll(FOCUSABLE_SELECTOR);
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      // Make the modal itself focusable so we have somewhere to land.
      if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
      node.focus();
    }

    const onKeyDown = e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const nodes = node.querySelectorAll(FOCUSABLE_SELECTOR);
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!node.contains(active)) {
        // Focus escaped somehow — pull it back in.
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Restore focus to whatever opened the modal.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}
