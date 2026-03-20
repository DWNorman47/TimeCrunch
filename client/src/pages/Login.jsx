import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';

function getSavedCompanies() {
  try { return JSON.parse(localStorage.getItem('tc_companies') || '[]'); } catch { return []; }
}

function saveCompany(name) {
  const list = getSavedCompanies().filter(c => c.toLowerCase() !== name.toLowerCase());
  localStorage.setItem('tc_companies', JSON.stringify([name, ...list]));
}

const OTHER = '__other__';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionExpired = searchParams.get('session') === 'expired';
  const savedCompanies = getSavedCompanies();
  const [selected, setSelected] = useState(savedCompanies[0] || OTHER);
  const [otherText, setOtherText] = useState('');
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [unconfirmedEmail, setUnconfirmedEmail] = useState('');
  const [resentConfirmation, setResentConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);

  const companyName = selected === OTHER ? otherText : selected;

  const handleSubmit = async e => {
    e.preventDefault();
    if (!companyName.trim()) return;
    setError('');
    setLoading(true);
    try {
      const user = await login(form.username, form.password, companyName.trim());
      saveCompany(companyName.trim());
      if (user.role === 'admin') {
        const key = `tc_visited_${user.id}`;
        const firstTime = !localStorage.getItem(key);
        localStorage.setItem(key, '1');
        navigate(firstTime ? '/administration' : '/admin');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      const data = err.response?.data;
      if (data?.error === 'email_not_confirmed') {
        setUnconfirmedEmail(data.email || '');
        setError('Please confirm your email before signing in.');
      } else {
        setUnconfirmedEmail('');
        setError(data?.error || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>OpsFloa</h1>
        <p style={styles.subtitle}>Track your time, simply.</p>
        {sessionExpired && (
          <p style={styles.sessionMsg}>Your session expired. Please sign in again.</p>
        )}
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Company name</label>
          {savedCompanies.length > 0 ? (
            <>
              <select
                style={styles.input}
                value={selected}
                onChange={e => setSelected(e.target.value)}
              >
                {savedCompanies.map(c => <option key={c} value={c}>{c}</option>)}
                <option value={OTHER}>— Other company —</option>
              </select>
              {selected === OTHER && (
                <input
                  style={styles.input}
                  type="text"
                  placeholder="Enter company name"
                  value={otherText}
                  onChange={e => setOtherText(e.target.value)}
                  autoFocus
                  required
                />
              )}
            </>
          ) : (
            <input
              style={styles.input}
              type="text"
              value={otherText}
              onChange={e => setOtherText(e.target.value)}
              autoFocus
              required
            />
          )}
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
          {error && (
            <div>
              <p style={styles.error}>{error}</p>
              {unconfirmedEmail && (
                <button
                  type="button"
                  style={styles.resendBtn}
                  onClick={() => {
                    api.post('/auth/resend-confirmation', { email: unconfirmedEmail })
                      .then(() => setResentConfirmation(true));
                  }}
                >
                  {resentConfirmation ? 'Sent! Check your inbox.' : 'Resend confirmation email'}
                </button>
              )}
            </div>
          )}
          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <Link to="/forgot-password" style={styles.forgotLink}>Forgot password?</Link>
        </form>
        <p style={styles.registerLink}>
          New to OpsFloa? <Link to="/register" style={styles.link}>Create an account</Link>
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
  sessionMsg: { background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 8 },
  button: { marginTop: 8, padding: '12px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600 },
  registerLink: { marginTop: 20, textAlign: 'center', fontSize: 13, color: '#666' },
  link: { color: '#1a56db', fontWeight: 600, textDecoration: 'none' },
  forgotLink: { display: 'block', textAlign: 'right', fontSize: 13, color: '#6b7280', textDecoration: 'none', marginTop: 4 },
  resendBtn: { background: 'none', border: 'none', color: '#1a56db', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0', textDecoration: 'underline' },
};
