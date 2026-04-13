import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import AppSwitcher from '../components/AppSwitcher';
import NotificationSetup from '../components/NotificationSetup';
import ChangePassword from '../components/ChangePassword';
import MFASetup from '../components/MFASetup';
import PayStubView from '../components/PayStubView';
import OfflineBanner from '../components/OfflineBanner';
import { getT } from '../i18n';
import api from '../api';
import { getOrFetch } from '../offlineDb';

export default function AccountPage() {
  const { user, logout, updateUser } = useAuth();
  const t = getT(user?.language);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [settings, setSettings] = useState(null);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [langError, setLangError] = useState('');

  useEffect(() => {
    Promise.all([
      getOrFetch('settings', () => api.get('/settings').then(r => r.data)),
      api.get('/company-info').then(r => r.data).catch(() => ({})),
    ]).then(([s, ci]) => {
      setSettings(s);
      setCompanyInfo(ci);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleLanguageChange = async lang => {
    setLangError('');
    try {
      await api.post('/auth/update-language', { language: lang });
      updateUser({ language: lang });
    } catch {
      setLangError(t.failedSave || 'Failed to save language preference.');
    }
  };

  return (
    <div style={styles.page}>
      <OfflineBanner />
      <header style={styles.header} className="app-header">
        <div style={styles.headerTopRow}>
          <div style={styles.logoGroup}>
            <AppSwitcher currentApp="account" userRole={user?.role} features={settings || {}} />
            {user?.company_name && <span style={styles.companyName} className="company-name-desktop">{user.company_name}</span>}
          </div>
          <div style={styles.headerRight} className="header-right">
            <span style={styles.userName} className="header-username">{user?.full_name}</span>
            <select style={styles.langSelect} value={user?.language || 'English'} onChange={e => handleLanguageChange(e.target.value)}>
              <option value="English" style={{ color: '#111827', background: '#fff' }}>EN</option>
              <option value="Spanish" style={{ color: '#111827', background: '#fff' }}>ES</option>
            </select>
            <button style={styles.headerBtn} className="header-btn" onClick={logout}>{t.logout}</button>
          </div>
        </div>
        {user?.company_name && <div className="company-name-row"><span className="company-name">{user.company_name}</span></div>}
      </header>

      {langError && <p style={{ color: '#dc2626', fontSize: 13, margin: '8px 24px 0' }}>{langError}</p>}
      {showChangePassword && <ChangePassword onClose={() => setShowChangePassword(false)} t={t} />}

      <main style={styles.main} className="mobile-main">
        <NotificationSetup />
        <div style={styles.accountCard} className="mobile-card">
          <div style={styles.accountRow}>
            <div>
              <div style={styles.accountLabel}>{t.changePasswordTitle}</div>
              <div style={styles.accountSub}>{t.newPassword}</div>
            </div>
            <button style={styles.accountBtn} onClick={() => setShowChangePassword(true)}>{t.changePassword}</button>
          </div>
        </div>
        <MFASetup />
        <div style={styles.helpText}>
          {t.helpText}
        </div>
        {!loading && (settings?.show_worker_wages ?? false) && (
          <PayStubView user={user} settings={settings} companyInfo={companyInfo} />
        )}
      </main>
    </div>
  );
}

const HEADER_BG = '#64748b';

const styles = {
  page: { minHeight: '100vh', background: '#f4f6f9' },
  header: {
    background: HEADER_BG, color: '#fff', padding: '0 24px',
    paddingTop: 'env(safe-area-inset-top)',
    height: 'calc(56px + env(safe-area-inset-top))',
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
  },
  headerTopRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  logoGroup: { display: 'flex', alignItems: 'center', gap: 10 },
  companyName: { fontSize: 14, fontWeight: 400, opacity: 0.75 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  userName: { fontSize: 14 },
  langSelect: {
    background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff', padding: '5px 8px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  headerBtn: { background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, fontWeight: 600 },
  main: { maxWidth: 700, margin: '24px auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 20 },
  accountCard: { background: '#fff', borderRadius: 12, padding: '14px 18px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' },
  accountRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  accountLabel: { fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 2 },
  accountSub: { fontSize: 12, color: '#6b7280' },
  accountBtn: { background: 'none', border: '1px solid #d1d5db', color: '#374151', padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  helpText: { fontSize: 13, color: '#6b7280', textAlign: 'center', padding: '4px 0' },
};
