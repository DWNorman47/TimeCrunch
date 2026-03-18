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
import SuperAdmin from './pages/SuperAdmin';
import InstallPrompt from './components/InstallPrompt';

function PrivateRoute({ children, adminOnly = false, superAdminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40 }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (superAdminOnly && user.role !== 'super_admin') return <Navigate to="/" replace />;
  if (adminOnly && user.role !== 'admin' && user.role !== 'super_admin') return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40 }}>Loading...</div>;
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'super_admin' ? '/superadmin' : user.role === 'admin' ? '/admin' : '/dashboard'} replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to={user.role === 'super_admin' ? '/superadmin' : user.role === 'admin' ? '/admin' : '/dashboard'} replace /> : <Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/confirm-email" element={<ConfirmEmail />} />
      <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/admin" element={<PrivateRoute adminOnly><AdminDashboard /></PrivateRoute>} />
      <Route path="/field" element={<PrivateRoute><FieldPage /></PrivateRoute>} />
      <Route path="/superadmin" element={<PrivateRoute superAdminOnly><SuperAdmin /></PrivateRoute>} />
      <Route path="/" element={user ? <Navigate to={user.role === 'super_admin' ? '/superadmin' : user.role === 'admin' ? '/admin' : '/dashboard'} replace /> : <Landing />} />
      <Route path="*" element={<Navigate to={user ? (user.role === 'super_admin' ? '/superadmin' : user.role === 'admin' ? '/admin' : '/dashboard') : '/'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <InstallPrompt />
      </BrowserRouter>
    </AuthProvider>
  );
}
