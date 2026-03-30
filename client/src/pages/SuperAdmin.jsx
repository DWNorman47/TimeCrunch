import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';

function formatDate(str) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMrr(cents) {
  if (!cents) return '—';
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function planTag(plan, status) {
  if (!plan || plan === 'free') return null;
  const colors = { starter: ['#dbeafe', '#1e40af'], business: ['#f3e8ff', '#6b21a8'] };
  const [bg, color] = colors[plan] || ['#f3f4f6', '#374151'];
  const inactive = status === 'canceled' || status === 'past_due';
  return (
    <span style={{ background: inactive ? '#fee2e2' : bg, color: inactive ? '#dc2626' : color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>
      {plan}{inactive ? ` (${status})` : ''}
    </span>
  );
}

export default function SuperAdmin() {
  const { logout, user } = useAuth();
  const [tab, setTab] = useState('companies');

  // ── Companies state ──
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [companyUsers, setCompanyUsers] = useState({});
  const [affiliates, setAffiliates] = useState([]);

  // ── Affiliates state ──
  const [afLoading, setAfLoading] = useState(false);
  const [afList, setAfList] = useState([]);
  const [afExpanded, setAfExpanded] = useState(null);
  const [afForm, setAfForm] = useState(null); // null | { id?, name, email, phone, notes }
  const [afSaving, setAfSaving] = useState(false);
  const [afError, setAfError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/superadmin/companies'),
      api.get('/superadmin/affiliates'),
    ]).then(([cr, ar]) => {
      setCompanies(cr.data);
      setAffiliates(ar.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const loadAffiliates = () => {
    setAfLoading(true);
    api.get('/superadmin/affiliates')
      .then(r => setAfList(r.data))
      .catch(() => {})
      .finally(() => setAfLoading(false));
  };

  useEffect(() => {
    if (tab === 'affiliates' && afList.length === 0) loadAffiliates();
  }, [tab]);

  // ── Companies handlers ──
  const toggleActive = async (company) => {
    setWorking(company.id);
    try {
      const r = await api.patch(`/superadmin/companies/${company.id}`, { active: !company.active });
      setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, ...r.data } : c));
    } finally { setWorking(null); }
  };

  const assignAffiliate = async (companyId, affiliateId) => {
    try {
      await api.patch(`/superadmin/companies/${companyId}`, { affiliate_id: affiliateId || null });
      setCompanies(prev => prev.map(c => {
        if (c.id !== companyId) return c;
        const af = affiliates.find(a => String(a.id) === String(affiliateId));
        return { ...c, affiliate_id: affiliateId || null, affiliate_name: af?.name || null };
      }));
    } catch {}
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

  // ── Affiliate handlers ──
  const saveAffiliate = async () => {
    if (!afForm?.name?.trim()) { setAfError('Name is required'); return; }
    setAfSaving(true); setAfError('');
    try {
      if (afForm.id) {
        const r = await api.patch(`/superadmin/affiliates/${afForm.id}`, afForm);
        setAfList(prev => prev.map(a => a.id === afForm.id ? { ...a, ...r.data } : a));
      } else {
        const r = await api.post('/superadmin/affiliates', afForm);
        setAfList(prev => [...prev, r.data]);
      }
      setAfForm(null);
    } catch (err) {
      setAfError(err.response?.data?.error || 'Failed to save');
    } finally { setAfSaving(false); }
  };

  const deleteAffiliate = async (id) => {
    if (!confirm('Delete this affiliate? Their companies will become unassigned.')) return;
    try {
      await api.delete(`/superadmin/affiliates/${id}`);
      setAfList(prev => prev.filter(a => a.id !== id));
    } catch {}
  };

  const COMMISSION_RATE = 0.30;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logoGroup}>
          <span style={styles.logo}>OpsFloa</span>
          <span style={styles.superBadge}>Super Admin</span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.userName}>{user?.full_name}</span>
          <button style={styles.headerBtn} onClick={logout}>Logout</button>
        </div>
      </header>

      <main style={styles.main}>
        {/* Tab bar */}
        <div style={styles.tabs}>
          <button style={{ ...styles.tabBtn, ...(tab === 'companies' ? styles.tabActive : {}) }} onClick={() => setTab('companies')}>
            Companies {companies.length > 0 && <span style={styles.tabCount}>{companies.length}</span>}
          </button>
          <button style={{ ...styles.tabBtn, ...(tab === 'affiliates' ? styles.tabActive : {}) }} onClick={() => setTab('affiliates')}>
            Affiliates {afList.length > 0 && <span style={styles.tabCount}>{afList.length}</span>}
          </button>
        </div>

        {/* ── Companies tab ── */}
        {tab === 'companies' && (
          <>
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
                          {planTag(c.plan, c.subscription_status)}
                          {c.affiliate_name && (
                            <span style={styles.affiliateTag}>via {c.affiliate_name}</span>
                          )}
                        </div>
                        <div style={styles.meta}>
                          <span>slug: <code style={styles.slug}>{c.slug}</code></span>
                          <span style={styles.sep}>·</span>
                          <span>Joined {formatDate(c.created_at)}</span>
                          {c.mrr_cents > 0 && <>
                            <span style={styles.sep}>·</span>
                            <span style={{ color: '#059669', fontWeight: 600 }}>MRR {formatMrr(c.mrr_cents)}</span>
                          </>}
                        </div>
                        <div style={styles.stats}>
                          <span style={styles.stat}><strong>{c.worker_count}</strong> workers</span>
                          <span style={styles.stat}><strong>{c.admin_count}</strong> admins</span>
                          <span style={styles.stat}><strong>{c.entry_count}</strong> entries</span>
                          {c.last_entry_at && <span style={styles.stat}>Last entry: {formatDate(c.last_entry_at)}</span>}
                        </div>
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, color: '#9ca3af' }}>Affiliate:</span>
                          <select
                            style={styles.affiliateSelect}
                            value={c.affiliate_id || ''}
                            onChange={e => assignAffiliate(c.id, e.target.value)}
                          >
                            <option value="">None</option>
                            {affiliates.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
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
          </>
        )}

        {/* ── Affiliates tab ── */}
        {tab === 'affiliates' && (
          <>
            <div style={styles.titleRow}>
              <h2 style={styles.title}>Affiliates</h2>
              <button style={styles.newBtn} onClick={() => { setAfForm({ name: '', email: '', phone: '', notes: '' }); setAfError(''); }}>
                + New Affiliate
              </button>
            </div>

            {/* New / Edit form */}
            {afForm && (
              <div style={styles.afFormCard}>
                <div style={styles.afFormTitle}>{afForm.id ? 'Edit Affiliate' : 'New Affiliate'}</div>
                <div style={styles.afFormGrid}>
                  <div>
                    <label style={styles.afLabel}>Name *</label>
                    <input style={styles.afInput} value={afForm.name} onChange={e => setAfForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" autoFocus />
                  </div>
                  <div>
                    <label style={styles.afLabel}>Email</label>
                    <input style={styles.afInput} type="email" value={afForm.email || ''} onChange={e => setAfForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
                  </div>
                  <div>
                    <label style={styles.afLabel}>Phone</label>
                    <input style={styles.afInput} value={afForm.phone || ''} onChange={e => setAfForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 555-5555" />
                  </div>
                  <div>
                    <label style={styles.afLabel}>Notes</label>
                    <input style={styles.afInput} value={afForm.notes || ''} onChange={e => setAfForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
                  </div>
                </div>
                {afError && <p style={{ color: '#ef4444', fontSize: 13, margin: '4px 0 0' }}>{afError}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button style={styles.afSaveBtn} onClick={saveAffiliate} disabled={afSaving}>{afSaving ? 'Saving...' : 'Save'}</button>
                  <button style={styles.afCancelBtn} onClick={() => setAfForm(null)}>Cancel</button>
                </div>
              </div>
            )}

            {afLoading ? <p style={{ color: '#888' }}>Loading...</p> : afList.length === 0 ? (
              <p style={{ color: '#888' }}>No affiliates yet. Add one to start tracking commissions.</p>
            ) : (
              <div style={styles.list}>
                {afList.map(a => {
                  const mrrCents = parseInt(a.active_mrr_cents ?? 0);
                  const commissionCents = Math.round(mrrCents * COMMISSION_RATE);
                  return (
                    <div key={a.id} style={styles.card}>
                      <div style={styles.cardTop}>
                        <div style={styles.cardLeft}>
                          <div style={styles.companyName}>{a.name}</div>
                          <div style={styles.meta}>
                            {a.email && <span>{a.email}</span>}
                            {a.email && a.phone && <span style={styles.sep}>·</span>}
                            {a.phone && <span>{a.phone}</span>}
                          </div>
                          {a.notes && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{a.notes}</div>}
                          <div style={styles.afSummary}>
                            <div style={styles.afStat}>
                              <div style={styles.afStatLabel}>Companies</div>
                              <div style={styles.afStatVal}>{a.company_count}</div>
                            </div>
                            <div style={styles.afStat}>
                              <div style={styles.afStatLabel}>Active MRR</div>
                              <div style={{ ...styles.afStatVal, color: '#059669' }}>{formatMrr(mrrCents)}</div>
                            </div>
                            <div style={styles.afStat}>
                              <div style={styles.afStatLabel}>Commission (30%)</div>
                              <div style={{ ...styles.afStatVal, color: '#1a56db', fontWeight: 800 }}>{formatMrr(commissionCents)}<span style={{ fontSize: 11, fontWeight: 400, color: '#6b7280' }}>/mo</span></div>
                            </div>
                          </div>
                        </div>
                        <div style={styles.cardActions}>
                          <button style={styles.expandBtn} onClick={() => setAfExpanded(afExpanded === a.id ? null : a.id)}>
                            {afExpanded === a.id ? 'Hide' : 'Companies'}
                          </button>
                          <button style={styles.expandBtn} onClick={() => { setAfForm({ ...a }); setAfError(''); }}>Edit</button>
                          <button style={styles.deactivateBtn} onClick={() => deleteAffiliate(a.id)}>Delete</button>
                        </div>
                      </div>

                      {afExpanded === a.id && (
                        <div style={styles.userTable}>
                          {!a.companies || a.companies.length === 0 ? (
                            <p style={{ color: '#888', fontSize: 13 }}>No companies assigned yet.</p>
                          ) : (
                            <table style={styles.table}>
                              <thead>
                                <tr>
                                  <th style={styles.th}>Company</th>
                                  <th style={styles.th}>Plan</th>
                                  <th style={styles.th}>Status</th>
                                  <th style={styles.th}>MRR</th>
                                  <th style={styles.th}>Commission</th>
                                  <th style={styles.th}>Joined</th>
                                </tr>
                              </thead>
                              <tbody>
                                {a.companies.map(c => {
                                  const cMrr = parseInt(c.mrr_cents ?? 0);
                                  return (
                                    <tr key={c.id}>
                                      <td style={styles.td}>{c.name}</td>
                                      <td style={styles.td}>{c.plan || 'free'}</td>
                                      <td style={styles.td}>
                                        <span style={{ color: c.subscription_status === 'active' ? '#059669' : '#9ca3af', fontSize: 12 }}>
                                          {c.subscription_status || 'trial'}
                                        </span>
                                      </td>
                                      <td style={styles.td}>{formatMrr(cMrr)}</td>
                                      <td style={{ ...styles.td, color: '#1a56db', fontWeight: 600 }}>
                                        {formatMrr(Math.round(cMrr * COMMISSION_RATE))}
                                      </td>
                                      <td style={styles.td}>{formatDate(c.created_at)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
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
  tabs: { display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #e5e7eb', paddingBottom: 0 },
  tabBtn: { padding: '10px 20px', background: 'none', border: 'none', fontSize: 14, fontWeight: 600, color: '#6b7280', cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: -2, display: 'flex', alignItems: 'center', gap: 6 },
  tabActive: { color: '#1a56db', borderBottomColor: '#1a56db' },
  tabCount: { background: '#e5e7eb', color: '#374151', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10 },
  titleRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  newBtn: { marginLeft: 'auto', padding: '8px 16px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: { background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' },
  cardLeft: { flex: 1 },
  companyName: { fontWeight: 700, fontSize: 17, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  inactiveTag: { background: '#fee2e2', color: '#dc2626', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 },
  affiliateTag: { background: '#f0fdf4', color: '#15803d', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10 },
  meta: { fontSize: 13, color: '#9ca3af', display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  slug: { fontFamily: 'monospace', background: '#f3f4f6', padding: '1px 4px', borderRadius: 4, fontSize: 12 },
  sep: { color: '#d1d5db' },
  stats: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  stat: { fontSize: 13, color: '#555' },
  affiliateSelect: { fontSize: 12, padding: '3px 7px', border: '1px solid #d1d5db', borderRadius: 6, color: '#374151', background: '#fff' },
  cardActions: { display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' },
  expandBtn: { background: 'none', border: '1px solid #d1d5db', color: '#374151', padding: '6px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  deactivateBtn: { background: 'none', border: '1px solid #fca5a5', color: '#ef4444', padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  activateBtn: { background: '#059669', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  userTable: { marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 16 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '6px 10px', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', color: '#374151' },
  roleTag: { padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 },
  // Affiliate form
  afFormCard: { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 16 },
  afFormTitle: { fontWeight: 700, fontSize: 15, marginBottom: 14 },
  afFormGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 },
  afLabel: { fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 },
  afInput: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13 },
  afSaveBtn: { padding: '8px 20px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  afCancelBtn: { padding: '8px 16px', background: 'none', border: '1px solid #d1d5db', color: '#374151', borderRadius: 7, fontSize: 13, cursor: 'pointer' },
  // Affiliate summary stats
  afSummary: { display: 'flex', gap: 24, marginTop: 10, flexWrap: 'wrap' },
  afStat: { display: 'flex', flexDirection: 'column', gap: 2 },
  afStatLabel: { fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' },
  afStatVal: { fontSize: 20, fontWeight: 700, color: '#111827' },
};
