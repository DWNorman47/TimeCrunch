import React, { useState } from 'react';
import api from '../api';

export default function ChangePassword({ onClose }) {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    if (form.new_password !== form.confirm_password) {
      setError('New passwords do not match');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      setSuccess(true);
      setTimeout(() => { setSuccess(false); onClose(); }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h3 style={styles.title}>Change Password</h3>
        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Current Password</label>
          <input style={styles.input} type="password" value={form.current_password} onChange={e => set('current_password', e.target.value)} required autoFocus />
          <label style={styles.label}>New Password</label>
          <input style={styles.input} type="password" value={form.new_password} onChange={e => set('new_password', e.target.value)} required minLength={6} />
          <label style={styles.label}>Confirm New Password</label>
          <input style={styles.input} type="password" value={form.confirm_password} onChange={e => set('confirm_password', e.target.value)} required />
          {error && <p style={styles.error}>{error}</p>}
          {success && <p style={styles.success}>Password changed!</p>}
          <div style={styles.buttons}>
            <button type="button" style={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" style={styles.saveBtn} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: '#fff', borderRadius: 12, padding: '32px 28px', width: '100%', maxWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' },
  title: { marginBottom: 20, fontSize: 18, fontWeight: 700 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  label: { fontSize: 13, fontWeight: 600, color: '#555' },
  input: { padding: '9px 11px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 },
  error: { color: '#e53e3e', fontSize: 13 },
  success: { color: '#38a169', fontSize: 13 },
  buttons: { display: 'flex', gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, padding: '10px', background: '#f0f0f0', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14 },
  saveBtn: { flex: 1, padding: '10px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14 },
};
