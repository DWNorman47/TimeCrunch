import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../hooks/useT';
import api from '../api';
import AppSwitcher from '../components/AppSwitcher';
import PasswordInput from '../components/PasswordInput';
import TabBar from '../components/TabBar';
import BillingPanel from '../components/BillingPanel';
import ManageWorkers from '../components/ManageWorkers';
import ManageProjects from '../components/ManageProjects';
import ManageRates from '../components/ManageRates';
import AuditLog from '../components/AuditLog';
import QuickBooks from '../components/QuickBooks';
import MFASetup from '../components/MFASetup';
import { usePlan } from '../hooks/usePlan';

function RoleBadge({ role }) {
  const t = useT();
  const isAdmin = role === 'admin' || role === 'super_admin';
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: isAdmin ? '#dbeafe' : '#f3f4f6', color: isAdmin ? '#1e40af' : '#6b7280' }}>
      {isAdmin ? t.adminRole : t.workerRole}
    </span>
  );
}

// ── Company Tab ───────────────────────────────────────────────────────────────

function CompanyTab() {
  const { user } = useAuth();
  const t = useT();
  const [company, setCompany] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/admin/company').then(r => {
      setCompany(r.data);
      setName(r.data.name);
      setAddress(r.data.address || '');
      setPhone(r.data.phone || '');
      setContactEmail(r.data.contact_email || '');
    }).catch(() => {});
  }, []);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true); setMsg('');
    try {
      const r = await api.patch('/admin/company', { name, address, phone, contact_email: contactEmail });
      setCompany(r.data);
      setName(r.data.name);
      setAddress(r.data.address || '');
      setPhone(r.data.phone || '');
      setContactEmail(r.data.contact_email || '');
      setEditing(false);
      setMsg(t.companyNameUpdated);
    } catch (err) {
      setMsg(err.response?.data?.error || t.failedSave);
    } finally { setSaving(false); }
  };

  const statusInfo = {
    trial: { label: t.statusFreeTrial, color: '#92400e', bg: '#fef3c7' },
    active: { label: t.statusActive, color: '#065f46', bg: '#d1fae5' },
    past_due: { label: t.statusPastDue, color: '#991b1b', bg: '#fee2e2' },
    canceled: { label: t.statusCanceled, color: '#6b7280', bg: '#f3f4f6' },
  };

  const trialDaysLeft = company?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(company.trial_ends_at) - new Date()) / 86400000))
    : null;

  const si = statusInfo[company?.subscription_status] || statusInfo.trial;

  return (
    <div style={styles.card}>
        {/* Company name row */}
        <div style={{ padding: '20px 20px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{t.companyName}</div>
          {editing ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...styles.input, flex: 1, fontSize: 18, fontWeight: 700, padding: '8px 12px' }} value={name} onChange={e => setName(e.target.value)} autoFocus />
              <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? '...' : t.save}</button>
              <button style={styles.ghostBtn} onClick={() => { setEditing(false); setName(company.name); setAddress(company.address || ''); setPhone(company.phone || ''); setContactEmail(company.contact_email || ''); }}>{t.cancel}</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>{company?.name || '—'}</span>
              <button style={styles.editLink} onClick={() => setEditing(true)}>{t.edit}</button>
            </div>
          )}
          {msg && <p style={{ fontSize: 13, margin: '6px 0 0', color: msg.includes('Failed') || msg.includes('taken') ? '#dc2626' : '#059669' }}>{msg}</p>}
        </div>

        {/* Contact info */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid #f3f4f6', marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Contact Info <span style={{ fontWeight: 400, color: '#d1d5db' }}>— used in worker invoices</span></div>
          {editing ? (
            <>
              <input style={styles.input} placeholder="Physical address (e.g. 123 Main St, City, ST 00000)" value={address} onChange={e => setAddress(e.target.value)} />
              <div style={{ display: 'flex', gap: 10 }}>
                <input style={{ ...styles.input, flex: 1 }} placeholder="Phone (e.g. (555) 123-4567)" value={phone} onChange={e => setPhone(e.target.value)} />
                <input style={{ ...styles.input, flex: 2 }} type="email" placeholder="Email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
              {company?.address ? <div>{company.address}</div> : <div style={{ color: '#d1d5db' }}>No address set</div>}
              <div style={{ display: 'flex', gap: 20 }}>
                {company?.phone ? <span>{company.phone}</span> : <span style={{ color: '#d1d5db' }}>No phone</span>}
                {company?.contact_email ? <span>{company.contact_email}</span> : <span style={{ color: '#d1d5db' }}>No email</span>}
              </div>
            </div>
          )}
        </div>

        {/* Subscription info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderTop: '1px solid #f3f4f6' }}>
          <span style={{ ...styles.planBadge, background: si.bg, color: si.color }}>{si.label}</span>
          {company?.plan && (
            <span style={styles.planName}>{company.plan.charAt(0).toUpperCase() + company.plan.slice(1)} plan</span>
          )}
          {company?.subscription_status === 'trial' && trialDaysLeft !== null && (
            <span style={{ fontSize: 13, color: trialDaysLeft <= 3 ? '#dc2626' : '#6b7280', marginLeft: 'auto' }}>
              {trialDaysLeft > 0 ? `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left in trial` : t.trialExpired}
            </span>
          )}
        </div>
      </div>
  );
}

// ── Billing Tab ───────────────────────────────────────────────────────────────

function BillingTab() {
  const t = useT();
  return (
    <div style={styles.tabContent}>
      <h2 style={styles.tabTitle}>{t.billing}</h2>
      <BillingPanel />
    </div>
  );
}

// ── Account Tab ───────────────────────────────────────────────────────────────

function AccountTab() {
  const { user } = useAuth();
  const t = useT();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [supportForm, setSupportForm] = useState({ subject: '', message: '' });
  const [supportSending, setSupportSending] = useState(false);
  const [supportMsg, setSupportMsg] = useState({ text: '', ok: false });

  const sendSupport = async e => {
    e.preventDefault();
    if (!supportForm.message.trim()) return;
    setSupportSending(true); setSupportMsg({ text: '', ok: false });
    try {
      await api.post('/admin/support', supportForm);
      setSupportForm({ subject: '', message: '' });
      setSupportMsg({ text: "Message sent! We'll be in touch soon.", ok: true });
    } catch (err) {
      setSupportMsg({ text: err.response?.data?.error || 'Failed to send. Please email support@opsfloa.com directly.', ok: false });
    } finally { setSupportSending(false); }
  };

  const changePassword = async e => {
    e.preventDefault();
    if (form.new_password.length < 6) { setMsg(t.newPasswordMin); return; }
    if (form.new_password !== form.confirm) { setMsg(t.passwordsNoMatch); return; }
    setSaving(true); setMsg('');
    try {
      await api.post('/auth/change-password', { current_password: form.current_password, new_password: form.new_password });
      setMsg(t.passwordChangedSuccess);
      setForm({ current_password: '', new_password: '', confirm: '' });
      setTimeout(() => { setShowPasswordForm(false); setMsg(''); }, 2000);
    } catch (err) {
      setMsg(err.response?.data?.error || t.failedChangePassword);
    } finally { setSaving(false); }
  };

  return (
    <div style={styles.tabContent}>
      <h2 style={styles.tabTitle}>{t.account}</h2>

      <div style={styles.card}>
        <div style={styles.cardRow}>
          <div style={styles.cardLabel}>{t.name}</div>
          <div style={styles.cardValue}>{user?.full_name}</div>
        </div>
        <div style={styles.cardRow}>
          <div style={styles.cardLabel}>{t.username}</div>
          <div style={styles.cardValue}>@{user?.username}</div>
        </div>
        <div style={{ ...styles.cardRow, borderBottom: 'none' }}>
          <div style={styles.cardLabel}>{t.role}</div>
          <RoleBadge role={user?.role} />
        </div>
      </div>

      <MFASetup />

      <div style={styles.card}>
        <button
          style={styles.accordionTrigger}
          onClick={() => { setShowPasswordForm(o => !o); setMsg(''); }}
        >
          <span style={styles.accordionLabel}>{t.changePassword}</span>
          <span style={{ ...styles.accordionChevron, transform: showPasswordForm ? 'rotate(180deg)' : 'none' }}>▾</span>
        </button>

        {showPasswordForm && (
          <form onSubmit={changePassword} style={styles.accordionBody}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>{t.currentPassword}</label>
              <PasswordInput style={styles.input} value={form.current_password} onChange={e => set('current_password', e.target.value)} autoFocus />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>{t.newPassword}</label>
              <PasswordInput style={styles.input} value={form.new_password} onChange={e => set('new_password', e.target.value)} />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>{t.confirmNewPassword}</label>
              <PasswordInput style={styles.input} value={form.confirm} onChange={e => set('confirm', e.target.value)} />
            </div>
            {msg && (
              <p style={{ ...styles.feedback, color: msg.includes('success') || msg.includes('exitosamente') ? '#059669' : '#dc2626' }}>{msg}</p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={styles.saveBtn} type="submit" disabled={saving}>
                {saving ? t.saving : t.changePassword}
              </button>
              <button style={styles.ghostBtn} type="button" onClick={() => { setShowPasswordForm(false); setMsg(''); setForm({ current_password: '', new_password: '', confirm: '' }); }}>
                {t.cancel}
              </button>
            </div>
          </form>
        )}
      </div>

      <div style={styles.card}>
        <div style={{ padding: '16px 20px 0' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 2 }}>Support</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 14 }}>Send a message to our team for help or suggestions.</div>
        </div>
        <form onSubmit={sendSupport} style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            style={styles.input}
            type="text"
            placeholder="Subject (optional)"
            value={supportForm.subject}
            onChange={e => setSupportForm(f => ({ ...f, subject: e.target.value }))}
          />
          <textarea
            style={{ ...styles.input, minHeight: 90, resize: 'vertical', fontFamily: 'inherit' }}
            placeholder="Describe your issue or suggestion..."
            value={supportForm.message}
            onChange={e => setSupportForm(f => ({ ...f, message: e.target.value }))}
            required
          />
          {supportMsg.text && (
            <p style={{ ...styles.feedback, color: supportMsg.ok ? '#059669' : '#dc2626', margin: 0 }}>{supportMsg.text}</p>
          )}
          <div>
            <button style={styles.saveBtn} type="submit" disabled={supportSending || !supportForm.message.trim()}>
              {supportSending ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const ADMIN_TABS = ['company', 'team', 'projects', 'integrations', 'billing', 'log', 'account'];

export default function AdministrationPage() {
  const { user, logout } = useAuth();
  const plan = usePlan();
  const t = useT();

  const hashTab = window.location.hash.replace('#', '');
  const [tab, setTab] = useState(ADMIN_TABS.includes(hashTab) ? hashTab : 'company');
  const switchTab = t => { setTab(t); window.location.hash = t; };

  // Shared state for ManageWorkers and ManageProjects
  const [workers, setWorkers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [settings, setSettings] = useState(null);

  const tabs = [
    { id: 'company',      label: t.adminTabCompany      },
    { id: 'team',         label: t.adminTabTeam         },
    ...(settings?.feature_projects !== false ? [{ id: 'projects', label: t.adminTabProjects }] : []),
    ...(plan.hasQbo ? [{ id: 'integrations', label: t.adminTabIntegrations }] : []),
    { id: 'billing',      label: t.adminTabBilling      },
    { id: 'log',          label: t.adminTabLog          },
    { id: 'account',      label: t.adminTabAccount      },
  ];

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
          <AppSwitcher currentApp="administration" userRole={user?.role} features={settings} />
          {user?.company_name && <span style={styles.companyName} className="company-name">{user.company_name}</span>}
        </div>
        <div style={styles.headerRight}>
          <button style={styles.headerBtn} onClick={logout}>{t.logout}</button>
        </div>
      </header>

      <main style={styles.main}>
        <TabBar active={tab} onChange={switchTab} tabs={tabs} />

        {tab === 'company'  && (
          <div style={styles.tabContent}>
            <h2 style={styles.tabTitle}>{t.company}</h2>
            <CompanyTab />
            <h3 style={{ ...styles.sectionTitle, marginTop: 8 }}>{t.settings}</h3>
            <ManageRates settings={settings} onSettingsUpdated={setSettings} />
          </div>
        )}
        {tab === 'team'     && (
          <div style={styles.tabContent}>
            <h2 style={styles.tabTitle}>{t.team}</h2>
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
              currentUser={user}
            />
          </div>
        )}
        {tab === 'log'      && (
          <div style={styles.tabContent}>
            <h2 style={styles.tabTitle}>{t.auditLog}</h2>
            <AuditLog timezone={settings?.company_timezone ?? ''} />
          </div>
        )}
        {tab === 'projects' && (
          <div style={styles.tabContent}>
            <h2 style={styles.tabTitle}>{t.projects}</h2>
            <ManageProjects
              projects={projects}
              onProjectAdded={handleProjectAdded}
              onProjectDeleted={handleProjectDeleted}
              onProjectUpdated={handleProjectUpdated}
              onProjectRestored={handleProjectRestored}
              nameEditable={true}
              defaultPrevailingRate={settings?.prevailing_wage_rate}
              showWageType={(settings?.prevailing_wage_rate ?? 0) > 0}
              currency={settings?.currency ?? 'USD'}
            />
          </div>
        )}
        {tab === 'integrations' && (
          <div style={styles.tabContent}>
            <h2 style={styles.tabTitle}>{t.integrations}</h2>
            <QuickBooks workers={workers} projects={projects} />
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
