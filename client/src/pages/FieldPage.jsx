import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import AppSwitcher from '../components/AppSwitcher';
import TabBar from '../components/TabBar';
import FieldDayLog from '../components/FieldDayLog';
import DailyReports from '../components/DailyReports';

import Punchlist from '../components/Punchlist';
import SafetyTalks from '../components/SafetyTalks';
import SafetyChecklists from '../components/SafetyChecklists';
import IncidentReports from '../components/IncidentReports';
import PhotoGallery from '../components/PhotoGallery';
import SubReports from '../components/SubReports';
import EquipmentLog from '../components/EquipmentLog';
import RFITracking from '../components/RFITracking';
import InspectionChecklists from '../components/InspectionChecklists';

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FieldPage() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [projects, setProjects] = useState([]);
  const [features, setFeatures] = useState({});
  const [loading, setLoading] = useState(true);
  const FIELD_TABS = ['notes', 'daily', 'punchlist', 'safety', 'checklists', 'incident', 'gallery', 'subs', 'equip', 'rfi', 'inspect'];
  const hashTab = window.location.hash.replace('#', '');
  const [fieldTab, setFieldTab] = useState(FIELD_TABS.includes(hashTab) ? hashTab : 'notes');
  const switchTab = t => { setFieldTab(t); history.replaceState(null, '', '#' + t); };

  useEffect(() => {
    const init = async () => {
      const [p, s] = await Promise.all([api.get('/projects'), api.get('/settings')]);
      setFeatures(s.data);
      setProjects(p.data);
      setLoading(false);
    };
    init();
  }, []);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerTopRow}>
          <div style={styles.logoGroup}>
            <AppSwitcher currentApp="field" userRole={user?.role} features={features} />
            {user?.company_name && <span style={styles.companyName} className="company-name-desktop">{user.company_name}</span>}
          </div>
          <div style={styles.headerRight}>
            {!isAdmin && <span style={styles.userName}>{user?.full_name}</span>}
            <button style={styles.headerBtn} onClick={logout}>Logout</button>
          </div>
        </div>
        {user?.company_name && <div className="company-name-row"><span className="company-name">{user.company_name}</span></div>}
      </header>

      <main style={styles.main}>
        {/* Module tabs */}
        <TabBar
          active={fieldTab}
          onChange={switchTab}
          tabs={[
            { id: 'notes', label: '📷 Field Notes' },
            { id: 'punchlist', label: '✅ Punch' },
            { id: 'safety', label: '🦺 Safety' },
            { id: 'checklists', label: '☑️ Checklists' },
            { id: 'incident', label: '🚨 Incidents' },
            { id: 'equip', label: '🚜 Equipment' },
            ...(isAdmin ? [
              { id: 'daily', label: '📋 Daily Reports' },
              { id: 'rfi', label: '📝 RFIs' },
              { id: 'inspect', label: '✅ Inspect' },
              { id: 'subs', label: '🏗️ Subs' },
              ...(features.feature_media_gallery ? [{ id: 'gallery', label: '🎬 Media' }] : []),
            ] : []),
          ]}
        />

        {fieldTab === 'daily' ? (
          <DailyReports projects={projects} />
        ) : fieldTab === 'punchlist' ? (
          <Punchlist projects={projects} />
        ) : fieldTab === 'safety' ? (
          <SafetyTalks projects={projects} />
        ) : fieldTab === 'checklists' ? (
          <SafetyChecklists projects={projects} />
        ) : fieldTab === 'incident' ? (
          <IncidentReports projects={projects} />
        ) : fieldTab === 'gallery' ? (
          <PhotoGallery projects={projects} />
        ) : fieldTab === 'subs' ? (
          <SubReports projects={projects} />
        ) : fieldTab === 'equip' ? (
          <EquipmentLog projects={projects} />
        ) : fieldTab === 'rfi' ? (
          <RFITracking projects={projects} />
        ) : fieldTab === 'inspect' ? (
          <InspectionChecklists projects={projects} />
        ) : (
          <FieldDayLog projects={projects} isAdmin={isAdmin} />
        )}
      </main>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: { minHeight: '100vh', background: '#f4f6f9' },
  header: { background: '#059669', color: '#fff', padding: '0 24px', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 'calc(56px + env(safe-area-inset-top))' },
  headerTopRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: 56 },
  logoGroup: { display: 'flex', alignItems: 'center', gap: 10 },
  companyName: { fontSize: 14, fontWeight: 400, opacity: 0.75 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  userName: { fontSize: 14, opacity: 0.85 },
  headerBtn: { background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' },
  main: { maxWidth: 860, margin: '0 auto', padding: '24px 16px' },
};
