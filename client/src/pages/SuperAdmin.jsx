import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';

function formatDate(str) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SuperAdmin() {
  const { logout, user } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [companyUsers, setCompanyUsers] = useState({});

  useEffect(() => {
    api.get('/superadmin/companies')
      .then(r => setCompanies(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleActive = async (company) => {
    setWorking(company.id);
    try {
      const r = await api.patch(`/superadmin/companies/${company.id}`, { active: !company.active });
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, ...r.data } : c));
    } finally { setWorking(null); }
  };

  const toggleExpand = async (id) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!companyUsers[id]) {
      try {
        const r = await api.get(`/superadmin/companies/${id}/users`);
        setCompanyUsers(prev => ({ ...prev, [id]: r.data }));
      } catch {}
    }
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logoGroup}>
          <span style={styles.logo}>Time Crunch</span>
          <span style={styles.superBadge}>Super Admin</span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.userName}>{user?.full_name}</span>
          <button style={styles.headerBtn} onClick={logout}>Logout</button>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.titleRow}>
          <h2 style={styles.title}>Companies</h2>
          <span style={styles.count}>{companies.length} total</span>
        </div>

        {loading ? (
          <p style={{ color: '#888' }}>Loading...</p>
        ) : companies.length === 0 ? (
          <p style={{ color: '#888' }}>No companies yet.</p>
        ) : (
          <div style={styles.list}>
            {companies.map(c => (
              <div key={c.id} style={{ ...styles.card, opacity: c.active ? 1 : 0.6 }}>
                <div style={styles.cardTop}>
                  <div style={styles.cardLeft}>
                    <div style={styles.companyName}>
                      {c.name}
                      {!c.active && <span style={styles.inactiveTag}>Deactivated</span>}
                    </div>
                    <div style={styles.meta}>
                      <span>slug: <code style={styles.slug}>{c.slug}</code></span>
                      <span style={styles.sep}>·</span>
                      <span>Joined {formatDate(c.created_at)}</span>
                    </div>
                    <div style={styles.stats}>
                      <span style={styles.stat}><strong>{c.worker_count}</strong> workers</span>
                      <span style={styles.stat}><strong>{c.admin_count}</strong> admins</span>
                      <span style={styles.stat}><strong>{c.entry_count}</strong> entries</span>
                      {c.last_entry_at && (
                        <span style={styles.stat}>Last entry: {formatDate(c.last_entry_at)}</span>
                      )}
                    </div>
                  </div>
                  <div style={styles.cardActions}>
                    <button style={styles.expandBtn} onClick={() => toggleExpand(c.id)}>
                      {expandedId === c.id ? 'Hide users' : 'View users'}
                    </button>
                    <button
                      style={c.active ? styles.deactivateBtn : styles.activateBtn}
                      onClick={() => toggleActive(c)}
                      disabled={working === c.id}
                    >
                      {working === c.id ? '...' : c.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>

                {expandedId === c.id && (
                  <div style={styles.userTable}>
                    {!companyUsers[c.id] ? (
                      <p style={{ color: '#888', fontSize: 13 }}>Loading...</p>
                    ) : companyUsers[c.id].length === 0 ? (
                      <p style={{ color: '#888', fontSize: 13 }}>No users.</p>
                    ) : (
                      <table style={styles.table}>
                        <thead>
                          <tr>
                            <th style={styles.th}>Name</th>
                            <th style={styles.th}>Username</th>
                            <th style={styles.th}>Email</th>
                            <th style={styles.th}>Role</th>
                            <th style={styles.th}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {companyUsers[c.id].map(u => (
                            <tr key={u.id}>
                              <td style={styles.td}>{u.full_name}</td>
                              <td style={styles.td}><code>{u.username}</code></td>
                              <td style={styles.td}>{u.email || '—'}</td>
                              <td style={styles.td}>
                                <span style={{ ...styles.roleTag, background: u.role === 'admin' ? '#dbeafe' : '#f3f4f6', color: u.role === 'admin' ? '#1e40af' : '#374151' }}>
                                  {u.role}
                                </span>
                              </td>
                              <td style={styles.td}>
                                <span style={{ color: u.active ? '#059669' : '#9ca3af', fontSize: 12 }}>
                                  {u.active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#f4f6f9' },
  header: { background: '#111827', color: '#fff', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoGroup: { display: 'flex', alignItems: 'center', gap: 10 },
  logo: { fontWeight: 700, fontSize: 20 },
  superBadge: { background: '#7c3aed', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, letterSpacing: '0.05em' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  userName: { fontSize: 14, opacity: 0.8 },
  headerBtn: { background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' },
  main: { maxWidth: 960, margin: '32px auto', padding: '0 16px' },
  titleRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  count: { fontSize: 14, color: '#6b7280', background: '#e5e7eb', padding: '2px 10px', borderRadius: 20 },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: { background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', transition: 'opacity 0.2s' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' },
  cardLeft: { flex: 1 },
  companyName: { fontWeight: 700, fontSize: 17, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 },
  inactiveTag: { background: '#fee2e2', color: '#dc2626', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 },
  meta: { fontSize: 13, color: '#9ca3af', display: 'flex', gap: 6, marginBottom: 8 },
  slug: { fontFamily: 'monospace', background: '#f3f4f6', padding: '1px 4px', borderRadius: 4, fontSize: 12 },
  sep: { color: '#d1d5db' },
  stats: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  stat: { fontSize: 13, color: '#555' },
  cardActions: { display: 'flex', gap: 8, alignItems: 'flex-start' },
  expandBtn: { background: 'none', border: '1px solid #d1d5db', color: '#374151', padding: '6px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  deactivateBtn: { background: 'none', border: '1px solid #fca5a5', color: '#ef4444', padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  activateBtn: { background: '#059669', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  userTable: { marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 16 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '6px 10px', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', color: '#374151' },
  roleTag: { padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 },
};
