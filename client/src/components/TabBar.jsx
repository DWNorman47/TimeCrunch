import React, { useState, useEffect } from 'react';

export default function TabBar({ tabs, active, onChange, breakpoint = 600 }) {
  const [narrow, setNarrow] = useState(() => window.innerWidth < breakpoint);

  useEffect(() => {
    const handler = () => setNarrow(window.innerWidth < breakpoint);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [breakpoint]);

  if (narrow) {
    const current = tabs.find(t => t.id === active);
    return (
      <div style={styles.dropdownWrap}>
        <select
          value={active}
          onChange={e => onChange(e.target.value)}
          style={styles.dropdown}
        >
          {tabs.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <span style={styles.dropdownChevron}>▾</span>
      </div>
    );
  }

  return (
    <div role="tablist" style={styles.bar}>
      {tabs.map(t => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? 'page' : undefined}
            style={isActive ? styles.tabActive : styles.tab}
            onClick={() => onChange(t.id)}
          >
            {t.dot && (
              <span style={{ ...styles.dot, background: t.dot }} aria-hidden="true" />
            )}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

const styles = {
  bar: {
    display: 'flex', gap: 4, background: '#e8edf5', borderRadius: 12,
    padding: 4, marginBottom: 24,
  },
  tab: {
    flex: 1, padding: '9px 0', background: 'none', border: 'none',
    borderRadius: 8, fontWeight: 600, fontSize: 13, color: '#6b7280',
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  tabActive: {
    flex: 1, padding: '9px 0', background: '#fff', border: 'none',
    borderRadius: 8, fontWeight: 700, fontSize: 13, color: '#111827',
    cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', whiteSpace: 'nowrap',
  },
  dropdownWrap: {
    position: 'relative', marginBottom: 24,
  },
  dropdown: {
    width: '100%', padding: '11px 40px 11px 14px',
    background: '#fff', border: '1px solid #e5e7eb',
    borderRadius: 10, fontSize: 14, fontWeight: 600,
    color: '#111827', cursor: 'pointer', appearance: 'none',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  dropdownChevron: {
    position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
    fontSize: 16, color: '#6b7280', pointerEvents: 'none',
  },
  dot: {
    display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
    marginRight: 5, flexShrink: 0,
  },
};
