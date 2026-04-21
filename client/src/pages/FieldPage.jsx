import React, { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../hooks/useT';
import api from '../api';
import { getOrFetch } from '../offlineDb';
import AppHeader from '../components/AppHeader';
import TabBar from '../components/TabBar';
import FieldDayLog from '../components/FieldDayLog';
import { reportClientError } from '../errorReporter';
import RetryBanner from '../components/RetryBanner';
import ErrorBoundary from '../components/ErrorBoundary';

// Tab components — lazy-loaded on first visit since only one tab is visible at a time
const DailyReports        = lazy(() => import('../components/DailyReports'));
const Punchlist           = lazy(() => import('../components/Punchlist'));
const SafetyTalks         = lazy(() => import('../components/SafetyTalks'));
const SafetyChecklists    = lazy(() => import('../components/SafetyChecklists'));
const IncidentReports     = lazy(() => import('../components/IncidentReports'));
const PhotoGallery        = lazy(() => import('../components/PhotoGallery'));
const SubReports          = lazy(() => import('../components/SubReports'));
const EquipmentLog        = lazy(() => import('../components/EquipmentLog'));
const RFITracking         = lazy(() => import('../components/RFITracking'));
const InspectionChecklists = lazy(() => import('../components/InspectionChecklists'));

function TabLoader() {
  return <div style={{ padding: '40px 0', textAlign: 'center', color: '#6b7280', fontSize: 14 }}>Loading…</div>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FieldPage() {
  const { user } = useAuth();
  const t = useT();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const [projects, setProjects] = useState([]);
  const [features, setFeatures] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const FIELD_TABS = ['notes', 'daily', 'punchlist', 'safety', 'checklists', 'incident', 'gallery', 'subs', 'equip', 'rfi', 'inspect'];
  const hashTab = window.location.hash.replace('#', '');
  const [fieldTab, setFieldTab] = useState(FIELD_TABS.includes(hashTab) ? hashTab : 'notes');
  const switchTab = t => { setFieldTab(t); history.replaceState(null, '', '#' + t); };

  const init = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [p, s] = await Promise.all([
        getOrFetch('projects', () => api.get('/projects').then(r => r.data)),
        getOrFetch('settings', () => api.get('/settings').then(r => r.data)),
      ]);
      setFeatures(s);
      setProjects(p);
    } catch (err) {
      // Surface to the user AND to Sentry — the page is unusable without these.
      setLoadError(err?.message || 'Failed to load page data');
      reportClientError({ kind: 'unhandled', message: `FieldPage init: ${err?.message || err}`, stack: err?.stack });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { init(); }, [init]);

  return (
    <div style={styles.page}>
      <AppHeader currentApp="field" features={features} />

      <main id="main-content" style={styles.main}>
        <RetryBanner message={loadError} onRetry={init} />

        {/* Module tabs */}
        <TabBar
          active={fieldTab}
          onChange={switchTab}
          tabs={[
            { id: 'notes', label: t.fieldTabNotes },
            { id: 'punchlist', label: t.fieldTabPunch },
            { id: 'safety', label: t.fieldTabSafety },
            { id: 'checklists', label: t.fieldTabChecklists },
            { id: 'incident', label: t.fieldTabIncidents },
            { id: 'equip', label: t.fieldTabEquip },
            ...(isAdmin ? [
              { id: 'daily', label: t.fieldTabDaily },
              { id: 'rfi', label: t.fieldTabRFI },
              { id: 'inspect', label: t.fieldTabInspect },
              { id: 'subs', label: t.fieldTabSubs },
              ...(features.feature_media_gallery ? [{ id: 'gallery', label: t.fieldTabMedia }] : []),
            ] : []),
          ]}
        />

        {/* Per-tab error boundary — a crash in one tab doesn't take down the page.
            Keyed on fieldTab so switching tabs resets the boundary if the user
            recovered by navigating away from the broken tab. */}
        <ErrorBoundary key={fieldTab} mode="inline" label={fieldTab}>
          <Suspense fallback={<TabLoader />}>
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
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: { minHeight: '100vh', background: '#f4f6f9' },
  header: { background: '#059669', color: '#fff', padding: '0 24px', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 'calc(56px + env(safe-area-inset-top))', position: 'sticky', top: 0, zIndex: 100 },
  headerTopRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: 56 },
  logoGroup: { display: 'flex', alignItems: 'center', gap: 10 },
  companyName: { fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  userName: { fontSize: 14, opacity: 0.85 },
  headerBtn: { background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  main: { maxWidth: 860, margin: '0 auto', padding: '24px 16px' },
};
