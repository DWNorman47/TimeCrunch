import React, { useState, useEffect } from 'react';
import api from '../api';
import { currencySymbol } from '../utils';
import { useT } from '../hooks/useT';

const TIMEZONES = [
  { value: 'America/New_York',    label: 'Eastern Time (ET)' },
  { value: 'America/Chicago',     label: 'Central Time (CT)' },
  { value: 'America/Denver',      label: 'Mountain Time (MT)' },
  { value: 'America/Phoenix',     label: 'Arizona (MST, no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage',   label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii (HST)' },
  { value: 'America/Puerto_Rico', label: 'Puerto Rico (AST)' },
  { value: 'America/Mexico_City', label: 'Mexico City (CST)' },
  { value: 'America/Tijuana',     label: 'Tijuana (PST)' },
  { value: 'America/Monterrey',   label: 'Monterrey (CST)' },
  { value: 'America/Tegucigalpa', label: 'Honduras (CST)' },
  { value: 'America/Guatemala',   label: 'Guatemala (CST)' },
  { value: 'America/Managua',     label: 'Nicaragua (CST)' },
  { value: 'America/Belize',      label: 'Belize (CST)' },
  { value: 'America/Costa_Rica',  label: 'Costa Rica (CST)' },
  { value: 'America/Panama',      label: 'Panama (EST)' },
  { value: 'America/Bogota',      label: 'Colombia (COT)' },
  { value: 'America/Lima',        label: 'Peru (PET)' },
  { value: 'America/Santiago',    label: 'Chile (CLT)' },
  { value: 'America/Buenos_Aires', label: 'Argentina (ART)' },
  { value: 'America/Sao_Paulo',   label: 'Brazil — São Paulo (BRT)' },
  { value: 'America/Toronto',     label: 'Toronto (ET)' },
  { value: 'America/Vancouver',   label: 'Vancouver (PT)' },
  { value: 'Europe/London',       label: 'London (GMT/BST)' },
  { value: 'Europe/Paris',        label: 'Paris (CET)' },
  { value: 'Europe/Berlin',       label: 'Berlin (CET)' },
  { value: 'Europe/Madrid',       label: 'Madrid (CET)' },
  { value: 'Asia/Dubai',          label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata',        label: 'India (IST)' },
  { value: 'Asia/Tokyo',          label: 'Japan (JST)' },
  { value: 'Asia/Shanghai',       label: 'China (CST)' },
  { value: 'Australia/Sydney',    label: 'Sydney (AEST)' },
  { value: 'Pacific/Auckland',    label: 'New Zealand (NZST)' },
  { value: 'UTC',                 label: 'UTC' },
];

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
    prevailing_wage_rate: String(settings?.prevailing_wage_rate ?? 0),
    default_hourly_rate: String(settings?.default_hourly_rate ?? 30),
    overtime_multiplier: String(settings?.overtime_multiplier ?? 1.5),
    overtime_rule: settings?.overtime_rule ?? 'daily',
    overtime_threshold: String(settings?.overtime_threshold ?? 8),
    notification_inactive_days: String(settings?.notification_inactive_days ?? 3),
    notification_use_work_hours: settings?.notification_use_work_hours ?? true,
    notification_start_hour: String(settings?.notification_start_hour ?? 6),
    notification_end_hour: String(settings?.notification_end_hour ?? 20),
    chat_retention_days: String(settings?.chat_retention_days ?? 3),
    feature_overtime: settings?.feature_overtime ?? true,
    feature_field: settings?.feature_field ?? true,
    show_worker_wages: settings?.show_worker_wages ?? false,
    currency: settings?.currency ?? 'USD',
    company_timezone: settings?.company_timezone ?? '',
    invoice_signature: settings?.invoice_signature ?? 'optional',
  });
  const [prevailingEnabled, setPrevailingEnabled] = useState(() => (settings?.prevailing_wage_rate ?? 0) > 0);
  const [collapsed, setCollapsed] = useState({});
  const toggleCollapse = key => setCollapsed(c => ({ ...c, [key]: !c[key] }));
  const [saving, setSaving] = useState(null); // section key or null
  const [saved, setSaved] = useState(null);   // section key or null
  const [error, setError] = useState('');

  useEffect(() => {
    if (!settings) return;
    setPrevailingEnabled((settings.prevailing_wage_rate ?? 0) > 0);
    setForm({
      prevailing_wage_rate: String(settings.prevailing_wage_rate ?? 0),
      default_hourly_rate: String(settings.default_hourly_rate ?? 30),
      overtime_multiplier: String(settings.overtime_multiplier ?? 1.5),
      overtime_rule: settings.overtime_rule ?? 'daily',
      overtime_threshold: String(settings.overtime_threshold ?? 8),
      notification_inactive_days: String(settings.notification_inactive_days ?? 3),
      notification_use_work_hours: settings.notification_use_work_hours ?? true,
      notification_start_hour: String(settings.notification_start_hour ?? 6),
      notification_end_hour: String(settings.notification_end_hour ?? 20),
      chat_retention_days: String(settings.chat_retention_days ?? 3),
      feature_overtime: settings.feature_overtime ?? true,
      feature_field: settings.feature_field ?? true,
      show_worker_wages: settings.show_worker_wages ?? false,
      currency: settings.currency ?? 'USD',
      company_timezone: settings.company_timezone ?? '',
      invoice_signature: settings.invoice_signature ?? 'optional',
    });
  }, [settings]);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setSaved(null); setError(''); };

  const saveSection = async (section) => {
    setSaving(section); setError('');
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
        feature_overtime: form.feature_overtime,
        feature_field: form.feature_field,
        show_worker_wages: form.show_worker_wages,
        currency: form.currency,
        company_timezone: form.company_timezone,
        invoice_signature: form.invoice_signature,
      });
      onSettingsUpdated(r.data);
      setSaved(section);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(null);
    }
  };

  const SectionFooter = ({ section }) => (
    <div style={styles.sectionFooter}>
      {saved === section && <span style={styles.savedMsg}>{t.ratesSettingsSaved}</span>}
      {error && saving === null && <span style={styles.errorMsg}>{error}</span>}
      <button
        style={styles.saveBtn}
        type="button"
        disabled={saving === section}
        onClick={() => saveSection(section)}
      >
        {saving === section ? t.saving : t.ratesSaveSettings}
      </button>
    </div>
  );

  return (
    <div style={styles.form}>

      {/* ── Wages ── */}
      <div style={styles.section}>
        <div style={{ ...styles.sectionHeader, cursor: 'pointer' }} onClick={() => toggleCollapse('wages')}>
          <span style={styles.sectionIcon}>💰</span>
          <div style={{ flex: 1 }}>
            <div style={styles.sectionTitle}>{t.ratesWages}</div>
            <div style={styles.sectionSub}>{t.ratesWagesDesc}</div>
          </div>
          <span style={styles.collapseChevron}>{collapsed.wages ? '▶' : '▼'}</span>
        </div>
        {!collapsed.wages && <div style={styles.sectionBody}>
          <div style={styles.row}>
            <label style={styles.label}>{t.ratesCurrency}</label>
            <div style={styles.inputGroup}>
              <select style={{ ...styles.input, width: 'auto', textAlign: 'left' }} value={form.currency} onChange={e => set('currency', e.target.value)}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div style={styles.row}>
            <label style={styles.label}>Company Timezone</label>
            <div style={styles.inputGroup}>
              <select style={{ ...styles.input, width: 'auto', textAlign: 'left' }} value={form.company_timezone} onChange={e => set('company_timezone', e.target.value)}>
                <option value="">(Use browser timezone)</option>
                {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </div>
          </div>
          <div style={styles.row}>
            <label style={styles.label}>{t.ratesPrevailingWage}</label>
            {!prevailingEnabled
              ? <button style={styles.addPrevBtn} type="button" onClick={() => { setPrevailingEnabled(true); set('prevailing_wage_rate', '0'); }}>+ Add</button>
              : <div style={styles.inputGroup}>
                  <span style={styles.prefix}>{currencySymbol(form.currency)}</span>
                  <input style={styles.input} type="number" min="0" step="0.01" value={form.prevailing_wage_rate} onChange={e => set('prevailing_wage_rate', e.target.value)} required />
                  <span style={styles.suffix}>/hr</span>
                </div>
            }
          </div>
          <div style={styles.row}>
            <label style={styles.label}>{t.ratesDefaultWage}</label>
            <div style={styles.inputGroup}>
              <span style={styles.prefix}>{currencySymbol(form.currency)}</span>
              <input style={styles.input} type="number" min="0" step="0.01" value={form.default_hourly_rate} onChange={e => set('default_hourly_rate', e.target.value)} required />
              <span style={styles.suffix}>/hr</span>
            </div>
          </div>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>Allow Overtime</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Track and display overtime hours and pay</div>
            </div>
            <label style={{ ...styles.toggle, background: form.feature_overtime ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.feature_overtime} onChange={e => set('feature_overtime', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.feature_overtime ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
        </div>}
        {!collapsed.wages && <SectionFooter section="wages" />}
      </div>

      {/* ── Overtime ── */}
      {form.feature_overtime && <div style={styles.section}>
        <div style={{ ...styles.sectionHeader, cursor: 'pointer' }} onClick={() => toggleCollapse('overtime')}>
          <span style={styles.sectionIcon}>⏱️</span>
          <div style={{ flex: 1 }}>
            <div style={styles.sectionTitle}>{t.ratesOvertime}</div>
            <div style={styles.sectionSub}>{t.ratesOvertimeDesc}</div>
          </div>
          <span style={styles.collapseChevron}>{collapsed.overtime ? '▶' : '▼'}</span>
        </div>
        {!collapsed.overtime && <div style={styles.sectionBody}>
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
        </div>}
        {!collapsed.overtime && <SectionFooter section="overtime" />}
      </div>}

      {/* ── Notifications ── */}
      <div style={styles.section}>
        <div style={{ ...styles.sectionHeader, cursor: 'pointer' }} onClick={() => toggleCollapse('notifications')}>
          <span style={styles.sectionIcon}>🔔</span>
          <div style={{ flex: 1 }}>
            <div style={styles.sectionTitle}>{t.ratesNotifications}</div>
            <div style={styles.sectionSub}>{t.ratesNotificationsDesc}</div>
          </div>
          <span style={styles.collapseChevron}>{collapsed.notifications ? '▶' : '▼'}</span>
        </div>
        {!collapsed.notifications && <div style={styles.sectionBody}>
          <div style={styles.row}>
            <label style={styles.label}>{t.ratesAlertInactive}</label>
            <div style={styles.inputGroup}>
              <input style={styles.input} type="number" min="1" max="30" step="1" value={form.notification_inactive_days} onChange={e => set('notification_inactive_days', e.target.value)} required />
              <span style={styles.suffix}>{t.ratesDays}</span>
            </div>
          </div>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>Work hours window</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Only send inactive alerts during these hours</div>
            </div>
            <label style={{ ...styles.toggle, background: form.notification_use_work_hours ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.notification_use_work_hours} onChange={e => set('notification_use_work_hours', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.notification_use_work_hours ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          {form.notification_use_work_hours && (
            <div style={styles.row}>
              <label style={styles.label}>Hours range</label>
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
        </div>}
        {!collapsed.notifications && <SectionFooter section="notifications" />}
      </div>

      {/* ── Worker Access ── */}
      <div style={styles.section}>
        <div style={{ ...styles.sectionHeader, cursor: 'pointer' }} onClick={() => toggleCollapse('access')}>
          <span style={styles.sectionIcon}>👁️</span>
          <div style={{ flex: 1 }}>
            <div style={styles.sectionTitle}>{t.ratesWorkerAccess}</div>
            <div style={styles.sectionSub}>{t.ratesWorkerAccessDesc}</div>
          </div>
          <span style={styles.collapseChevron}>{collapsed.access ? '▶' : '▼'}</span>
        </div>
        {!collapsed.access && <div style={styles.sectionBody}>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>{t.ratesShowWages}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{t.ratesShowWagesDesc}</div>
            </div>
            <label style={{ ...styles.toggle, background: form.show_worker_wages ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.show_worker_wages} onChange={e => set('show_worker_wages', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.show_worker_wages ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>{t.featField}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{t.featFieldDesc}</div>
            </div>
            <label style={{ ...styles.toggle, background: form.feature_field ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.feature_field} onChange={e => set('feature_field', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.feature_field ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>Invoice Digital Signature</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Whether workers must sign invoices before exporting</div>
            </div>
            <select
              style={{ ...styles.input, width: 'auto', textAlign: 'left' }}
              value={form.invoice_signature}
              onChange={e => set('invoice_signature', e.target.value)}
            >
              <option value="none">None — export without prompt</option>
              <option value="optional">Optional — worker can skip</option>
              <option value="required">Required — must sign to export</option>
            </select>
          </div>
        </div>}
        {!collapsed.access && <SectionFooter section="access" />}
      </div>

    </div>
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
  sectionFooter: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '12px 20px', borderTop: '1px solid #f3f4f6', background: '#fafafa' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 20px', borderBottom: '1px solid #f9fafb' },
  label: { fontSize: 13, fontWeight: 500, color: '#374151' },
  inputGroup: { display: 'flex', alignItems: 'center', gap: 6 },
  prefix: { fontSize: 14, color: '#6b7280' },
  suffix: { fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' },
  toggle: { display: 'flex', alignItems: 'center', width: 70, height: 40, borderRadius: 7, border: 'none', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0, padding: 4 },
  toggleKnob: { display: 'block', width: 16, height: 32, borderRadius: 5, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'transform 0.2s', flexShrink: 0 },
  input: { width: 90, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 14, textAlign: 'right' },
  savedMsg: { color: '#059669', fontSize: 13, fontWeight: 600 },
  errorMsg: { color: '#e53e3e', fontSize: 13 },
  saveBtn: { padding: '7px 18px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  addPrevBtn: { padding: '6px 14px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  collapseChevron: { fontSize: 11, color: '#6b7280' },
};
