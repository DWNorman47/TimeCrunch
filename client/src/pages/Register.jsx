import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ company_name: '', first_name: '', middle_name: '', last_name: '', email: '', username: '', password: '' });
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(null); // email address waiting for confirmation

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleNameChange = (k, v) => {
    const updated = { ...form, [k]: v };
    setForm(f => {
      const next = { ...f, [k]: v };
      if (!usernameEdited) {
        const first = k === 'first_name' ? v : f.first_name;
        const last = k === 'last_name' ? v : f.last_name;
        const suggested = (first.charAt(0) + last).toLowerCase().replace(/[^a-z0-9]/g, '');
        next.username = suggested;
      }
      return next;
    });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const full_name = [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(' ');
    try {
      const r = await api.post('/auth/register', { ...form, full_name });
      if (r.data.pending_confirmation) { setConfirming(r.data.email); return; }
      login(r.data.token, r.data.user);
      navigate('/admin');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setSaving(false);
    }
  };

  if (confirming) return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.logo}>Time Crunch</h1>
        <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 12 }}>📧</div>
        <h2 style={styles.title}>Check your email</h2>
        <p style={{ color: '#666', fontSize: 14, textAlign: 'center', marginBottom: 16 }}>
          We sent a confirmation link to <strong>{confirming}</strong>. Click it to activate your account.
        </p>
        <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center' }}>
          Didn't get it? Check your spam folder or{' '}
          <button style={{ background: 'none', border: 'none', color: '#1a56db', fontWeight: 600, cursor: 'pointer', fontSize: 13, padding: 0 }}
            onClick={() => api.post('/auth/resend-confirmation', { email: confirming })}>
            resend
          </button>.
        </p>
      </div>
    </div>
  );

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.logo}>Time Crunch</h1>
        <h2 style={styles.title}>Create your account</h2>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Company name</label>
          <input
            style={styles.input}
            placeholder="Acme Construction"
            value={form.company_name}
            onChange={e => set('company_name', e.target.value)}
            required
          />
          <label style={styles.label}>First name</label>
          <input
            style={styles.input}
            placeholder="Jane"
            value={form.first_name}
            onChange={e => handleNameChange('first_name', e.target.value)}
            required
          />
          <label style={styles.label}>Middle name <span style={styles.hint}>(optional)</span></label>
          <input
            style={styles.input}
            placeholder="Lee"
            value={form.middle_name}
            onChange={e => set('middle_name', e.target.value)}
          />
          <label style={styles.label}>Last name</label>
          <input
            style={styles.input}
            placeholder="Smith"
            value={form.last_name}
            onChange={e => handleNameChange('last_name', e.target.value)}
            required
          />
          <label style={styles.label}>Email</label>
          <input
            style={styles.input}
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={e => set('email', e.target.value)}
            required
          />
          <label style={styles.label}>Username</label>
          <input
            style={styles.input}
            placeholder="jsmith"
            value={form.username}
            autoComplete="off"
            onChange={e => { setUsernameEdited(!!e.target.value); set('username', e.target.value); }}
            required
          />
          <label style={styles.label}>Password</label>
          <input
            style={styles.input}
            type="password"
            placeholder="At least 6 characters"
            value={form.password}
            onChange={e => set('password', e.target.value)}
            required
            minLength={6}
          />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.btn} type="submit" disabled={saving}>
            {saving ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p style={styles.loginLink}>
          Already have an account? <Link to="/login" style={styles.link}>Log in</Link>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#f4f6f9', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  card: { background: '#fff', borderRadius: 14, padding: '40px 36px', boxShadow: '0 4px 24px rgba(0,0,0,0.09)', width: '100%', maxWidth: 400 },
  logo: { fontSize: 22, fontWeight: 800, color: '#1a56db', marginBottom: 4, textAlign: 'center' },
  title: { fontSize: 18, fontWeight: 700, color: '#1a202c', marginBottom: 24, textAlign: 'center' },
  form: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151', marginTop: 8 },
  input: { padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 },
  error: { color: '#e53e3e', fontSize: 13, margin: '4px 0 0' },
  btn: { marginTop: 16, padding: '11px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  loginLink: { marginTop: 20, textAlign: 'center', fontSize: 13, color: '#666' },
  link: { color: '#1a56db', fontWeight: 600, textDecoration: 'none' },
  hint: { fontWeight: 400, color: '#9ca3af', fontSize: 12 },
};
