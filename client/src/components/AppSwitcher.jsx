import React, { useState, useEffect, useRef } from 'react';

// Administration is admin-only; filtered at render time based on userRole
const APPS = [
  {
    id: 'timeclock',
    name: 'Time Clock',
    bg: '#1a56db',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
        <circle cx="10" cy="10" r="7.5" />
        <polyline points="10,5.5 10,10 13,12" />
      </svg>
    ),
    path: '/',
  },
  {
    id: 'field',
    name: 'Field',
    bg: '#059669',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
        <path d="M19 15a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3l2-2.5h4L14 5h3a2 2 0 0 1 2 2z" />
        <circle cx="10" cy="11" r="3" />
      </svg>
    ),
    path: '/field',
  },
  {
    id: 'projects',
    name: 'Projects',
    bg: '#7c3aed',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
        <rect x="2.5" y="2.5" width="6" height="6" rx="1" />
        <rect x="11.5" y="2.5" width="6" height="6" rx="1" />
        <rect x="2.5" y="11.5" width="6" height="6" rx="1" />
        <rect x="11.5" y="11.5" width="6" height="6" rx="1" />
      </svg>
    ),
    path: '/projects',
  },
  {
    id: 'inventory',
    name: 'Inventory',
    bg: '#d97706',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
        <polyline points="2,6 10,11 18,6" />
        <path d="M2 6l8-4 8 4v8l-8 4-8-4V6z" />
        <line x1="10" y1="11" x2="10" y2="19" />
      </svg>
    ),
    path: '/inventory',
    soon: true,
  },
  {
    id: 'administration',
    name: 'Administration',
    bg: '#64748b',
    adminOnly: true,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
        <path d="M10 2L3 5.5v4.5c0 4.2 3 7.9 7 9 4-1.1 7-4.8 7-9V5.5L10 2z" />
      </svg>
    ),
    path: '/administration',
  },
];

export default function AppSwitcher({ currentApp = 'timeclock', userRole, features = {} }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  const visibleApps = APPS.filter(a => {
    if (a.adminOnly && !isAdmin) return false;
    if (a.soon) return !isAdmin ? false : true;
    if (a.id === 'field' && features?.feature_field === false) return false;
    if (a.id === 'projects' && features?.feature_projects === false) return false;
    // Only hide Time Clock from admins when toggle is off; workers still need it for Account tab
    if (a.id === 'timeclock' && features?.feature_timeclock === false && isAdmin) return false;
    return true;
  });
  const current = APPS.find(a => a.id === currentApp) || APPS[0];

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const navigate = app => {
    setOpen(false);
    if (app.soon) return;
    // Time Clock routes differently for admin vs worker
    if (app.id === 'timeclock') {
      window.location.href = userRole === 'admin' || userRole === 'super_admin' ? '/admin' : '/dashboard';
    } else {
      window.location.href = app.path;
    }
  };

  return (
    <div ref={ref} style={styles.wrap}>
      <button style={styles.trigger} onClick={() => setOpen(o => !o)}>
        <div style={{ ...styles.appIcon, background: current.bg }}>{current.icon}</div>
        <span style={styles.appName}>{current.name}</span>
        <svg style={{ ...styles.chevron, transform: open ? 'rotate(180deg)' : 'none' }}
          viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12">
          <polyline points="2,4 6,8 10,4" />
        </svg>
      </button>

      {open && (
        <div style={styles.dropdown}>
          {visibleApps.map(app => (
            <button
              key={app.id}
              style={{
                ...styles.item,
                ...(app.id === currentApp ? styles.itemActive : {}),
                ...(app.soon ? styles.itemSoon : {}),
              }}
              onClick={() => navigate(app)}
            >
              <div style={{ ...styles.itemIcon, background: app.soon ? '#e5e7eb' : app.bg }}>
                {app.icon}
              </div>
              <span style={{ ...styles.itemName, color: app.soon ? '#9ca3af' : '#111827' }}>{app.name}</span>
              {app.soon && <span style={styles.soonBadge}>Soon</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: { position: 'relative' },
  trigger: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 20, padding: '5px 12px 5px 6px',
    color: '#fff', cursor: 'pointer', transition: 'background 0.15s',
  },
  appIcon: {
    width: 28, height: 28, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  appName: { fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' },
  chevron: { opacity: 0.8, transition: 'transform 0.2s', color: '#fff' },
  dropdown: {
    position: 'absolute', top: 'calc(100% + 8px)', left: 0,
    background: '#fff', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    padding: 6, minWidth: 200, zIndex: 1000,
  },
  item: {
    display: 'flex', alignItems: 'center', gap: 12,
    width: '100%', padding: '10px 12px', border: 'none',
    background: 'none', borderRadius: 9, cursor: 'pointer',
    textAlign: 'left', transition: 'background 0.1s',
  },
  itemActive: { background: '#f0f4ff' },
  itemSoon: { cursor: 'default' },
  itemIcon: {
    width: 36, height: 36, borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  itemName: { fontWeight: 600, fontSize: 15, color: '#111827', flex: 1 },
  soonBadge: { fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.04em' },
};
