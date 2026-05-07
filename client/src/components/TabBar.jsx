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
      <div className={`ops-tab-select-wrap ${current?.dot ? 'has-dot' : ''}`.trim()}>
        {current?.dot && <span className="ops-tab-select-dot" style={{ '--tab-dot': current.dot }} aria-hidden="true" />}
        <select
          value={active}
          onChange={e => onChange(e.target.value)}
          className="ops-tab-select"
          aria-label="Choose section"
        >
          {tabs.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <span className="ops-tab-select-chevron" aria-hidden="true">v</span>
      </div>
    );
  }

  return (
    <div role="tablist" className="ops-tabbar">
      {tabs.map(t => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? 'page' : undefined}
            className={`ops-tab ${isActive ? 'is-active' : ''}`.trim()}
            onClick={() => onChange(t.id)}
          >
            {t.dot && (
              <span className="ops-tab-dot" style={{ '--tab-dot': t.dot }} aria-hidden="true" />
            )}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
