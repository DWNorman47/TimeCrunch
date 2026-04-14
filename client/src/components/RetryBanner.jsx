import React from 'react';
import { useT } from '../hooks/useT';

/**
 * Small inline error banner with a Retry button. Drop this in where a fetch
 * can silently fail, to give the user visibility + a way to recover.
 *
 * Props:
 *   message  — what to show. Falsy → renders nothing.
 *   onRetry  — optional retry handler. Button is hidden if not provided.
 *   style    — optional style overrides.
 *   compact  — smaller padding/font for inline/row contexts.
 */
export default function RetryBanner({ message, onRetry, style, compact }) {
  const t = useT();
  if (!message) return null;

  const base = compact ? styles.compact : styles.base;
  return (
    <div role="alert" style={{ ...base, ...(style || {}) }}>
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && (
        <button type="button" style={compact ? styles.btnCompact : styles.btn} onClick={onRetry}>
          {t.retry || 'Retry'}
        </button>
      )}
    </div>
  );
}

const styles = {
  base: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#991b1b',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    margin: '12px 0',
  },
  compact: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#991b1b',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    margin: '6px 0',
  },
  btn: {
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
  },
  btnCompact: {
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '3px 8px',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
  },
};
