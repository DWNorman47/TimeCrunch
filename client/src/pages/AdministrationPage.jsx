import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import AppSwitcher from '../components/AppSwitcher';

// ── Helpers ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 36, bg = '#1a56db' }) {
  const initials = name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ color: '#fff', fontWeight: 700, fontSize: size * 0.38 }}>{initials}</span>
    </div>
  );
}

function RoleBadge({ role }) {
  const isAdmin = role === 'admin' || role === 'super_admin';
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: isAdmin ? '#dbeafe' : '#f3f4f6', color: isAdmin ? '#1e40af' : '#6b7280' }}>
      {isAdmin ? 'Admin' : 'Worker'}
    </span>
  );
}

// ── Company Tab ───────────────────────────────────────────────────────────────

function CompanyTab() {
  const { user } = useAuth();
  const [company, setCompany] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/admin/company').then(r => { setCompany(r.data); setName(r.data.name); }).catch(() => {});
  }, []);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true); setMsg('');
    try {
      const r = await api.patch('/admin/company', { name });
      setCompany(r.data);
      setName(r.data.name);
      setEditing(false);
      setMsg('Company name updated.');
    } catch (err) {
      setMsg(err.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  };

  const statusInfo = {
    trial: { label: 'Free Trial', color: '#92400e', bg: '#fef3c7' },
    active: { label: 'Active', color: '#065f46', bg: '#d1fae5' },
    past_due: { label: 'Past Due', color: '#991b1b', bg: '#fee2e2' },
    canceled: { label: 'Canceled', color: '#6b7280', bg: '#f3f4f6' },
  };

  const trialDaysLeft = company?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(company.trial_ends_at) - new Date()) / 86400000))
    : null;

  const si = statusInfo[company?.subscription_status] || statusInfo.trial;

  return (
    <div style={styles.tabContent}>
      <h2 style={styles.tabTitle}>Company</h2>

      <div style={styles.card}>
        <div style={styles.cardRow}>
          <div style={styles.cardLabel}>Company Name</div>
          {editing ? (
            <div style={{ display: 'flex', gap: 8, flex: 1 }}>
              <input style={{ ...styles.input, flex: 1 }} value={name} onChange={e => setName(e.target.value)} autoFocus />
              <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? '...' : 'Save'}</button>
              <button style={styles.ghostBtn} onClick={() => { setEditing(false); setName(company.name); }}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <span style={styles.cardValue}>{company?.name || '—'}</span>
              <button style={styles.editLink} onClick={() => setEditing(true)}>Edit</button>
            </div>
          )}
        </div>
        <div style={styles.cardRow}>
          <div style={styles.cardLabel}>Plan</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ ...styles.planBadge, background: si.bg, color: si.color }}>{si.label}</span>
            {company?.plan && <span style={styles.planName}>{company.plan.charAt(0).toUpperCase() + company.plan.slice(1)}</span>}
          </div>
        </div>
        {company?.subscription_status === 'trial' && trialDaysLeft !== null && (
          <div style={styles.cardRow}>
            <div style={styles.cardLabel}>Trial ends</div>
            <span style={{ ...styles.cardValue, color: trialDaysLeft <= 3 ? '#dc2626' : '#374151' }}>
              {trialDaysLeft > 0 ? `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} remaining` : 'Expired'}
            </span>
          </div>
        )}
        {msg && <p style={{ ...styles.feedback, color: msg.includes('Failed') || msg.includes('taken') ? '#dc2626' : '#059669' }}>{msg}</p>}
      </div>
    </div>
  );
}

// ── Team Tab ──────────────────────────────────────────────────────────────────

