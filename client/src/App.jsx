import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import InstallPrompt from './components/InstallPrompt';
import WelcomeModal from './components/WelcomeModal';
import SkipLink from './components/SkipLink';
import { ToastProvider } from './contexts/ToastContext';
import { OfflineProvider } from './contexts/OfflineContext';

const Login             = lazy(() => import('./pages/Login'));
const Register          = lazy(() => import('./pages/Register'));
const Landing           = lazy(() => import('./pages/Landing'));
const ForgotPassword    = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword     = lazy(() => import('./pages/ResetPassword'));
const AcceptInvite      = lazy(() => import('./pages/AcceptInvite'));
const ConfirmEmail      = lazy(() => import('./pages/ConfirmEmail'));
const Dashboard         = lazy(() => import('./pages/Dashboard'));
const AdminDashboard    = lazy(() => import('./pages/AdminDashboard'));
const FieldPage         = lazy(() => import('./pages/FieldPage'));
const ProjectsPage      = lazy(() => import('./pages/ProjectsPage'));
const AdministrationPage = lazy(() => import('./pages/AdministrationPage'));
const AnalyticsPage     = lazy(() => import('./pages/AnalyticsPage'));
const SuperAdmin        = lazy(() => import('./pages/SuperAdmin'));
const InventoryPage     = lazy(() => import('./pages/InventoryPage'));
const AccountPage       = lazy(() => import('./pages/AccountPage'));
const PrivacyPolicy     = lazy(() => import('./pages/PrivacyPolicy'));
const EULA              = lazy(() => import('./pages/EULA'));
const Tests             = lazy(() => import('./pages/Tests'));

function PageLoader() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f6f9', color: '#6b7280', fontSize: 15 }}>
      Loading…
    </div>
  );
}

const BLOCKED_STATUSES = ['trial_expired', 'canceled'];

function WorkerSubscriptionWall() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f6f9', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: '40px 32px', maxWidth: 400, textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⏸</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Subscription ended</h2>
        <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>
          Your company's subscription has ended. Please contact your administrator to restore access.
        </p>
      </div>
    </div>
  );
}

function PrivateRoute({ children, adminOnly = false, superAdminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f6f9', color: '#6b7280', fontSize: 15 }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (superAdminOnly && user.role !== 'super_admin') return <Navigate to="/" replace />;
  if (adminOnly && user.role !== 'admin' && user.role !== 'super_admin') return <Navigate to="/dashboard" replace />;

  // Subscription gate — block access when trial expired or canceled
  if (BLOCKED_STATUSES.includes(user.subscription_status)) {
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    if (isAdmin) {
      // Admins can only reach /administration (billing) — redirect everything else
      if (window.location.pathname !== '/administration') {
        return <Navigate to="/administration" replace />;
      }
    } else {
      return <WorkerSubscriptionWall />;
    }
  }

  return children;
}

function adminHome(userId) {
  const key = `admin_welcomed_${userId}`;
  if (!localStorage.getItem(key)) {
    localStorage.setItem(key, '1');
    return '/administration';
  }
  return '/timeclock';
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f6f9', color: '#6b7280', fontSize: 15 }}>Loading…</div>;
  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'super_admin' ? '/superadmin' : user.role === 'admin' ? adminHome(user.id) : '/dashboard'} replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to={user.role === 'super_admin' ? '/superadmin' : user.role === 'admin' ? adminHome(user.id) : '/dashboard'} replace /> : <Register />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/eula" element={<EULA />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/confirm-email" element={<ConfirmEmail />} />
      <Route path="/__tests__" element={<Tests />} />
      <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/timeclock" element={<PrivateRoute adminOnly><AdminDashboard /></PrivateRoute>} />
      <Route path="/admin" element={<Navigate to="/timeclock" replace />} />
      <Route path="/field" element={<PrivateRoute><FieldPage /></PrivateRoute>} />
      <Route path="/projects" element={<PrivateRoute adminOnly><ProjectsPage /></PrivateRoute>} />
      <Route path="/administration" element={<PrivateRoute adminOnly><AdministrationPage /></PrivateRoute>} />
      <Route path="/analytics" element={<PrivateRoute adminOnly><AnalyticsPage /></PrivateRoute>} />
      <Route path="/inventory" element={<PrivateRoute><InventoryPage /></PrivateRoute>} />
      <Route path="/account" element={<PrivateRoute><AccountPage /></PrivateRoute>} />
      <Route path="/superadmin" element={<PrivateRoute superAdminOnly><SuperAdmin /></PrivateRoute>} />
      <Route path="/" element={user ? <Navigate to={user.role === 'super_admin' ? '/superadmin' : user.role === 'admin' ? adminHome(user.id) : '/dashboard'} replace /> : <Landing />} />
      <Route path="*" element={<Navigate to={user ? (user.role === 'super_admin' ? '/superadmin' : user.role === 'admin' ? adminHome(user.id) : '/dashboard') : '/'} replace />} />
    </Routes>
    </Suspense>
  );
}

// If this tab was opened via "Login as" from SuperAdmin, swap in the impersonate token
// before React even mounts so AuthProvider picks it up on first render.
(function applyImpersonateToken() {
  if (!window.location.search.includes('impersonate=1')) return;
  const token = sessionStorage.getItem('impersonate_token');
  if (!token) return;
  sessionStorage.removeItem('impersonate_token');
  localStorage.setItem('tc_token', token);
  // Strip the query param so normal auth flow runs from here
  window.history.replaceState({}, '', window.location.pathname);
})();

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ToastProvider>
          <OfflineProvider>
            <SkipLink />
            <WelcomeModal />
            <AppRoutes />
            <InstallPrompt />
          </OfflineProvider>
        </ToastProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
