import React, { useState, useRef, useEffect } from 'react';

/**
 * Small ? icon that reveals a longer help blurb on hover, focus, or click.
 * Complements inline label text when a feature name isn't self-explanatory.
 *
 * Props:
 *   text     — the help content (string or ReactNode)
 *   side     — 'top' | 'bottom' | 'right' (default 'top')
 *   ariaLabel — defaults to "More info"
 */
export default function HelpTip({ text, side = 'top', ariaLabel = 'More info' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Dismiss on outside click / Escape so keyboard users aren't stuck open.
  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const sideStyle = side === 'bottom'
    ? { top: '100%', marginTop: 6 }
    : side === 'right'
      ? { left: '100%', top: 0, marginLeft: 8 }
      : { bottom: '100%', marginBottom: 6 };

  return (
    <span ref={ref} style={styles.wrap}>
      <button
        type="button"
        style={styles.btn}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open && (
        <span role="tooltip" style={{ ...styles.pop, ...sideStyle }}>
          {text}
        </span>
      )}
    </span>
  );
}

const styles = {
  wrap: {
    position: 'relative',
    display: 'inline-flex',
    marginLeft: 6,
    verticalAlign: 'middle',
  },
  btn: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    border: 'none',
    background: '#e5e7eb',
    color: '#6b7280',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pop: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 50,
    background: '#1f2937',
    color: '#fff',
    fontSize: 12,
    fontWeight: 400,
    lineHeight: 1.5,
    padding: '8px 12px',
    borderRadius: 6,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    width: 260,
    whiteSpace: 'normal',
  },
};
