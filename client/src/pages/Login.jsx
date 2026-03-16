import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ company_name: localStorage.getItem('tc_company') || '', username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(form.username, form.password, form.company_name);
      localStorage.setItem('tc_company', form.company_name);
      navigate(user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Time Crunch</h1>
        <p style={styles.subtitle}>Track your time, simply.</p>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Company name</label>
          <input
            style={styles.input}
            type="text"
            value={form.company_name}
            onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
            autoFocus
            required
          />
          <label style={styles.label}>Username</label>
          <input
            style={styles.input}
            type="text"
            value={form.username}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            required
          />
          <label style={styles.label}>Password</label>
          <input
            style={styles.input}
            type="password"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            required
          />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <Link to="/forgot-password" style={styles.forgotLink}>Forgot password?</Link>
        </form>
        <p style={styles.registerLink}>
          New to Time Crunch? <Link to="/register" style={styles.link}>Create an account</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f6f9' },
  card: { background: '#fff', borderRadius: 12, padding: '40px 36px', width: '100%', maxWidth: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.10)' },
  title: { fontSize: 28, fontWeight: 700, marginBottom: 4, textAlign: 'center', color: '#1a56db' },
  subtitle: { textAlign: 'center', color: '#666', marginBottom: 28 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  label: { fontWeight: 600, fontSize: 14, color: '#444' },
  input: { padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, outline: 'none' },
  error: { color: '#e53e3e', fontSize: 14 },
  button: { marginTop: 8, padding: '12px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600 },
  registerLink: { marginTop: 20, textAlign: 'center', fontSize: 13, color: '#666' },
  link: { color: '#1a56db', fontWeight: 600, textDecoration: 'none' },
  forgotLink: { display: 'block', textAlign: 'right', fontSize: 13, color: '#6b7280', textDecoration: 'none', marginTop: 4 },
};
