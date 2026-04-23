import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';
import { clearCache } from '../offlineDb';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [firstLogin, setFirstLogin] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('tc_token');
    if (!token) { setLoading(false); return; }

    // If offline, use cached user so the app works without a network round-trip
    if (!navigator.onLine) {
      const cached = localStorage.getItem('tc_user');
      if (cached) { try { setUser(JSON.parse(cached)); } catch {} }
      setLoading(false);
      return;
    }

    api.get('/auth/me', { timeout: 10000 })
      .then(r => { setUser(r.data.user); localStorage.setItem('tc_user', JSON.stringify(r.data.user)); })
      .catch(() => localStorage.removeItem('tc_token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password, company_name) => {
    await clearCache();
    const r = await api.post('/auth/login', { username, password, company_name }, { suppressToast: true });
    if (r.data.mfa_required) {
      return { mfa_required: true, mfa_token: r.data.mfa_token };
    }
    if (r.data.must_change_password) {
      return { must_change_password: true, setup_token: r.data.setup_token };
    }
    localStorage.setItem('tc_token', r.data.token);
    const me = await api.get('/auth/me');
    setUser(me.data.user);
    if (r.data.first_login) setFirstLogin(true);
    return me.data.user;
  };

  const loginWithToken = async token => {
    await clearCache();
    localStorage.setItem('tc_token', token);
    const me = await api.get('/auth/me');
    setUser(me.data.user);
    setFirstLogin(true); // registration always counts as first login
    return me.data.user;
  };

  const confirmMfa = async (mfa_token, code) => {
    await clearCache();
    const r = await api.post('/auth/mfa/confirm', { mfa_token, code });
    localStorage.setItem('tc_token', r.data.token);
    const me = await api.get('/auth/me');
    setUser(me.data.user);
    return me.data.user;
  };

  const logout = () => {
    clearCache();
    localStorage.removeItem('tc_token');
    localStorage.removeItem('tc_user');
    setUser(null);
    setFirstLogin(false);
  };

  const updateUser = patch => setUser(u => ({ ...u, ...patch }));
  const clearFirstLogin = () => setFirstLogin(false);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithToken, confirmMfa, logout, updateUser, firstLogin, clearFirstLogin }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
