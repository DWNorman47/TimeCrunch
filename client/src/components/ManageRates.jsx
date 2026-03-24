import React, { useState, useEffect } from 'react';
import api from '../api';
import { currencySymbol } from '../utils';
import { useT } from '../hooks/useT';

const CURRENCIES = [
  { code: 'USD', name: 'USD — US Dollar' },
  { code: 'CAD', name: 'CAD — Canadian Dollar' },
  { code: 'EUR', name: 'EUR — Euro' },
  { code: 'GBP', name: 'GBP — British Pound' },
  { code: 'MXN', name: 'MXN — Mexican Peso' },
  { code: 'HNL', name: 'HNL — Honduran Lempira' },
  { code: 'GTQ', name: 'GTQ — Guatemalan Quetzal' },
  { code: 'NIO', name: 'NIO — Nicaraguan Córdoba' },
  { code: 'BZD', name: 'BZD — Belize Dollar' },
  { code: 'CRC', name: 'CRC — Costa Rican Colón' },
  { code: 'PAB', name: 'PAB — Panamanian Balboa' },
];

export default function ManageRates({ settings, onSettingsUpdated }) {
  const t = useT();
  const [form, setForm] = useState({
    prevailing_wage_rate: String(settings?.prevailing_wage_rate ?? 45),
    default_hourly_rate: String(settings?.default_hourly_rate ?? 30),
    overtime_multiplier: String(settings?.overtime_multiplier ?? 1.5),
    overtime_rule: settings?.overtime_rule ?? 'daily',
    overtime_threshold: String(settings?.overtime_threshold ?? 8),
    notification_inactive_days: String(settings?.notification_inactive_days ?? 3),
    notification_use_work_hours: settings?.notification_use_work_hours ?? true,
    notification_start_hour: String(settings?.notification_start_hour ?? 6),
    notification_end_hour: String(settings?.notification_end_hour ?? 20),
    chat_retention_days: String(settings?.chat_retention_days ?? 3),
    show_worker_wages: settings?.show_worker_wages ?? false,
    currency: settings?.currency ?? 'USD',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!settings) return;
    setForm({
      prevailing_wage_rate: String(settings.prevailing_wage_rate ?? 45),
      default_hourly_rate: String(settings.default_hourly_rate ?? 30),
      overtime_multiplier: String(settings.overtime_multiplier ?? 1.5),
      overtime_rule: settings.overtime_rule ?? 'daily',
      overtime_threshold: String(settings.overtime_threshold ?? 8),
      notification_inactive_days: String(settings.notification_inactive_days ?? 3),
      notification_use_work_hours: settings.notification_use_work_hours ?? true,
      notification_start_hour: String(settings.notification_start_hour ?? 6),
      notification_end_hour: String(settings.notification_end_hour ?? 20),
      chat_retention_days: String(settings.chat_retention_days ?? 3),
      show_worker_wages: settings.show_worker_wages ?? false,
      currency: settings.currency ?? 'USD',
    });
  }, [settings]);

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
        notification_use_work_hours: form.notification_use_work_hours,
        notification_start_hour: parseFloat(form.notification_start_hour),
        notification_end_hour: parseFloat(form.notification_end_hour),
        chat_retention_days: parseFloat(form.chat_retention_days),
        show_worker_wages: form.show_worker_wages,
        currency: form.currency,
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
    <form onSubmit={handleSave} style={styles.form}>

      {/* ── Wages ── */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionIcon}>💰</span>
          <div>
            <div style={styles.sectionTitle}>{t.ratesWages}</div>
            <div style={styles.sectionSub}>{t.ratesWagesDesc}</div>
          </div>
        </div>
        <div style={styles.sectionBody}>
          <div style={styles.row}>
            <label style={styles.label}>{t.ratesCurrency}</label>
            <div style={styles.inputGroup}>
              <select style={{ ...styles.input, width: 'auto', textAlign: 'left' }} value={form.currency} onChange={e => set('currency', e.target.value)}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div style={styles.row}>
            <label style={styles.label}>{t.ratesPrevailingWage}</label>
            <div style={styles.inputGroup}>
              <span style={styles.prefix}>{currencySymbol(form.currency)}</span>
              <input style={styles.input} type="number" min="0" step="0.01" value={form.prevailing_wage_rate} onChange={e => set('prevailing_wage_rate', e.target.value)} required />
              <span style={styles.suffix}>/hr</span>
            </div>
          </div>
          <div style={styles.row}>
            <label style={styles.label}>{t.ratesDefaultWage}</label>
            <div style={styles.inputGroup}>
              <span style={styles.prefix}>{currencySymbol(form.currency)}</span>
              <input style={styles.input} type="number" min="0" step="0.01" value={form.default_hourly_rate} onChange={e => set('default_hourly_rate', e.target.value)} required />
              <span style={styles.suffix}>/hr</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Overtime ── */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionIcon}>⏱️</span>
          <div>
            <div style={styles.sectionTitle}>{t.ratesOvertime}</div>
            <div style={styles.sectionSub}>{t.ratesOvertimeDesc}</div>
          </div>
        </div>
        <div style={styles.sectionBody}>
          <div style={styles.row}>
            <label style={styles.label}>{t.ratesOTRate}</label>
            <div style={styles.inputGroup}>
              <input style={styles.input} type="number" min="1" step="0.01" value={form.overtime_multiplier} onChange={e => set('overtime_multiplier', e.target.value)} required />
              <span style={styles.suffix}>{t.ratesXRegularPay}</span>
            </div>
          </div>
          <div style={styles.row}>
            <label style={styles.label}>{t.ratesCalcMethod}</label>
            <div style={styles.inputGroup}>
              <select style={{ ...styles.input, width: 'auto', textAlign: 'left' }} value={form.overtime_rule} onChange={e => set('overtime_rule', e.target.value)}>
                <option value="daily">{t.ratesDailyMethod}</option>
                <option value="weekly">{t.ratesWeeklyMethod}</option>
              </select>
            </div>
          </div>
          <div style={styles.row}>
            <label style={styles.label}>{form.overtime_rule === 'weekly' ? t.ratesWeeklyThreshold : t.ratesDailyThreshold}</label>
            <div style={styles.inputGroup}>
              <input style={styles.input} type="number" min="1" step="0.5" value={form.overtime_threshold} onChange={e => set('overtime_threshold', e.target.value)} required />
              <span style={styles.suffix}>{t.ratesHrs}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Notifications ── */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionIcon}>🔔</span>
          <div>
            <div style={styles.sectionTitle}>{t.ratesNotifications}</div>
            <div style={styles.sectionSub}>{t.ratesNotificationsDesc}</div>
          </div>
        </div>
        <div style={styles.sectionBody}>
          <div style={styles.row}>
            <label style={styles.label}>{t.ratesAlertInactive}</label>
            <div style={styles.inputGroup}>
              <input style={styles.input} type="number" min="1" max="30" step="1" value={form.notification_inactive_days} onChange={e => set('notification_inactive_days', e.target.value)} required />
              <span style={styles.suffix}>{t.ratesDays}</span>
            </div>
          </div>
          <div style={styles.row}>
            <label style={styles.label}>Alert outside work hours</label>
            <label style={styles.toggle}>
              <input type="checkbox" checked={form.notification_use_work_hours} onChange={e => set('notification_use_work_hours', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleTrack, background: form.notification_use_work_hours ? '#1a56db' : '#d1d5db' }}>
                <span style={{ ...styles.toggleThumb, transform: form.notification_use_work_hours ? 'translateX(18px)' : 'translateX(2px)' }} />
              </span>
            </label>
          </div>
          {form.notification_use_work_hours && (
            <div style={styles.row}>
              <label style={styles.label}>{t.ratesWorkHours}</label>
              <div style={styles.inputGroup}>
                <select style={styles.input} value={form.notification_start_hour} onChange={e => set('notification_start_hour', e.target.value)}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}</option>
                  ))}
                </select>
                <span style={styles.suffix}>–</span>
                <select style={styles.input} value={form.notification_end_hour} onChange={e => set('notification_end_hour', e.target.value)}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div style={styles.row}>
            <label style={styles.label}>{t.ratesClearChat}</label>
            <div style={styles.inputGroup}>
              <input style={styles.input} type="number" min="1" max="90" step="1" value={form.chat_retention_days} onChange={e => set('chat_retention_days', e.target.value)} required />
              <span style={styles.suffix}>{t.ratesDays}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Worker Access ── */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionIcon}>👁️</span>
          <div>
            <div style={styles.sectionTitle}>{t.ratesWorkerAccess}</div>
            <div style={styles.sectionSub}>{t.ratesWorkerAccessDesc}</div>
          </div>
        </div>
        <div style={styles.sectionBody}>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>{t.ratesShowWages}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{t.ratesShowWagesDesc}</div>
            </div>
            <label style={styles.toggle}>
              <input type="checkbox" checked={form.show_worker_wages} onChange={e => set('show_worker_wages', e.target.checked)} style={{ display: 'none' }} />
              <div style={{ ...styles.toggleTrack, background: form.show_worker_wages ? '#1a56db' : '#e5e7eb' }}>
                <div style={{ ...styles.toggleThumb, transform: form.show_worker_wages ? 'translateX(20px)' : 'translateX(2px)' }} />
              </div>
            </label>
          </div>
        </div>
      </div>

      {error && <p style={styles.error}>{error}</p>}
      <div style={styles.footer}>
        {saved && <span style={styles.savedMsg}>{t.ratesSettingsSaved}</span>}
        <button style={styles.saveBtn} type="submit" disabled={saving}>
          {saving ? t.saving : t.ratesSaveSettings}
        </button>
      </div>
    </form>
  );
}

const styles = {
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  section: { background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden' },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid #f3f4f6', background: '#fafafa' },
  sectionIcon: { fontSize: 20, lineHeight: 1 },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: '#111827' },
  sectionSub: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  sectionBody: { display: 'flex', flexDirection: 'column' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 20px', borderBottom: '1px solid #f9fafb' },
  label: { fontSize: 13, fontWeight: 500, color: '#374151' },
  inputGroup: { display: 'flex', alignItems: 'center', gap: 6 },
  prefix: { fontSize: 14, color: '#6b7280' },
  suffix: { fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' },
  toggle: { cursor: 'pointer', flexShrink: 0 },
  toggleTrack: { width: 44, height: 24, borderRadius: 12, transition: 'background 0.2s', position: 'relative' },
  toggleThumb: { position: 'absolute', top: 2, width: 20, height: 20, borderRadius: 10, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'transform 0.2s' },
  input: { width: 90, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 14, textAlign: 'right' },
  error: { color: '#e53e3e', fontSize: 13 },
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, paddingTop: 4 },
  savedMsg: { color: '#059669', fontSize: 13, fontWeight: 600 },
  saveBtn: { padding: '9px 22px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
};
