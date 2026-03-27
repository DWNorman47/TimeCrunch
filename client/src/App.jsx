import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Landing from './pages/Landing';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AcceptInvite from './pages/AcceptInvite';
import ConfirmEmail from './pages/ConfirmEmail';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import FieldPage from './pages/FieldPage';
import ProjectsPage from './pages/ProjectsPage';
import AdministrationPage from './pages/AdministrationPage';
import SuperAdmin from './pages/SuperAdmin';
import PrivacyPolicy from './pages/PrivacyPolicy';
import EULA from './pages/EULA';
import InstallPrompt from './components/InstallPrompt';
import WelcomeModal from './components/WelcomeModal';
import { ToastProvider } from './contexts/ToastContext';
import { OfflineProvider } from './contexts/OfflineContext';

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
  if (loading) return <div style={{ padding: 40 }}>Loading...</div>;
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
  return '/admin';
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40 }}>Loading...</div>;
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'super_admin' ? '/superadmin' : user.role === 'admin' ? adminHome(user.id) : '/dashboard'} replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to={user.role === 'super_admin' ? '/superadmin' : user.role === 'admin' ? adminHome(user.id) : '/dashboard'} replace /> : <Register />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/eula" element={<EULA />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/confirm-email" element={<ConfirmEmail />} />
      <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/admin" element={<PrivateRoute adminOnly><AdminDashboard /></PrivateRoute>} />
      <Route path="/field" element={<PrivateRoute><FieldPage /></PrivateRoute>} />
      <Route path="/projects" element={<PrivateRoute adminOnly><ProjectsPage /></PrivateRoute>} />
      <Route path="/administration" element={<PrivateRoute adminOnly><AdministrationPage /></PrivateRoute>} />
      <Route path="/superadmin" element={<PrivateRoute superAdminOnly><SuperAdmin /></PrivateRoute>} />
      <Route path="/" element={user ? <Navigate to={user.role === 'super_admin' ? '/superadmin' : user.role === 'admin' ? adminHome(user.id) : '/dashboard'} replace /> : <Landing />} />
      <Route path="*" element={<Navigate to={user ? (user.role === 'super_admin' ? '/superadmin' : user.role === 'admin' ? adminHome(user.id) : '/dashboard') : '/'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ToastProvider>
          <OfflineProvider>
            <WelcomeModal />
            <AppRoutes />
            <InstallPrompt />
          </OfflineProvider>
        </ToastProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
