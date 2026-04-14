import React from 'react';
import { useModalA11y } from '../hooks/useModalA11y';

/**
 * Thin wrapper for the inner panel of a modal overlay. Handles dialog
 * semantics (role, aria-modal, aria-labelledby), focus trap, focus
 * restoration, and Escape — so call sites can keep their own overlay
 * wrapping + custom styles without reimplementing a11y.
 *
 * Usage:
 *   {open && (
 *     <div style={styles.overlay} onClick={handleBackdrop}>
 *       <ModalShell onClose={handleClose} titleId="foo-title" style={styles.modal}>
 *         <h3 id="foo-title">Title</h3>
 *         ...
 *       </ModalShell>
 *     </div>
 *   )}
 *
 * `titleId` should match the id of the heading inside. If there is no
 * heading, pass an `ariaLabel` instead.
 */
export default function ModalShell({ onClose, titleId, ariaLabel, style, children, ...rest }) {
  const ref = useModalA11y(onClose);
  const labelProps = titleId
    ? { 'aria-labelledby': titleId }
    : ariaLabel
      ? { 'aria-label': ariaLabel }
      : {};
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      style={style}
      {...labelProps}
      {...rest}
    >
      {children}
    </div>
  );
}
