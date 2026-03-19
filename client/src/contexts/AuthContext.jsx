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
    localStorage.setItem('tc_token', r.data.token);
    // Fetch fresh user+plan info from /me so plan fields are always included
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
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
