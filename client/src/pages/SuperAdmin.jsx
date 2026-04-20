import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { langToLocale } from '../utils';
import api from '../api';
import ModalShell from '../components/ModalShell';

import { silentError } from '../errorReporter';
function formatDate(str, locale = 'en-US') {
  return new Date(str).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMrr(cents, locale = 'en-US') {
  if (!cents) return '—';
  return '$' + (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusTag(status, plan) {
  if (status === 'exempt')       return <span style={tag('#fef3c7','#92400e')}>Exempt</span>;
  if (status === 'trial')        return <span style={tag('#dbeafe','#1e40af')}>Trial</span>;
  if (status === 'active') {
    const colors = { starter: ['#dbeafe','#1e40af'], business: ['#f3e8ff','#6b21a8'] };
    const [bg, c] = colors[plan] || ['#dcfce7','#166534'];
    return <span style={tag(bg, c)}>{plan || 'active'}</span>;
  }
  if (status === 'canceled')      return <span style={tag('#fee2e2','#dc2626')}>Canceled</span>;
  if (status === 'trial_expired') return <span style={tag('#fee2e2','#dc2626')}>Trial expired</span>;
  if (status === 'past_due')      return <span style={tag('#fef3c7','#92400e')}>Past due</span>;
  return <span style={tag('#f3f4f6','#374151')}>{status}</span>;
}

function tag(bg, color) {
  return { background: bg, color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 };
}

const STATUSES = ['trial','active','past_due','canceled','trial_expired','exempt'];
const PLANS    = ['free','starter','business'];

export default function SuperAdmin() {
  const { logout, user } = useAuth();
  const locale = langToLocale(user?.language);
  const [tab, setTab] = useState('companies');

  // ── Companies state ──
  const [companies, setCompanies]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [working, setWorking]       = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [companyUsers, setCompanyUsers] = useState({});
  const [affiliates, setAffiliates] = useState([]);

  // inline rename
  const [renamingId, setRenamingId]   = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  // delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteWorking, setDeleteWorking] = useState(false);

  // impersonate
  const [impersonating, setImpersonating] = useState(null); // companyId
  const [impersonateError, setImpersonateError] = useState(null); // { id, msg }

  // affiliate delete confirm
  const [confirmingAfId, setConfirmingAfId] = useState(null);

  // ── Affiliates state ──
  const [afLoading, setAfLoading] = useState(false);
  const [afList, setAfList]       = useState([]);
  const [afExpanded, setAfExpanded] = useState(null);
  const [afForm, setAfForm]         = useState(null);
  const [afSaving, setAfSaving]     = useState(false);
  const [afError, setAfError]       = useState('');
  const [afDeleteError, setAfDeleteError] = useState('');

  // ── Client errors state ──
  const [errLoading, setErrLoading]     = useState(false);
  const [errList, setErrList]           = useState([]);
  const [errKindFilter, setErrKindFilter] = useState('all');
  const [errSinceHours, setErrSinceHours] = useState(24);
  const [errExpandedId, setErrExpandedId] = useState(null);
  const [errError, setErrError]         = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/superadmin/companies'),
      api.get('/superadmin/affiliates'),
    ]).then(([cr, ar]) => {
      setCompanies(cr.data);
      setAffiliates(ar.data);
    }).catch(silentError('superadmin')).finally(() => setLoading(false));
  }, []);

  const loadAffiliates = () => {
    setAfLoading(true);
    api.get('/superadmin/affiliates')
      .then(r => setAfList(r.data))
      .catch(silentError('superadmin'))
      .finally(() => setAfLoading(false));
  };

  useEffect(() => {
    if (tab === 'affiliates' && afList.length === 0) loadAffiliates();
  }, [tab]);

  const loadClientErrors = () => {
    setErrLoading(true);
    setErrError('');
    const since = new Date(Date.now() - errSinceHours * 3600 * 1000).toISOString();
    api.get('/superadmin/client-errors', { params: { since, limit: 200 } })
      .then(r => setErrList(r.data))
      .catch(e => setErrError(e.response?.data?.error || 'Failed to load errors'))
      .finally(() => setErrLoading(false));
  };

  useEffect(() => {
    if (tab === 'errors') loadClientErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, errSinceHours]);

  // ── Companies handlers ──
  const patchCompany = async (id, patch) => {
    setWorking(id);
    try {
      const r = await api.patch(`/superadmin/companies/${id}`, patch);
      setCompanies(prev => prev.map(c => c.id === id ? { ...c, ...r.data } : c));
    } finally { setWorking(null); }
  };

  const toggleActive = (company) => patchCompany(company.id, { active: !company.active });

  const assignAffiliate = async (companyId, affiliateId) => {
    try {
      const r = await api.patch(`/superadmin/companies/${companyId}`, { affiliate_id: affiliateId || null });
      setCompanies(prev => prev.map(c => {
        if (c.id !== companyId) return c;
        const af = affiliates.find(a => String(a.id) === String(affiliateId));
        return { ...c, ...r.data, affiliate_name: af?.name || null };
      }));
    } catch (err) { silentError('superadmin company detail')(err); }
  };

  const startRename = (company) => {
    setRenamingId(company.id);
    setRenameValue(company.name);
  };

  const saveRename = async (id) => {
    if (!renameValue.trim()) return;
    setRenameSaving(true);
    try {
      const r = await api.patch(`/superadmin/companies/${id}`, { name: renameValue.trim() });
      setCompanies(prev => prev.map(c => c.id === id ? { ...c, ...r.data } : c));
      setRenamingId(null);
    } finally { setRenameSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteConfirm !== deleteTarget.name) return;
    setDeleteWorking(true);
    try {
      await api.delete(`/superadmin/companies/${deleteTarget.id}`);
      setCompanies(prev => prev.filter(c => c.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteConfirm('');
    } finally { setDeleteWorking(false); }
  };

  const handleImpersonate = async (company, userId = null) => {
    const key = userId ? `${company.id}:${userId}` : company.id;
    setImpersonating(key);
    try {
      const r = await api.post(
        `/superadmin/companies/${company.id}/impersonate`,
        userId ? { user_id: userId } : {}
      );
      // Store token in sessionStorage under a known key, then open a new tab
      // The new tab reads it once via ?impersonate=1 and clears it
      sessionStorage.setItem('impersonate_token', r.data.token);
      window.open('/?impersonate=1', '_blank');
    } catch (err) {
      setImpersonateError({ id: company.id, msg: err.response?.data?.error || 'Could not impersonate' });
    } finally { setImpersonating(null); }
  };

  const toggleExpand = async (id) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!companyUsers[id]) {
      try {
        const r = await api.get(`/superadmin/companies/${id}/users`);
        setCompanyUsers(prev => ({ ...prev, [id]: r.data }));
      } catch (err) { silentError('superadmin company users')(err); }
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
    setAfDeleteError('');
    try {
      await api.delete(`/superadmin/affiliates/${id}`);
      setAfList(prev => prev.filter(a => a.id !== id));
      setConfirmingAfId(null);
    } catch (err) {
      setAfDeleteError(err.response?.data?.error || 'Failed to delete affiliate');
    }
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

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div style={styles.modalOverlay}>
          <ModalShell
            onClose={() => !deleteWorking && (setDeleteTarget(null), setDeleteConfirm(''))}
            titleId="sa-delete-title"
            style={styles.modal}
          >
            <div id="sa-delete-title" style={styles.modalTitle}>Delete company</div>
            <p style={styles.modalBody}>
              This will permanently delete <strong>{deleteTarget.name}</strong> and all of its data
              (workers, projects, time entries, reports, settings). This cannot be undone.
            </p>
            <p style={styles.modalBody}>Type the company name to confirm:</p>
            <input
              style={styles.modalInput}
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder={deleteTarget.name}
              autoFocus
            />
            <div style={styles.modalActions}>
              <button
                style={{ ...styles.deleteConfirmBtn, opacity: deleteConfirm === deleteTarget.name ? 1 : 0.4 }}
                onClick={confirmDelete}
                disabled={deleteConfirm !== deleteTarget.name || deleteWorking}
              >
                {deleteWorking ? 'Deleting...' : 'Delete permanently'}
              </button>
              <button style={styles.modalCancelBtn} onClick={() => { setDeleteTarget(null); setDeleteConfirm(''); }}>
                Cancel
              </button>
            </div>
          </ModalShell>
        </div>
      )}

      <main id="main-content" style={styles.main}>
        <div style={styles.tabs}>
          <button aria-current={tab === 'companies' ? 'page' : undefined} style={{ ...styles.tabBtn, ...(tab === 'companies' ? styles.tabActive : {}) }} onClick={() => setTab('companies')}>
            Companies {companies.length > 0 && <span style={styles.tabCount}>{companies.length}</span>}
          </button>
          <button aria-current={tab === 'affiliates' ? 'page' : undefined} style={{ ...styles.tabBtn, ...(tab === 'affiliates' ? styles.tabActive : {}) }} onClick={() => setTab('affiliates')}>
            Affiliates {afList.length > 0 && <span style={styles.tabCount}>{afList.length}</span>}
          </button>
          <button aria-current={tab === 'errors' ? 'page' : undefined} style={{ ...styles.tabBtn, ...(tab === 'errors' ? styles.tabActive : {}) }} onClick={() => setTab('errors')}>
            Client Errors {errList.length > 0 && <span style={styles.tabCount}>{errList.length}</span>}
          </button>
        </div>

        {/* ── Companies tab ── */}
        {tab === 'companies' && (
          <>
            {loading ? (
              <p style={{ color: '#6b7280' }}>Loading...</p>
            ) : companies.length === 0 ? (
              <p style={{ color: '#6b7280' }}>No companies yet.</p>
            ) : (
              <div style={styles.list}>
                {companies.map(c => (
                  <div key={c.id} style={{ ...styles.card, opacity: c.active ? 1 : 0.6 }}>
                    <div style={styles.cardTop}>
                      <div style={styles.cardLeft}>

                        {/* Company name / rename */}
                        <div style={styles.companyName}>
                          {renamingId === c.id ? (
                            <>
                              <input
                                style={styles.renameInput}
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveRename(c.id); if (e.key === 'Escape') setRenamingId(null); }}
                                autoFocus
                              />
                              <button style={styles.renameSaveBtn} onClick={() => saveRename(c.id)} disabled={renameSaving}>
                                {renameSaving ? '...' : 'Save'}
                              </button>
                              <button style={styles.renameCancelBtn} onClick={() => setRenamingId(null)}>Cancel</button>
                            </>
                          ) : (
                            <>
                              {c.name}
                              {!c.active && <span style={styles.inactiveTag}>Deactivated</span>}
                              {statusTag(c.subscription_status, c.plan)}
                              {c.affiliate_name && <span style={styles.affiliateTag}>via {c.affiliate_name}</span>}
                            </>
                          )}
                        </div>

                        <div style={styles.meta}>
                          <span>slug: <code style={styles.slug}>{c.slug}</code></span>
                          <span style={styles.sep}>·</span>
                          <span>Joined {formatDate(c.created_at, locale)}</span>
                          {c.mrr_cents > 0 && <>
                            <span style={styles.sep}>·</span>
                            <span style={{ color: '#059669', fontWeight: 600 }}>MRR {formatMrr(c.mrr_cents, locale)}</span>
                          </>}
                        </div>

                        <div style={styles.stats}>
                          <span style={styles.stat}><strong>{c.worker_count}</strong> workers</span>
                          <span style={styles.stat}><strong>{c.admin_count}</strong> admins</span>
                          <span style={styles.stat}><strong>{c.entry_count}</strong> entries</span>
                          {c.last_entry_at && <span style={styles.stat}>Last entry: {formatDate(c.last_entry_at, locale)}</span>}
                        </div>

                        {/* Controls row */}
                        <div style={styles.controlsRow}>
                          <div style={styles.controlGroup}>
                            <span style={styles.controlLabel}>Status</span>
                            <select
                              style={styles.controlSelect}
                              value={c.subscription_status || 'trial'}
                              onChange={e => patchCompany(c.id, { subscription_status: e.target.value })}
                              disabled={working === c.id}
                            >
                              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div style={styles.controlGroup}>
                            <span style={styles.controlLabel}>Plan</span>
                            <select
                              style={styles.controlSelect}
                              value={c.plan || 'free'}
                              onChange={e => patchCompany(c.id, { plan: e.target.value })}
                              disabled={working === c.id}
                            >
                              {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </div>
                          {(c.subscription_status === 'trial' || c.trial_ends_at) && (
                            <div style={styles.controlGroup}>
                              <span style={styles.controlLabel}>Trial ends</span>
                              <input
                                type="date"
                                style={styles.controlSelect}
                                value={c.trial_ends_at ? c.trial_ends_at.substring(0, 10) : ''}
                                onChange={e => patchCompany(c.id, { trial_ends_at: e.target.value || null })}
                                disabled={working === c.id}
                              />
                            </div>
                          )}
                          <div style={styles.controlGroup}>
                            <span style={styles.controlLabel}>QBO add-on</span>
                            <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                              <input
                                type="checkbox"
                                checked={!!c.addon_qbo}
                                onChange={e => patchCompany(c.id, { addon_qbo: e.target.checked })}
                                disabled={working === c.id}
                              />
                              {c.addon_qbo ? 'On' : 'Off'}
                            </label>
                          </div>
                          <div style={styles.controlGroup}>
                            <span style={styles.controlLabel}>Certified Payroll add-on</span>
                            <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                              <input
                                type="checkbox"
                                checked={!!c.addon_certified_payroll}
                                onChange={e => patchCompany(c.id, { addon_certified_payroll: e.target.checked })}
                                disabled={working === c.id}
                              />
                              {c.addon_certified_payroll ? 'On' : 'Off'}
                            </label>
                          </div>
                          <div style={styles.controlGroup}>
                            <span style={styles.controlLabel}>Affiliate</span>
                            <select
                              style={styles.controlSelect}
                              value={c.affiliate_id || ''}
                              onChange={e => assignAffiliate(c.id, e.target.value)}
                            >
                              <option value="">None</option>
                              {affiliates.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div style={styles.cardActions}>
                        <button style={styles.expandBtn} onClick={() => toggleExpand(c.id)}>
                          {expandedId === c.id ? 'Hide users' : 'Users'}
                        </button>
                        <button style={styles.actionBtn} onClick={() => startRename(c)} disabled={working === c.id}>
                          Rename
                        </button>
                        <button
                          style={styles.actionBtn}
                          onClick={() => { setImpersonateError(null); handleImpersonate(c); }}
                          disabled={impersonating === c.id}
                        >
                          {impersonating === c.id ? '...' : 'Login as'}
                        </button>
                        {impersonateError?.id === c.id && (
                          <span style={{ fontSize: 12, color: '#ef4444' }}>{impersonateError.msg}</span>
                        )}
                        <button
                          style={c.active ? styles.deactivateBtn : styles.activateBtn}
                          onClick={() => toggleActive(c)}
                          disabled={working === c.id}
                        >
                          {working === c.id ? '...' : c.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          style={styles.deleteBtn}
                          onClick={() => { setDeleteTarget({ id: c.id, name: c.name }); setDeleteConfirm(''); }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {expandedId === c.id && (
                      <div style={styles.userTable}>
                        {!companyUsers[c.id] ? (
                          <p style={{ color: '#6b7280', fontSize: 13 }}>Loading...</p>
                        ) : companyUsers[c.id].length === 0 ? (
                          <p style={{ color: '#6b7280', fontSize: 13 }}>No users.</p>
                        ) : (
                          <table style={styles.table}>
                            <thead>
                              <tr>
                                <th style={styles.th}>Name</th>
                                <th style={styles.th}>Username</th>
                                <th style={styles.th}>Email</th>
                                <th style={styles.th}>Role</th>
                                <th style={styles.th}>Status</th>
                                <th style={styles.th}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {companyUsers[c.id].map(u => {
                                const busy = impersonating === `${c.id}:${u.id}`;
                                return (
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
                                    <td style={styles.td}>
                                      {u.active && (
                                        <button
                                          style={{ ...styles.userImpersonateBtn, ...(busy ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }}
                                          onClick={() => handleImpersonate(c, u.id)}
                                          disabled={busy}
                                          title={`Open a new tab as ${u.full_name}`}
                                        >
                                          {busy ? '…' : 'Login as'}
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
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

            {afLoading ? <p style={{ color: '#6b7280' }}>Loading...</p> : afList.length === 0 ? (
              <p style={{ color: '#6b7280' }}>No affiliates yet. Add one to start tracking commissions.</p>
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
                          {a.notes && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{a.notes}</div>}
                          <div style={styles.afSummary}>
                            <div style={styles.afStat}>
                              <div style={styles.afStatLabel}>Companies</div>
                              <div style={styles.afStatVal}>{a.company_count}</div>
                            </div>
                            <div style={styles.afStat}>
                              <div style={styles.afStatLabel}>Active MRR</div>
                              <div style={{ ...styles.afStatVal, color: '#059669' }}>{formatMrr(mrrCents, locale)}</div>
                            </div>
                            <div style={styles.afStat}>
                              <div style={styles.afStatLabel}>Commission (30%)</div>
                              <div style={{ ...styles.afStatVal, color: '#1a56db', fontWeight: 800 }}>{formatMrr(commissionCents, locale)}<span style={{ fontSize: 11, fontWeight: 400, color: '#6b7280' }}>/mo</span></div>
                            </div>
                          </div>
                        </div>
                        <div style={styles.cardActions}>
                          <button style={styles.expandBtn} onClick={() => setAfExpanded(afExpanded === a.id ? null : a.id)}>
                            {afExpanded === a.id ? 'Hide' : 'Companies'}
                          </button>
                          <button style={styles.actionBtn} onClick={() => { setAfForm({ ...a }); setAfError(''); }}>Edit</button>
                          {confirmingAfId === a.id ? (
                            <>
                              <span style={{ fontSize: 12, color: '#6b7280' }}>Their companies will become unassigned.</span>
                              <button style={styles.deleteBtn} onClick={() => deleteAffiliate(a.id)}>Confirm</button>
                              <button style={styles.actionBtn} onClick={() => { setConfirmingAfId(null); setAfDeleteError(''); }}>Cancel</button>
                              {afDeleteError && <span style={{ fontSize: 12, color: '#ef4444' }}>{afDeleteError}</span>}
                            </>
                          ) : (
                            <button style={styles.deleteBtn} onClick={() => { setConfirmingAfId(a.id); setAfDeleteError(''); }}>Delete</button>
                          )}
                        </div>
                      </div>

                      {afExpanded === a.id && (
                        <div style={styles.userTable}>
                          {!a.companies || a.companies.length === 0 ? (
                            <p style={{ color: '#6b7280', fontSize: 13 }}>No companies assigned yet.</p>
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
                                      <td style={styles.td}>{formatMrr(cMrr, locale)}</td>
                                      <td style={{ ...styles.td, color: '#1a56db', fontWeight: 600 }}>
                                        {formatMrr(Math.round(cMrr * COMMISSION_RATE), locale)}
                                      </td>
                                      <td style={styles.td}>{formatDate(c.created_at, locale)}</td>
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

        {/* ── Client Errors tab ── */}
        {tab === 'errors' && (
          <>
            <div style={styles.titleRow}>
              <h2 style={styles.title}>Client Errors</h2>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
                  Kind:&nbsp;
                  <select
                    style={styles.controlSelect}
                    value={errKindFilter}
                    onChange={e => setErrKindFilter(e.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="render">Render</option>
                    <option value="unhandled">Unhandled</option>
                    <option value="rejection">Rejection</option>
                    <option value="console">Console</option>
                  </select>
                </label>
                <label style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
                  Window:&nbsp;
                  <select
                    style={styles.controlSelect}
                    value={errSinceHours}
                    onChange={e => setErrSinceHours(parseInt(e.target.value))}
                  >
                    <option value={1}>Last 1h</option>
                    <option value={24}>Last 24h</option>
                    <option value={168}>Last 7 days</option>
                    <option value={720}>Last 30 days</option>
                  </select>
                </label>
                <button style={styles.actionBtn} onClick={loadClientErrors} disabled={errLoading}>
                  {errLoading ? 'Loading…' : 'Refresh'}
                </button>
              </div>
            </div>

            {errError && <p style={{ color: '#dc2626', fontSize: 13 }} role="alert">{errError}</p>}

            {(() => {
              const filtered = errKindFilter === 'all'
                ? errList
                : errList.filter(e => e.kind === errKindFilter);

              // Group by (kind|message) to show each distinct bug once with an occurrence count.
              const groupsMap = new Map();
              for (const e of filtered) {
                const key = `${e.kind}|${(e.message || '').slice(0, 200)}`;
                if (!groupsMap.has(key)) {
                  groupsMap.set(key, { key, kind: e.kind, message: e.message, count: 0, users: new Set(), latest: e, sample: e });
                }
                const g = groupsMap.get(key);
                g.count++;
                if (e.user_id) g.users.add(e.user_id);
                if (new Date(e.created_at) > new Date(g.latest.created_at)) g.latest = e;
              }
              const groups = [...groupsMap.values()].sort((a, b) => new Date(b.latest.created_at) - new Date(a.latest.created_at));

              if (errLoading && groups.length === 0) {
                return <p style={{ color: '#6b7280' }}>Loading…</p>;
              }
              if (!errLoading && groups.length === 0) {
                return (
                  <div style={{ ...styles.card, textAlign: 'center', color: '#6b7280' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
                    <p style={{ margin: 0 }}>No errors in this window.</p>
                  </div>
                );
              }

              return (
                <div style={styles.list}>
                  <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 4px' }}>
                    {groups.length} unique issue{groups.length === 1 ? '' : 's'} · {filtered.length} total occurrence{filtered.length === 1 ? '' : 's'}
                  </p>
                  {groups.map(g => {
                    const isExpanded = errExpandedId === g.key;
                    const kindBg = { render: '#fee2e2', unhandled: '#fef3c7', rejection: '#ede9fe', console: '#dbeafe' }[g.kind] || '#f3f4f6';
                    const kindFg = { render: '#dc2626', unhandled: '#92400e', rejection: '#6b21a8', console: '#1e40af' }[g.kind] || '#374151';
                    return (
                      <div key={g.key} style={styles.card}>
                        <div style={styles.cardTop}>
                          <div style={styles.cardLeft}>
                            <div style={{ ...styles.companyName, marginBottom: 6 }}>
                              <span style={{ ...tag(kindBg, kindFg), textTransform: 'uppercase' }}>{g.kind}</span>
                              <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#111827', wordBreak: 'break-word' }}>
                                {g.message || '(no message)'}
                              </span>
                            </div>
                            <div style={styles.meta}>
                              <span><b>{g.count}</b> occurrence{g.count === 1 ? '' : 's'}</span>
                              <span style={styles.sep}>·</span>
                              <span>{g.users.size} user{g.users.size === 1 ? '' : 's'}</span>
                              <span style={styles.sep}>·</span>
                              <span>latest {formatDate(g.latest.created_at, locale)}</span>
                              {g.latest.app_version && (
                                <>
                                  <span style={styles.sep}>·</span>
                                  <span style={styles.slug}>{g.latest.app_version}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div style={styles.cardActions}>
                            <button style={styles.expandBtn} onClick={() => setErrExpandedId(isExpanded ? null : g.key)}>
                              {isExpanded ? 'Hide details' : 'Show details'}
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div style={{ marginTop: 14, borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
                            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                              Latest event — {g.latest.company_name || '(no company)'} · {g.latest.user_name || 'anonymous'}
                            </div>
                            {g.latest.url && (
                              <div style={{ fontSize: 12, color: '#374151', marginBottom: 6, wordBreak: 'break-all' }}>
                                <b>URL:</b> {g.latest.url}
                              </div>
                            )}
                            {g.latest.user_agent && (
                              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, wordBreak: 'break-all' }}>
                                <b>UA:</b> {g.latest.user_agent}
                              </div>
                            )}
                            {g.latest.stack && (
                              <pre style={{ fontSize: 11, background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#374151', marginTop: 8 }}>
                                {g.latest.stack}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
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
  superBadge: { background: '#8b5cf6', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, letterSpacing: '0.05em' },
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
  meta: { fontSize: 13, color: '#6b7280', display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  slug: { fontFamily: 'monospace', background: '#f3f4f6', padding: '1px 4px', borderRadius: 4, fontSize: 12 },
  sep: { color: '#d1d5db' },
  stats: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 },
  stat: { fontSize: 13, color: '#555' },
  controlsRow: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 4 },
  controlGroup: { display: 'flex', flexDirection: 'column', gap: 3 },
  controlLabel: { fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' },
  controlSelect: { fontSize: 12, padding: '4px 7px', border: '1px solid #d1d5db', borderRadius: 6, color: '#374151', background: '#fff' },
  cardActions: { display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', minWidth: 110 },
  expandBtn: { background: 'none', border: '1px solid #d1d5db', color: '#374151', padding: '6px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer', textAlign: 'center' },
  actionBtn: { background: 'none', border: '1px solid #d1d5db', color: '#374151', padding: '6px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer', textAlign: 'center' },
  deactivateBtn: { background: 'none', border: '1px solid #fca5a5', color: '#ef4444', padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'center' },
  activateBtn: { background: '#059669', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'center' },
  deleteBtn: { background: 'none', border: '1px solid #fca5a5', color: '#dc2626', padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'center' },
  renameInput: { flex: 1, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 15, fontWeight: 700 },
  renameSaveBtn: { padding: '4px 12px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  renameCancelBtn: { padding: '4px 10px', background: 'none', border: '1px solid #d1d5db', color: '#6b7280', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  userTable: { marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 16 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '6px 10px', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', color: '#374151' },
  roleTag: { padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 },
  userImpersonateBtn: { padding: '4px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#1e40af', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  // Delete modal
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 12, padding: 28, maxWidth: 440, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' },
  modalTitle: { fontWeight: 700, fontSize: 17, marginBottom: 12, color: '#dc2626' },
  modalBody: { fontSize: 14, color: '#374151', marginBottom: 10, lineHeight: 1.5 },
  modalInput: { width: '100%', padding: '9px 11px', border: '2px solid #fca5a5', borderRadius: 8, fontSize: 14, marginBottom: 16 },
  modalActions: { display: 'flex', gap: 10 },
  deleteConfirmBtn: { flex: 1, padding: '10px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  modalCancelBtn: { padding: '10px 18px', background: 'none', border: '1px solid #d1d5db', color: '#374151', borderRadius: 8, fontSize: 14, cursor: 'pointer' },
  // Affiliate form
  afFormCard: { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 16 },
  afFormTitle: { fontWeight: 700, fontSize: 15, marginBottom: 14 },
  afFormGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 },
  afLabel: { fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 },
  afInput: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13 },
  afSaveBtn: { padding: '8px 20px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  afCancelBtn: { padding: '8px 16px', background: 'none', border: '1px solid #d1d5db', color: '#374151', borderRadius: 7, fontSize: 13, cursor: 'pointer' },
  afSummary: { display: 'flex', gap: 24, marginTop: 10, flexWrap: 'wrap' },
  afStat: { display: 'flex', flexDirection: 'column', gap: 2 },
  afStatLabel: { fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' },
  afStatVal: { fontSize: 20, fontWeight: 700, color: '#111827' },
};
