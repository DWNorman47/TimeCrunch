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

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(0) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

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
    module_field: settings?.module_field ?? false,
    feature_scheduling: settings?.feature_scheduling ?? true,
    feature_analytics: settings?.feature_analytics ?? true,
    feature_chat: settings?.feature_chat ?? true,
    feature_geolocation: settings?.feature_geolocation ?? true,
    module_timeclock: settings?.module_timeclock ?? true,
    module_projects: settings?.module_projects ?? true,
    module_inventory: settings?.module_inventory ?? false,
    module_analytics: settings?.module_analytics ?? false,
    feature_project_integration: settings?.feature_project_integration ?? true,
    feature_inactive_alerts: settings?.feature_inactive_alerts ?? true,
    feature_overtime_alerts: settings?.feature_overtime_alerts ?? true,
    feature_broadcast: settings?.feature_broadcast ?? true,
    feature_media_gallery: settings?.feature_media_gallery ?? false,
    show_worker_wages: settings?.show_worker_wages ?? false,
    global_required_checklist_template_id: settings?.global_required_checklist_template_id ?? '',
    currency: settings?.currency ?? 'USD',
    company_timezone: settings?.company_timezone ?? '',
    invoice_signature: settings?.invoice_signature ?? 'optional',
    default_temp_password: settings?.default_temp_password ?? '',
    cycle_count_audit_pct: String(settings?.cycle_count_audit_pct ?? 15),
    cycle_count_reconcile_threshold: String(settings?.cycle_count_reconcile_threshold ?? 0),
    cycle_count_reconcile_threshold_type: settings?.cycle_count_reconcile_threshold_type ?? 'units',
    media_retention_days: String(settings?.media_retention_days ?? 0),
    media_delete_on_project_archive: settings?.media_delete_on_project_archive ?? false,
    notify_timeoff_requests: settings?.notify_timeoff_requests ?? true,
    notify_budget_alerts: settings?.notify_budget_alerts ?? true,
    notify_entry_submitted: settings?.notify_entry_submitted ?? false,
    report_weekly_payroll: settings?.report_weekly_payroll ?? false,
    report_weekly_low_stock: settings?.report_weekly_low_stock ?? false,
    report_monthly_valuation: settings?.report_monthly_valuation ?? false,
  });
  const [prevailingEnabled, setPrevailingEnabled] = useState(() => (settings?.prevailing_wage_rate ?? 0) > 0);
  const [checklistTemplates, setChecklistTemplates] = useState([]);
  useEffect(() => {
    api.get('/safety-checklists/templates').then(r => setChecklistTemplates(r.data)).catch(() => {});
  }, []);
  const DEFAULT_COLLAPSED = { wages: true, overtime: true, notifications: true, reports: true, access: true, modules: true, features: true, storage: true };
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem('opsfloa_company_sections');
      return stored ? JSON.parse(stored) : DEFAULT_COLLAPSED;
    } catch { return DEFAULT_COLLAPSED; }
  });
  const toggleCollapse = key => setCollapsed(c => {
    const next = { ...c, [key]: !c[key] };
    localStorage.setItem('opsfloa_company_sections', JSON.stringify(next));
    return next;
  });
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
      module_field: settings.module_field ?? false,
      feature_scheduling: settings.feature_scheduling ?? true,
      feature_analytics: settings.feature_analytics ?? true,
      feature_chat: settings.feature_chat ?? true,
      feature_geolocation: settings.feature_geolocation ?? true,
      module_timeclock: settings.module_timeclock ?? true,
      module_projects: settings.module_projects ?? true,
      module_inventory: settings.module_inventory ?? false,
      module_analytics: settings.module_analytics ?? false,
      feature_project_integration: settings.feature_project_integration ?? true,
      feature_inactive_alerts: settings.feature_inactive_alerts ?? true,
      feature_overtime_alerts: settings.feature_overtime_alerts ?? true,
      feature_broadcast: settings.feature_broadcast ?? true,
      feature_media_gallery: settings.feature_media_gallery ?? false,
      show_worker_wages: settings.show_worker_wages ?? false,
      global_required_checklist_template_id: settings.global_required_checklist_template_id ?? '',
      currency: settings.currency ?? 'USD',
      company_timezone: settings.company_timezone ?? '',
      invoice_signature: settings.invoice_signature ?? 'optional',
      default_temp_password: settings.default_temp_password ?? '',
      cycle_count_audit_pct: String(settings.cycle_count_audit_pct ?? 15),
      cycle_count_reconcile_threshold: String(settings.cycle_count_reconcile_threshold ?? 0),
      cycle_count_reconcile_threshold_type: settings.cycle_count_reconcile_threshold_type ?? 'units',
      media_retention_days: String(settings.media_retention_days ?? 0),
      media_delete_on_project_archive: settings.media_delete_on_project_archive ?? false,
      notify_timeoff_requests: settings.notify_timeoff_requests ?? true,
      notify_budget_alerts: settings.notify_budget_alerts ?? true,
      notify_entry_submitted: settings.notify_entry_submitted ?? false,
      report_weekly_payroll: settings.report_weekly_payroll ?? false,
      report_weekly_low_stock: settings.report_weekly_low_stock ?? false,
      report_monthly_valuation: settings.report_monthly_valuation ?? false,
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
        module_field: form.module_field,
        feature_scheduling: form.feature_scheduling,
        feature_analytics: form.feature_analytics,
        feature_chat: form.feature_chat,
        feature_geolocation: form.feature_geolocation,
        module_timeclock: form.module_timeclock,
        module_projects: form.module_projects,
        module_inventory: form.module_inventory,
        module_analytics: form.module_analytics,
        feature_project_integration: form.feature_project_integration,
        feature_inactive_alerts: form.feature_inactive_alerts,
        feature_overtime_alerts: form.feature_overtime_alerts,
        feature_broadcast: form.feature_broadcast,
        feature_media_gallery: form.feature_media_gallery,
        show_worker_wages: form.show_worker_wages,
        global_required_checklist_template_id: form.global_required_checklist_template_id,
        currency: form.currency,
        company_timezone: form.company_timezone,
        invoice_signature: form.invoice_signature,
        default_temp_password: form.default_temp_password,
        cycle_count_audit_pct: isNaN(parseFloat(form.cycle_count_audit_pct)) ? 15 : parseFloat(form.cycle_count_audit_pct),
        cycle_count_reconcile_threshold: parseFloat(form.cycle_count_reconcile_threshold) || 0,
        cycle_count_reconcile_threshold_type: form.cycle_count_reconcile_threshold_type,
        media_retention_days: parseFloat(form.media_retention_days) || 0,
        media_delete_on_project_archive: form.media_delete_on_project_archive,
        notify_timeoff_requests: form.notify_timeoff_requests,
        notify_budget_alerts: form.notify_budget_alerts,
        notify_entry_submitted: form.notify_entry_submitted,
        report_weekly_payroll: form.report_weekly_payroll,
        report_weekly_low_stock: form.report_weekly_low_stock,
        report_monthly_valuation: form.report_monthly_valuation,
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
      <style>{`@media (max-width: 520px) { .invoice-sig-row { flex-wrap: wrap !important; } .invoice-sig-row select { width: 100% !important; margin-top: 6px; } }`}</style>

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
            <div>
              <div style={styles.label}>Track Inactive Workers</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Send alerts when workers haven't submitted entries</div>
            </div>
            <label style={{ ...styles.toggle, background: form.feature_inactive_alerts ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.feature_inactive_alerts} onChange={e => set('feature_inactive_alerts', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.feature_inactive_alerts ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          {form.feature_inactive_alerts && <div style={styles.row}>
            <label style={styles.label}>{t.ratesAlertInactive}</label>
            <div style={styles.inputGroup}>
              <input style={styles.input} type="number" min="1" max="30" step="1" value={form.notification_inactive_days} onChange={e => set('notification_inactive_days', e.target.value)} required />
              <span style={styles.suffix}>{t.ratesDays}</span>
            </div>
          </div>}
          {form.feature_inactive_alerts && <div style={styles.row}>
            <div>
              <div style={styles.label}>Work hours window</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Only send inactive alerts during these hours</div>
            </div>
            <label style={{ ...styles.toggle, background: form.notification_use_work_hours ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.notification_use_work_hours} onChange={e => set('notification_use_work_hours', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.notification_use_work_hours ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>}
          {form.feature_inactive_alerts && form.notification_use_work_hours && (
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
            <div>
              <div style={styles.label}>Overtime Alerts</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Notify admins when a worker crosses the overtime threshold</div>
            </div>
            <label style={{ ...styles.toggle, background: form.feature_overtime_alerts ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.feature_overtime_alerts} onChange={e => set('feature_overtime_alerts', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.feature_overtime_alerts ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>Time Off Request Notifications</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Email admins when a worker submits a time off request</div>
            </div>
            <label style={{ ...styles.toggle, background: form.notify_timeoff_requests ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.notify_timeoff_requests} onChange={e => set('notify_timeoff_requests', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.notify_timeoff_requests ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>Budget Alert Notifications</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Email admins when a project reaches 90% or 100% of its hour budget</div>
            </div>
            <label style={{ ...styles.toggle, background: form.notify_budget_alerts ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.notify_budget_alerts} onChange={e => set('notify_budget_alerts', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.notify_budget_alerts ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>Entry Submitted Notifications</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Email admins each time a worker submits a time entry</div>
            </div>
            <label style={{ ...styles.toggle, background: form.notify_entry_submitted ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.notify_entry_submitted} onChange={e => set('notify_entry_submitted', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.notify_entry_submitted ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
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

      {/* ── Scheduled Reports ── */}
      <div style={styles.section}>
        <div style={{ ...styles.sectionHeader, cursor: 'pointer' }} onClick={() => toggleCollapse('reports')}>
          <span style={styles.sectionIcon}>📧</span>
          <div style={{ flex: 1 }}>
            <div style={styles.sectionTitle}>Scheduled Email Reports</div>
            <div style={styles.sectionSub}>Automated email summaries sent to the primary admin. All off by default.</div>
          </div>
          <span style={styles.collapseChevron}>{collapsed.reports ? '▶' : '▼'}</span>
        </div>
        {!collapsed.reports && <div style={styles.sectionBody}>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>Weekly Payroll Summary</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Every Monday — total hours and overtime per worker for the prior week</div>
            </div>
            <label style={{ ...styles.toggle, background: form.report_weekly_payroll ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.report_weekly_payroll} onChange={e => set('report_weekly_payroll', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.report_weekly_payroll ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>Weekly Low-Stock Report</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Every Monday — items at or below their reorder point (skipped if none)</div>
            </div>
            <label style={{ ...styles.toggle, background: form.report_weekly_low_stock ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.report_weekly_low_stock} onChange={e => set('report_weekly_low_stock', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.report_weekly_low_stock ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>Monthly Inventory Valuation</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>1st of each month — full inventory value breakdown by item</div>
            </div>
            <label style={{ ...styles.toggle, background: form.report_monthly_valuation ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.report_monthly_valuation} onChange={e => set('report_monthly_valuation', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.report_monthly_valuation ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
        </div>}
        {!collapsed.reports && <SectionFooter section="reports" />}
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
              <div style={styles.label}>Default Temporary Password</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Auto-filled when creating a new worker</div>
            </div>
            <input
              style={{ ...styles.input, width: 180, textAlign: 'right' }}
              type="text"
              placeholder="e.g. Welcome1!"
              value={form.default_temp_password}
              onChange={e => set('default_temp_password', e.target.value)}
            />
          </div>
          <div className="invoice-sig-row" style={styles.row}>
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

      {/* ── Modules ── */}
      <div style={styles.section}>
        <div style={{ ...styles.sectionHeader, cursor: 'pointer' }} onClick={() => toggleCollapse('modules')}>
          <span style={styles.sectionIcon}>📦</span>
          <div style={{ flex: 1 }}>
            <div style={styles.sectionTitle}>Modules</div>
            <div style={styles.sectionSub}>Enable or disable entire app modules for all users</div>
          </div>
          <span style={styles.collapseChevron}>{collapsed.modules ? '▶' : '▼'}</span>
        </div>
        {!collapsed.modules && <div style={styles.sectionBody}>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>Time Clock</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Show the Time Clock app in the app switcher</div>
            </div>
            <label style={{ ...styles.toggle, background: form.module_timeclock ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.module_timeclock} onChange={e => set('module_timeclock', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.module_timeclock ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>{t.featField}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{t.featFieldDesc}</div>
            </div>
            <label style={{ ...styles.toggle, background: form.module_field ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.module_field} onChange={e => set('module_field', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.module_field ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>Projects</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Show the Projects module in the app switcher</div>
            </div>
            <label style={{ ...styles.toggle, background: form.module_projects ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.module_projects} onChange={e => {
                set('module_projects', e.target.checked);
                if (!e.target.checked) set('feature_project_integration', false);
              }} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.module_projects ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>Inventory</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Show the Inventory module in the app switcher</div>
            </div>
            <label style={{ ...styles.toggle, background: form.module_inventory ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.module_inventory} onChange={e => set('module_inventory', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.module_inventory ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          {form.module_inventory && (
            <>
              <div style={styles.row}>
                <div>
                  <div style={styles.label}>Cycle Count — Audit %</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Percentage of counted items randomly selected for audit (0–100)</div>
                </div>
                <input style={{ ...styles.input, width: 70 }} type="number" min="0" max="100" step="1"
                  value={form.cycle_count_audit_pct}
                  onChange={e => set('cycle_count_audit_pct', e.target.value)} />
              </div>
              <div style={styles.row}>
                <div>
                  <div style={styles.label}>Cycle Count — Reconcile Threshold</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Variance that triggers reconciliation (0 = never)</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input style={{ ...styles.input, width: 80 }} type="number" min="0" step="any"
                    value={form.cycle_count_reconcile_threshold}
                    onChange={e => set('cycle_count_reconcile_threshold', e.target.value)} />
                  <select style={{ ...styles.input, width: 90 }}
                    value={form.cycle_count_reconcile_threshold_type}
                    onChange={e => set('cycle_count_reconcile_threshold_type', e.target.value)}>
                    <option value="units">units</option>
                    <option value="pct">%</option>
                  </select>
                </div>
              </div>
            </>
          )}
          <div style={styles.row}>
            <div>
              <div style={styles.label}>Analytics</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Show the Analytics module in the app switcher</div>
            </div>
            <label style={{ ...styles.toggle, background: form.module_analytics ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.module_analytics} onChange={e => {
                set('module_analytics', e.target.checked);
                if (!e.target.checked) set('feature_analytics', false);
              }} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.module_analytics ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
        </div>}
        {!collapsed.modules && <SectionFooter section="modules" />}
      </div>

      {/* ── Features ── */}
      <div style={styles.section}>
        <div style={{ ...styles.sectionHeader, cursor: 'pointer' }} onClick={() => toggleCollapse('features')}>
          <span style={styles.sectionIcon}>🧩</span>
          <div style={{ flex: 1 }}>
            <div style={styles.sectionTitle}>{t.featuresTitle}</div>
            <div style={styles.sectionSub}>{t.featuresSubtitle}</div>
          </div>
          <span style={styles.collapseChevron}>{collapsed.features ? '▶' : '▼'}</span>
        </div>
        {!collapsed.features && <div style={styles.sectionBody}>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>Project Integration</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Require project selection on time entries and clock-in</div>
            </div>
            <label style={{ ...styles.toggle, background: form.feature_project_integration ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.feature_project_integration} onChange={e => set('feature_project_integration', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.feature_project_integration ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>{t.featScheduling}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{t.featSchedulingDesc}</div>
            </div>
            <label style={{ ...styles.toggle, background: form.feature_scheduling ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.feature_scheduling} onChange={e => set('feature_scheduling', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.feature_scheduling ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>{t.featAnalytics}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{t.featAnalyticsDesc}</div>
            </div>
            <label style={{ ...styles.toggle, background: form.feature_analytics ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.feature_analytics} onChange={e => set('feature_analytics', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.feature_analytics ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>{t.featChat}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{t.featChatDesc}</div>
            </div>
            <label style={{ ...styles.toggle, background: form.feature_chat ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.feature_chat} onChange={e => set('feature_chat', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.feature_chat ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>{t.featGeolocation}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{t.featGeolocationDesc}</div>
            </div>
            <label style={{ ...styles.toggle, background: form.feature_geolocation ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.feature_geolocation} onChange={e => set('feature_geolocation', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.feature_geolocation ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>Announce to All Workers</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Show broadcast message tool on the Live tab</div>
            </div>
            <label style={{ ...styles.toggle, background: form.feature_broadcast ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.feature_broadcast} onChange={e => set('feature_broadcast', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.feature_broadcast ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>Media Gallery</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Show a dedicated Media tab in Field for browsing all photos and videos</div>
            </div>
            <label style={{ ...styles.toggle, background: form.feature_media_gallery ? '#1a56db' : '#d1d5db' }}>
              <input type="checkbox" checked={form.feature_media_gallery} onChange={e => set('feature_media_gallery', e.target.checked)} style={{ display: 'none' }} />
              <span style={{ ...styles.toggleKnob, transform: form.feature_media_gallery ? 'translateX(46px)' : 'translateX(0)' }} />
            </label>
          </div>
          <div style={styles.row}>
            <div>
              <div style={styles.label}>Global Clock-in Checklist</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Require all workers to complete a safety checklist before clocking in (any project)</div>
            </div>
            <select
              style={{ ...styles.input, width: 'auto', textAlign: 'left', minWidth: 160 }}
              value={form.global_required_checklist_template_id}
              onChange={e => set('global_required_checklist_template_id', e.target.value)}
            >
              <option value="">None</option>
              {checklistTemplates.map(t => (
                <option key={t.id} value={String(t.id)}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>}
        {!collapsed.features && <SectionFooter section="features" />}
      </div>

      {/* ── Storage ── */}
      {(() => {
        const used = settings?.storage_bytes_used ?? 0;
        const limit = settings?.storage_limit_bytes ?? (500 * 1024 * 1024);
        const pct = Math.min(100, Math.round((used / limit) * 100));
        const nearLimit = pct >= 80;
        const atLimit = pct >= 100;
        return (
          <div style={styles.section}>
            <div style={{ ...styles.sectionHeader, cursor: 'pointer' }} onClick={() => toggleCollapse('storage')}>
              <span style={styles.sectionIcon}>💾</span>
              <div style={{ flex: 1 }}>
                <div style={styles.sectionTitle}>Storage</div>
                <div style={styles.sectionSub}>{formatBytes(used)} of {formatBytes(limit)} used</div>
              </div>
              <span style={styles.collapseChevron}>{collapsed.storage ? '▶' : '▼'}</span>
            </div>
            {!collapsed.storage && (
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: atLimit ? '#ef4444' : nearLimit ? '#d97706' : '#374151', fontWeight: 600 }}>
                  <span>{formatBytes(used)} used</span>
                  <span>{formatBytes(limit)} limit</span>
                </div>
                <div style={{ height: 10, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: atLimit ? '#ef4444' : nearLimit ? '#f59e0b' : '#1a56db', borderRadius: 99, transition: 'width 0.4s' }} />
                </div>
                {atLimit && (
                  <div style={{ fontSize: 13, color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, padding: '8px 12px' }}>
                    Storage limit reached. New photo and file uploads are blocked. Upgrade your plan to continue.
                  </div>
                )}
                {nearLimit && !atLimit && (
                  <div style={{ fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 7, padding: '8px 12px' }}>
                    Approaching storage limit. Consider upgrading your plan or deleting old media.
                  </div>
                )}
                <div style={{ fontSize: 12, color: '#9ca3af' }}>
                  Media includes field report photos, videos, and safety talk attachments.
                  Free plan: 500 MB · Starter: 5 GB · Business: 25 GB
                </div>
              </div>
            )}
            {!collapsed.storage && (
              <>
                <div style={styles.row}>
                  <div>
                    <div style={styles.label}>Auto-delete media after</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Automatically delete photos and attachments older than this many days</div>
                  </div>
                  {parseFloat(form.media_retention_days) === 0 ? (
                    <button
                      type="button"
                      style={{ padding: '7px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                      onClick={() => set('media_retention_days', '30')}
                    >
                      Turn on
                    </button>
                  ) : (
                    <div style={styles.inputGroup}>
                      <input
                        style={styles.input}
                        type="number"
                        min="1"
                        step="1"
                        value={form.media_retention_days}
                        onChange={e => set('media_retention_days', e.target.value)}
                      />
                      <span style={styles.suffix}>days</span>
                    </div>
                  )}
                </div>
                <div style={styles.row}>
                  <div>
                    <div style={styles.label}>Delete media on project archive</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>When a project is archived, permanently delete all its photos and attachments</div>
                  </div>
                  <label style={{ ...styles.toggle, background: form.media_delete_on_project_archive ? '#1a56db' : '#d1d5db' }}>
                    <input type="checkbox" checked={form.media_delete_on_project_archive} onChange={e => set('media_delete_on_project_archive', e.target.checked)} style={{ display: 'none' }} />
                    <span style={{ ...styles.toggleKnob, transform: form.media_delete_on_project_archive ? 'translateX(46px)' : 'translateX(0)' }} />
                  </label>
                </div>
                <SectionFooter section="storage" />
              </>
            )}
          </div>
        );
      })()}

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
