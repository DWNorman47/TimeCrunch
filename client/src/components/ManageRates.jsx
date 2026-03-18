import React, { useState } from 'react';
import api from '../api';

export default function ManageRates({ settings, onSettingsUpdated }) {
  const [form, setForm] = useState({
    prevailing_wage_rate: String(settings?.prevailing_wage_rate ?? 45),
    default_hourly_rate: String(settings?.default_hourly_rate ?? 30),
    overtime_multiplier: String(settings?.overtime_multiplier ?? 1.5),
    overtime_rule: settings?.overtime_rule ?? 'daily',
    overtime_threshold: String(settings?.overtime_threshold ?? 8),
    notification_inactive_days: String(settings?.notification_inactive_days ?? 3),
    notification_start_hour: String(settings?.notification_start_hour ?? 6),
    notification_end_hour: String(settings?.notification_end_hour ?? 20),
    chat_retention_days: String(settings?.chat_retention_days ?? 3),
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setSaved(false); setError(''); };

  const handleSave = async e => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const r = await api.patch('/admin/settings', {
        prevailing_wage_rate: parseFloat(form.prevailing_wage_rate),
        default_hourly_rate: parseFloat(form.default_hourly_rate),
        overtime_multiplier: parseFloat(form.overtime_multiplier),
        overtime_rule: form.overtime_rule,
        overtime_threshold: parseFloat(form.overtime_threshold),
        notification_inactive_days: parseFloat(form.notification_inactive_days),
        notification_start_hour: parseFloat(form.notification_start_hour),
        notification_end_hour: parseFloat(form.notification_end_hour),
        chat_retention_days: parseFloat(form.chat_retention_days),
      });
      onSettingsUpdated(r.data);
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.card}>
      <h3 style={styles.cardTitle}>Manage Rates</h3>
      <form onSubmit={handleSave} style={styles.form}>
        <div style={styles.row}>
          <label style={styles.label}>Prevailing Wage Rate</label>
          <div style={styles.inputGroup}>
            <span style={styles.prefix}>$</span>
            <input
              style={styles.input}
              type="number" min="0" step="0.01"
              value={form.prevailing_wage_rate}
              onChange={e => set('prevailing_wage_rate', e.target.value)}
              required
            />
            <span style={styles.suffix}>/hr</span>
          </div>
        </div>
        <div style={styles.row}>
          <label style={styles.label}>Default Employee Wage</label>
          <div style={styles.inputGroup}>
            <span style={styles.prefix}>$</span>
            <input
              style={styles.input}
              type="number" min="0" step="0.01"
              value={form.default_hourly_rate}
              onChange={e => set('default_hourly_rate', e.target.value)}
              required
            />
            <span style={styles.suffix}>/hr</span>
          </div>
        </div>
        <div style={styles.row}>
          <label style={styles.label}>Overtime Calculation</label>
          <div style={styles.inputGroup}>
            <input
              style={styles.input}
              type="number" min="1" step="0.01"
              value={form.overtime_multiplier}
              onChange={e => set('overtime_multiplier', e.target.value)}
              required
            />
            <span style={styles.suffix}>× regular pay</span>
          </div>
        </div>
        <div style={styles.divider} />
        <h4 style={styles.sectionTitle}>Overtime Rules</h4>
        <div style={styles.row}>
          <label style={styles.label}>Overtime method</label>
          <div style={styles.inputGroup}>
            <select style={{ ...styles.input, width: 'auto' }} value={form.overtime_rule} onChange={e => set('overtime_rule', e.target.value)}>
              <option value="daily">Daily (over X hrs/day)</option>
              <option value="weekly">Weekly (over X hrs/week)</option>
            </select>
          </div>
        </div>
        <div style={styles.row}>
          <label style={styles.label}>{form.overtime_rule === 'weekly' ? 'Weekly threshold' : 'Daily threshold'}</label>
          <div style={styles.inputGroup}>
            <input style={styles.input} type="number" min="1" step="0.5" value={form.overtime_threshold} onChange={e => set('overtime_threshold', e.target.value)} required />
            <span style={styles.suffix}>hrs</span>
          </div>
        </div>
        <div style={styles.divider} />
        <h4 style={styles.sectionTitle}>Notifications</h4>
        <div style={styles.row}>
          <label style={styles.label}>Alert if inactive for</label>
          <div style={styles.inputGroup}>
            <input style={styles.input} type="number" min="1" max="30" step="1" value={form.notification_inactive_days} onChange={e => set('notification_inactive_days', e.target.value)} required />
            <span style={styles.suffix}>days</span>
          </div>
        </div>
        <div style={styles.row}>
          <label style={styles.label}>Work hours start</label>
          <div style={styles.inputGroup}>
            <input style={styles.input} type="number" min="0" max="23" step="1" value={form.notification_start_hour} onChange={e => set('notification_start_hour', e.target.value)} required />
            <span style={styles.suffix}>:00</span>
          </div>
        </div>
        <div style={styles.row}>
          <label style={styles.label}>Work hours end</label>
          <div style={styles.inputGroup}>
            <input style={styles.input} type="number" min="0" max="23" step="1" value={form.notification_end_hour} onChange={e => set('notification_end_hour', e.target.value)} required />
            <span style={styles.suffix}>:00</span>
          </div>
        </div>
        <div style={styles.row}>
          <label style={styles.label}>Clear chat messages after</label>
          <div style={styles.inputGroup}>
            <input style={styles.input} type="number" min="1" max="90" step="1" value={form.chat_retention_days} onChange={e => set('chat_retention_days', e.target.value)} required />
            <span style={styles.suffix}>days</span>
          </div>
        </div>
        {error && <p style={styles.error}>{error}</p>}
        <div style={styles.footer}>
          {saved && <span style={styles.savedMsg}>Saved!</span>}
          <button style={styles.saveBtn} type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}

const styles = {
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 24 },
  cardTitle: { fontSize: 17, fontWeight: 700, marginBottom: 18 },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  label: { fontSize: 14, fontWeight: 500, color: '#374151', minWidth: 180 },
  inputGroup: { display: 'flex', alignItems: 'center', gap: 6 },
  prefix: { fontSize: 14, color: '#6b7280' },
  suffix: { fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' },
  input: { width: 90, padding: '7px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 14, textAlign: 'right' },
  error: { color: '#e53e3e', fontSize: 13 },
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 4 },
  savedMsg: { color: '#059669', fontSize: 13, fontWeight: 600 },
  saveBtn: { padding: '8px 20px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  divider: { borderTop: '1px solid #f0f0f0', margin: '4px 0' },
  sectionTitle: { fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 4 },
};