function InviteForm({ onInvited, onClose }) {
  const [form, setForm] = useState({ full_name: '', email: '', role: 'worker', hourly_rate: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async e => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) { setError('Name and email are required'); return; }
    setSaving(true); setError('');
    try {
      const r = await api.post('/admin/workers/invite', form);
      onInvited(r.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send invite');
    } finally { setSaving(false); }
  };

  return (
    <div style={styles.inviteForm}>
      <h4 style={styles.inviteTitle}>Invite Team Member</h4>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={styles.inviteGrid}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Full Name *</label>
            <input style={styles.input} type="text" placeholder="Jane Smith" value={form.full_name} onChange={e => set('full_name', e.target.value)} />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Email *</label>
            <input style={styles.input} type="email" placeholder="jane@company.com" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Role</label>
            <select style={styles.input} value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="worker">Worker</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Hourly Rate</label>
            <input style={styles.input} type="number" placeholder="30" value={form.hourly_rate} onChange={e => set('hourly_rate', e.target.value)} />
          </div>
        </div>
        {error && <p style={styles.error}>{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={styles.saveBtn} type="submit" disabled={saving}>{saving ? 'Sending...' : 'Send Invite'}</button>
          <button style={styles.ghostBtn} type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
      <p style={styles.inviteNote}>An email will be sent with a link to set their password.</p>
    </div>
  );
}

function TeamTab() {
  const { user } = useAuth();
  const [workers, setWorkers] = useState([]);
  const [archived, setArchived] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(null);
  const [restoring, setRestoring] = useState(null);

  const load = async () => {
    const [w, a] = await Promise.all([
      api.get('/admin/workers'),
      api.get('/admin/workers/archived'),
    ]);
    setWorkers(w.data);
    setArchived(a.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const remove = async id => {
    if (!confirm('Remove this team member? They can be restored later.')) return;
    setRemoving(id);
    try {
      await api.delete(`/admin/workers/${id}`);
      setWorkers(prev => prev.filter(w => w.id !== id));
      load(); // refresh archived list
    } finally { setRemoving(null); }
  };

  const restore = async id => {
    setRestoring(id);
    try {
      await api.patch(`/admin/workers/${id}/restore`);
      load();
    } finally { setRestoring(null); }
  };

  const bgColors = ['#1a56db', '#059669', '#7c3aed', '#d97706', '#dc2626', '#0891b2'];

  return (
    <div style={styles.tabContent}>
      <div style={styles.teamHeader}>
        <div>
          <h2 style={styles.tabTitle}>Team</h2>
          <p style={styles.tabSub}>{workers.length} active member{workers.length !== 1 ? 's' : ''}</p>
        </div>
        <button style={styles.primaryBtn} onClick={() => setShowInvite(true)}>+ Invite</button>
      </div>

      {showInvite && (
        <InviteForm
          onInvited={w => { setWorkers(prev => [w, ...prev]); setShowInvite(false); }}
          onClose={() => setShowInvite(false)}
        />
      )}

      {loading ? <p style={styles.hint}>Loading...</p> : (
        <div style={styles.card}>
          {workers.map((w, i) => (
            <div key={w.id} style={{ ...styles.memberRow, borderBottom: i < workers.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
              <Avatar name={w.full_name} bg={bgColors[i % bgColors.length]} />
              <div style={styles.memberInfo}>
                <span style={styles.memberName}>{w.full_name}</span>
                <span style={styles.memberUsername}>@{w.username}</span>
              </div>
              <RoleBadge role={w.role} />
              {w.id !== user?.id && (
                <button
                  style={styles.removeBtn}
                  onClick={() => remove(w.id)}
                  disabled={removing === w.id}
                >
                  {removing === w.id ? '...' : 'Remove'}
                </button>
              )}
            </div>
          ))}
          {workers.length === 0 && <p style={styles.hint}>No active team members.</p>}
        </div>
      )}

      {archived.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button style={styles.expandBtn} onClick={() => setShowArchived(a => !a)}>
            {showArchived ? '▲' : '▼'} Archived ({archived.length})
          </button>
          {showArchived && (
            <div style={{ ...styles.card, marginTop: 8, opacity: 0.8 }}>
              {archived.map((w, i) => (
                <div key={w.id} style={{ ...styles.memberRow, borderBottom: i < archived.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  <Avatar name={w.full_name} bg="#9ca3af" />
                  <div style={styles.memberInfo}>
                    <span style={{ ...styles.memberName, color: '#6b7280' }}>{w.full_name}</span>
                    <span style={styles.memberUsername}>@{w.username}</span>
                  </div>
                  <RoleBadge role={w.role} />
                  <button style={styles.restoreBtn} onClick={() => restore(w.id)} disabled={restoring === w.id}>
                    {restoring === w.id ? '...' : 'Restore'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Billing Tab ───────────────────────────────────────────────────────────────

function BillingTab() {
  const [status, setStatus] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(null);
  const [portaling, setPortaling] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/stripe/status'),
      api.get('/stripe/plans'),
    ]).then(([s, p]) => {
      setStatus(s.data);
      setPlans(p.data);
    }).finally(() => setLoading(false));
  }, []);

  const checkout = async priceId => {
    setCheckingOut(priceId);
    try {
      const r = await api.post('/stripe/checkout', { price_id: priceId });
      window.location.href = r.data.url;
    } catch (err) {
      alert(err.response?.data?.error || 'Could not start checkout');
      setCheckingOut(null);
    }
  };

  const portal = async () => {
    setPortaling(true);
    try {
      const r = await api.post('/stripe/portal');
      window.location.href = r.data.url;
    } catch (err) {
      alert(err.response?.data?.error || 'Could not open billing portal');
      setPortaling(false);
    }
  };

  const trialDaysLeft = status?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(status.trial_ends_at) - new Date()) / 86400000))
    : null;

  if (loading) return <div style={styles.tabContent}><p style={styles.hint}>Loading...</p></div>;

  return (
    <div style={styles.tabContent}>
      <h2 style={styles.tabTitle}>Billing</h2>

      {/* Current status */}
      <div style={styles.card}>
        <div style={styles.billingStatus}>
          <div>
            <div style={styles.cardLabel}>Current Plan</div>
            <div style={styles.currentPlan}>
              {status?.subscription_status === 'active'
                ? `${(status.plan || 'starter').charAt(0).toUpperCase() + (status.plan || 'starter').slice(1)} Plan`
                : status?.subscription_status === 'trial'
                ? 'Free Trial'
                : status?.subscription_status === 'past_due'
                ? 'Past Due'
                : 'Canceled'}
            </div>
            {status?.subscription_status === 'trial' && trialDaysLeft !== null && (
              <div style={{ ...styles.trialCountdown, color: trialDaysLeft <= 3 ? '#dc2626' : '#d97706' }}>
                {trialDaysLeft > 0 ? `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left in trial` : 'Trial expired'}
              </div>
            )}
          </div>
          {status?.subscription_status === 'active' && (
            <button style={styles.manageBtn} onClick={portal} disabled={portaling}>
              {portaling ? '...' : 'Manage Billing →'}
            </button>
          )}
          {status?.subscription_status === 'past_due' && (
            <div>
              <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>Payment failed — update your payment method to keep access.</p>
              <button style={styles.manageBtn} onClick={portal} disabled={portaling}>
                {portaling ? '...' : 'Update Payment →'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Plan cards — show when on trial or no subscription */}
      {(status?.subscription_status === 'trial' || status?.subscription_status === 'canceled' || !status?.subscription_status) && (
        <>
          <h3 style={styles.plansHeading}>Choose a Plan</h3>
          {plans.length === 0 ? (
            <div style={styles.card}>
              <p style={styles.hint}>Billing not yet configured. Set STRIPE_PRICE_STARTER and STRIPE_PRICE_PRO in your environment.</p>
            </div>
          ) : (
            <div style={styles.plansGrid}>
              {plans.map(plan => (
                <div key={plan.id} style={{ ...styles.planCard, ...(plan.id === 'pro' ? styles.planCardPro : {}) }}>
                  <div style={styles.planHeader}>
                    <div style={styles.planName}>{plan.name}</div>
                    <div style={styles.planPrice}>${plan.monthly}<span style={styles.planPer}>/mo</span></div>
                  </div>
                  <p style={styles.planDesc}>{plan.description}</p>
                  <button
                    style={{ ...styles.checkoutBtn, ...(plan.id === 'pro' ? styles.checkoutBtnPro : {}) }}
                    onClick={() => checkout(plan.price_id)}
                    disabled={!!checkingOut}
                  >
                    {checkingOut === plan.price_id ? 'Redirecting...' : `Subscribe to ${plan.name}`}
                  </button>
                  {trialDaysLeft > 0 && (
                    <p style={styles.trialNote}>Your {trialDaysLeft} remaining trial days carry over.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Account Tab ───────────────────────────────────────────────────────────────

function AccountTab() {
  const { user } = useAuth();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const changePassword = async e => {
    e.preventDefault();
    if (form.new_password.length < 6) { setMsg('New password must be at least 6 characters'); return; }
    if (form.new_password !== form.confirm) { setMsg('Passwords do not match'); return; }
    setSaving(true); setMsg('');
    try {
      await api.post('/auth/change-password', { current_password: form.current_password, new_password: form.new_password });
      setMsg('Password changed successfully.');
      setForm({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      setMsg(err.response?.data?.error || 'Failed to change password');
    } finally { setSaving(false); }
  };

  return (
    <div style={styles.tabContent}>
      <h2 style={styles.tabTitle}>Account</h2>

      <div style={styles.card}>
        <div style={styles.cardRow}>
          <div style={styles.cardLabel}>Name</div>
          <div style={styles.cardValue}>{user?.full_name}</div>
        </div>
        <div style={styles.cardRow}>
          <div style={styles.cardLabel}>Username</div>
          <div style={styles.cardValue}>@{user?.username}</div>
        </div>
        <div style={styles.cardRow}>
          <div style={styles.cardLabel}>Role</div>
          <RoleBadge role={user?.role} />
        </div>
      </div>

      <h3 style={{ ...styles.plansHeading, marginTop: 24 }}>Change Password</h3>
      <div style={styles.card}>
        <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Current Password</label>
            <input style={styles.input} type="password" value={form.current_password} onChange={e => set('current_password', e.target.value)} />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>New Password</label>
            <input style={styles.input} type="password" value={form.new_password} onChange={e => set('new_password', e.target.value)} />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Confirm New Password</label>
            <input style={styles.input} type="password" value={form.confirm} onChange={e => set('confirm', e.target.value)} />
          </div>
          {msg && (
            <p style={{ ...styles.feedback, color: msg.includes('success') ? '#059669' : '#dc2626' }}>{msg}</p>
          )}
          <button style={{ ...styles.saveBtn, alignSelf: 'flex-start' }} type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'company', label: '🏢 Company' },
  { id: 'team', label: '👥 Team' },
  { id: 'billing', label: '💳 Billing' },
  { id: 'account', label: '👤 Account' },
];

export default function AdministrationPage() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('company');

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logoGroup}>
          <AppSwitcher currentApp="administration" userRole={user?.role} />
          {user?.company_name && <span style={styles.companyName}>{user.company_name}</span>}
        </div>
        <div style={styles.headerRight}>
          <button style={styles.headerBtn} onClick={logout}>Logout</button>
        </div>
      </header>

      <main style={styles.main}>
        {/* Tab bar */}
        <div style={styles.tabs}>
          {TABS.map(t => (
            <button
              key={t.id}
              style={tab === t.id ? styles.tabActive : styles.tab}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'company' && <CompanyTab />}
        {tab === 'team' && <TeamTab />}
        {tab === 'billing' && <BillingTab />}
        {tab === 'account' && <AccountTab />}
      </main>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: { minHeight: '100vh', background: '#f4f6f9' },
  header: {
    background: '#64748b', color: '#fff', padding: '0 24px',
    paddingTop: 'env(safe-area-inset-top)',
    height: 'calc(56px + env(safe-area-inset-top))',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  logoGroup: { display: 'flex', alignItems: 'center', gap: 10 },
  companyName: { fontSize: 14, fontWeight: 400, opacity: 0.6 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  headerBtn: { background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' },
  main: { maxWidth: 760, margin: '0 auto', padding: '24px 16px' },
  // Tabs
  tabs: { display: 'flex', gap: 4, background: '#e8edf5', borderRadius: 12, padding: 4, marginBottom: 24 },
  tab: { flex: 1, padding: '9px 0', background: 'none', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, color: '#6b7280', cursor: 'pointer', whiteSpace: 'nowrap' },
  tabActive: { flex: 1, padding: '9px 0', background: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, color: '#64748b', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', whiteSpace: 'nowrap' },
  // Content sections
  tabContent: { display: 'flex', flexDirection: 'column', gap: 16 },
  tabTitle: { fontSize: 22, fontWeight: 800, color: '#111827', margin: '0 0 2px' },
  tabSub: { fontSize: 13, color: '#6b7280', margin: 0 },
  teamHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4, gap: 12 },
  // Cards
  card: { background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', padding: '0 20px', overflow: 'hidden' },
  cardRow: { display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderBottom: '1px solid #f3f4f6' },
  cardLabel: { fontSize: 13, color: '#6b7280', fontWeight: 600, minWidth: 120 },
  cardValue: { fontSize: 14, color: '#111827', fontWeight: 500 },
  planBadge: { fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 10 },
  planName: { fontSize: 13, color: '#374151', fontWeight: 500 },
  editLink: { fontSize: 12, color: '#1a56db', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 },
  feedback: { fontSize: 13, margin: '4px 0 0', padding: '8px 0' },
  // Team
  inviteForm: { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: 4 },
  inviteTitle: { fontSize: 15, fontWeight: 700, margin: '0 0 14px', color: '#111827' },
  inviteGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 10 },
  inviteNote: { fontSize: 12, color: '#9ca3af', margin: '10px 0 0' },
  memberRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' },
  memberInfo: { flex: 1, minWidth: 0 },
  memberName: { display: 'block', fontWeight: 600, fontSize: 14, color: '#111827' },
  memberUsername: { fontSize: 12, color: '#9ca3af' },
  removeBtn: { background: 'none', border: '1px solid #fca5a5', color: '#ef4444', padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', flexShrink: 0 },
  restoreBtn: { background: '#eff6ff', border: 'none', color: '#1a56db', padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600, flexShrink: 0 },
  expandBtn: { background: 'none', border: 'none', color: '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0' },
  // Billing
  billingStatus: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 0' },
  currentPlan: { fontSize: 20, fontWeight: 800, color: '#111827', marginTop: 4, marginBottom: 2 },
  trialCountdown: { fontSize: 13, fontWeight: 600 },
  manageBtn: { background: '#64748b', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0 },
  plansHeading: { fontSize: 16, fontWeight: 700, color: '#111827', margin: '8px 0 12px' },
  plansGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
  planCard: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', border: '2px solid transparent' },
  planCardPro: { border: '2px solid #1a56db', background: '#fafcff' },
  planHeader: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 },
  planName: { fontWeight: 800, fontSize: 18, color: '#111827' },
  planPrice: { fontWeight: 800, fontSize: 28, color: '#1a56db' },
  planPer: { fontSize: 14, fontWeight: 400, color: '#6b7280' },
  planDesc: { fontSize: 13, color: '#6b7280', lineHeight: 1.6, margin: '0 0 20px' },
  checkoutBtn: { width: '100%', background: '#f3f4f6', color: '#374151', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  checkoutBtnPro: { background: '#1a56db', color: '#fff' },
  trialNote: { fontSize: 11, color: '#9ca3af', margin: '10px 0 0', textAlign: 'center' },
  // Account / shared form
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: '#6b7280' },
  input: { padding: '9px 11px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, width: '100%' },
  // Buttons
  primaryBtn: { background: '#64748b', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0 },
  saveBtn: { background: '#64748b', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 },
  ghostBtn: { background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', padding: '9px 14px', borderRadius: 7, fontSize: 13, cursor: 'pointer' },
  error: { color: '#ef4444', fontSize: 13, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', margin: 0 },
  hint: { color: '#9ca3af', fontSize: 14, padding: '16px 0' },
};
