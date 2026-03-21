import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tc_token');
    if (token) {
      api.get('/auth/me')
        .then(r => setUser(r.data.user))
        .catch(() => localStorage.removeItem('tc_token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password, company_name) => {
    const r = await api.post('/auth/login', { username, password, company_name });
    if (r.data.mfa_required) {
      return { mfa_required: true, mfa_token: r.data.mfa_token };
    }
    localStorage.setItem('tc_token', r.data.token);
    const me = await api.get('/auth/me');
    setUser(me.data.user);
    return me.data.user;
  };

  const loginWithToken = async token => {
    localStorage.setItem('tc_token', token);
    const me = await api.get('/auth/me');
    setUser(me.data.user);
    return me.data.user;
  };

  const confirmMfa = async (mfa_token, code) => {
    const r = await api.post('/auth/mfa/confirm', { mfa_token, code });
    localStorage.setItem('tc_token', r.data.token);
    const me = await api.get('/auth/me');
    setUser(me.data.user);
    return me.data.user;
  };

  const logout = () => {
    localStorage.removeItem('tc_token');
    setUser(null);
  };

  const updateUser = patch => setUser(u => ({ ...u, ...patch }));

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithToken, confirmMfa, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
