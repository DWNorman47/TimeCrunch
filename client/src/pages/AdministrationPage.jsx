import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import AppSwitcher from '../components/AppSwitcher';
import TabBar from '../components/TabBar';
import BillingPanel from '../components/BillingPanel';
import ManageWorkers from '../components/ManageWorkers';
import ManageProjects from '../components/ManageProjects';
import ManageRates from '../components/ManageRates';
import AuditLog from '../components/AuditLog';
import QuickBooks from '../components/QuickBooks';
import { usePlan } from '../hooks/usePlan';

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
    <div style={styles.card}>
        {/* Company name row */}
        <div style={{ padding: '20px 20px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Company Name</div>
          {editing ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...styles.input, flex: 1, fontSize: 18, fontWeight: 700, padding: '8px 12px' }} value={name} onChange={e => setName(e.target.value)} autoFocus />
              <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? '...' : 'Save'}</button>
              <button style={styles.ghostBtn} onClick={() => { setEditing(false); setName(company.name); }}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>{company?.name || '—'}</span>
              <button style={styles.editLink} onClick={() => setEditing(true)}>Edit</button>
            </div>
          )}
          {msg && <p style={{ fontSize: 13, margin: '6px 0 0', color: msg.includes('Failed') || msg.includes('taken') ? '#dc2626' : '#059669' }}>{msg}</p>}
        </div>

        {/* Subscription info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', marginTop: 14, borderTop: '1px solid #f3f4f6' }}>
          <span style={{ ...styles.planBadge, background: si.bg, color: si.color }}>{si.label}</span>
          {company?.plan && (
            <span style={styles.planName}>{company.plan.charAt(0).toUpperCase() + company.plan.slice(1)} plan</span>
          )}
          {company?.subscription_status === 'trial' && trialDaysLeft !== null && (
            <span style={{ fontSize: 13, color: trialDaysLeft <= 3 ? '#dc2626' : '#6b7280', marginLeft: 'auto' }}>
              {trialDaysLeft > 0 ? `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left in trial` : 'Trial expired'}
            </span>
          )}
        </div>
      </div>
  );
}

// ── Billing Tab ───────────────────────────────────────────────────────────────

function BillingTab() {
  return (
    <div style={styles.tabContent}>
      <h2 style={styles.tabTitle}>Billing</h2>
      <BillingPanel />
    </div>
  );
}

// ── Account Tab ───────────────────────────────────────────────────────────────

function AccountTab() {
  const { user } = useAuth();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
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
      setTimeout(() => { setShowPasswordForm(false); setMsg(''); }, 2000);
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
        <div style={{ ...styles.cardRow, borderBottom: 'none' }}>
          <div style={styles.cardLabel}>Role</div>
          <RoleBadge role={user?.role} />
        </div>
      </div>

      <div style={styles.card}>
        <button
          style={styles.accordionTrigger}
          onClick={() => { setShowPasswordForm(o => !o); setMsg(''); }}
        >
          <span style={styles.accordionLabel}>Change Password</span>
          <span style={{ ...styles.accordionChevron, transform: showPasswordForm ? 'rotate(180deg)' : 'none' }}>▾</span>
        </button>

        {showPasswordForm && (
          <form onSubmit={changePassword} style={styles.accordionBody}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Current Password</label>
              <input style={styles.input} type="password" value={form.current_password} onChange={e => set('current_password', e.target.value)} autoFocus />
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={styles.saveBtn} type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Change Password'}
              </button>
              <button style={styles.ghostBtn} type="button" onClick={() => { setShowPasswordForm(false); setMsg(''); setForm({ current_password: '', new_password: '', confirm: '' }); }}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const ADMIN_TABS = ['company', 'team', 'projects', 'integrations', 'billing', 'account'];
const TABS = [
  { id: 'company',      label: '🏢 Company'      },
  { id: 'team',         label: '👥 Team'         },
  { id: 'projects',     label: '📋 Projects'     },
  { id: 'integrations', label: '🔗 Integrations' },
  { id: 'billing',      label: '💳 Billing'      },
  { id: 'account',      label: '👤 Account'      },
];

export default function AdministrationPage() {
  const { user, logout } = useAuth();
  const plan = usePlan();
  const hashTab = window.location.hash.replace('#', '');
  const [tab, setTab] = useState(ADMIN_TABS.includes(hashTab) ? hashTab : 'company');
  const switchTab = t => { setTab(t); window.location.hash = t; };

  // Shared state for ManageWorkers and ManageProjects
  const [workers, setWorkers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/admin/workers', { params: { all_roles: true } }),
      api.get('/admin/projects'),
      api.get('/admin/settings'),
    ]).then(([w, p, s]) => {
      setWorkers(w.data);
      setProjects(p.data);
      setSettings(s.data);
    }).catch(() => {});
  }, []);

  const handleWorkerAdded    = w  => setWorkers(prev => [...prev, { ...w, total_entries: 0, total_hours: 0, regular_hours: 0, overtime_hours: 0, prevailing_hours: 0 }]);
  const handleWorkerDeleted  = id => setWorkers(prev => prev.filter(w => w.id !== id));
  const handleWorkerUpdated  = w  => setWorkers(prev => prev.map(x => x.id === w.id ? { ...x, ...w } : x));
  const handleWorkerRestored = w  => setWorkers(prev => [...prev, w]);
  const handleProjectAdded   = p  => setProjects(prev => [...prev, p]);
  const handleProjectDeleted = id => setProjects(prev => prev.filter(p => p.id !== id));
  const handleProjectUpdated = p  => setProjects(prev => prev.map(x => x.id === p.id ? p : x));
  const handleProjectRestored= p  => setProjects(prev => [...prev, p]);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logoGroup}>
          <AppSwitcher currentApp="administration" userRole={user?.role} />
          {user?.company_name && <span style={styles.companyName} className="company-name">{user.company_name}</span>}
        </div>
        <div style={styles.headerRight}>
          <button style={styles.headerBtn} onClick={logout}>Logout</button>
        </div>
      </header>

      <main style={styles.main}>
        <TabBar active={tab} onChange={switchTab} tabs={TABS} />

        {tab === 'company'  && (
          <div style={styles.tabContent}>
            <h2 style={styles.tabTitle}>Company</h2>
            <CompanyTab />
            <h3 style={{ ...styles.sectionTitle, marginTop: 8 }}>Settings</h3>
            <ManageRates settings={settings} onSettingsUpdated={setSettings} />
          </div>
        )}
        {tab === 'team'     && (
          <div style={styles.tabContent}>
            <h2 style={styles.tabTitle}>Team</h2>
            <ManageWorkers
              workers={workers}
              onWorkerAdded={handleWorkerAdded}
              onWorkerDeleted={handleWorkerDeleted}
              onWorkerUpdated={handleWorkerUpdated}
              onWorkerRestored={handleWorkerRestored}
              defaultRate={settings?.default_hourly_rate ?? 0}
              showRate={true}
              identityEditable={true}
              currency={settings?.currency ?? 'USD'}
            />
            <h3 style={styles.sectionTitle}>Audit Log</h3>
            <AuditLog />
          </div>
        )}
        {tab === 'projects' && (
          <div style={styles.tabContent}>
            <h2 style={styles.tabTitle}>Projects</h2>
            <ManageProjects
              projects={projects}
              onProjectAdded={handleProjectAdded}
              onProjectDeleted={handleProjectDeleted}
              onProjectUpdated={handleProjectUpdated}
              onProjectRestored={handleProjectRestored}
              showWageType={false}
              nameEditable={true}
            />
          </div>
        )}
        {tab === 'integrations' && (
          <div style={styles.tabContent}>
            <h2 style={styles.tabTitle}>Integrations</h2>
            {plan.hasQbo
              ? <QuickBooks workers={workers} projects={projects} />
              : <div style={{ background: '#f9fafb', border: '2px dashed #d1d5db', borderRadius: 10, padding: '32px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 6 }}>QuickBooks Online requires the QBO add-on</div>
                  <button style={{ background: '#1a56db', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', marginTop: 8 }}
                    onClick={() => switchTab('billing')}>View Plans →</button>
                </div>
            }
          </div>
        )}
        {tab === 'billing'  && <BillingTab />}
        {tab === 'account'  && <AccountTab />}
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
  main: { maxWidth: 900, margin: '0 auto', padding: '24px 16px' },
  // Content sections
  tabContent: { display: 'flex', flexDirection: 'column', gap: 16 },
  sectionTitle: { fontSize: 17, fontWeight: 700, margin: '8px 0 0' },
  tabTitle: { fontSize: 22, fontWeight: 800, color: '#111827', margin: '0 0 4px' },
  // Cards
  card: { background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden' },
  cardRow: { display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', borderBottom: '1px solid #f3f4f6' },
  cardLabel: { fontSize: 13, color: '#6b7280', fontWeight: 600, minWidth: 120 },
  cardValue: { fontSize: 14, color: '#111827', fontWeight: 500 },
  planBadge: { fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 10 },
  planName: { fontSize: 13, color: '#374151', fontWeight: 500 },
  editLink: { fontSize: 12, color: '#1a56db', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 },
  feedback: { fontSize: 13, margin: '4px 0 0', padding: '6px 0' },
  // Account
  accordionTrigger: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' },
  accordionLabel: { fontSize: 14, fontWeight: 600, color: '#374151' },
  accordionChevron: { fontSize: 16, color: '#9ca3af', transition: 'transform 0.2s', display: 'inline-block' },
  accordionBody: { display: 'flex', flexDirection: 'column', gap: 12, padding: '0 20px 20px', borderTop: '1px solid #f3f4f6' },
  // Shared form
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: '#6b7280' },
  input: { padding: '9px 11px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, width: '100%' },
  // Buttons
  saveBtn: { background: '#64748b', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 },
  ghostBtn: { background: 'none', border: '1px solid #e5e7eb', color: '#6b7280', padding: '9px 14px', borderRadius: 7, fontSize: 13, cursor: 'pointer' },
  error: { color: '#ef4444', fontSize: 13, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', margin: 0 },
  hint: { color: '#9ca3af', fontSize: 14, padding: '16px 0' },
};
