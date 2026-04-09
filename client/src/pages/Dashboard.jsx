import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ClockInOut from '../components/ClockInOut';
import TimeEntryForm from '../components/TimeEntryForm';
import EntryList from '../components/EntryList';
import TimesheetView from '../components/TimesheetView';
import UpcomingShifts from '../components/UpcomingShifts';
import WorkerSummary from '../components/WorkerSummary';
import ChangePassword from '../components/ChangePassword';
import MFASetup from '../components/MFASetup';
import PayStubView from '../components/PayStubView';
import NotificationSetup from '../components/NotificationSetup';
import TimesheetSignOff from '../components/TimesheetSignOff';
import CompanyChat from '../components/CompanyChat';
import AppSwitcher from '../components/AppSwitcher';
import NotificationBell from '../components/NotificationBell';
import { getT } from '../i18n';
import api from '../api';
import { getOrFetch, setCached } from '../offlineDb';
import { useOffline } from '../contexts/OfflineContext';
import OfflineBanner from '../components/OfflineBanner';
import SignatureModal from '../components/SignatureModal';
import TimeOffTab from '../components/TimeOffTab';
import WorkerSchedule from '../components/WorkerSchedule';
import ReimbursementsView from '../components/ReimbursementsView';
import MyCount from '../components/MyCount';

const isPwa = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export default function Dashboard() {
  const { user, logout, updateUser } = useAuth();
  const { onSync } = useOffline() || {};
  const t = getT(user?.language);
  const [entries, setEntries] = useState([]);
  const [projects, setProjects] = useState([]);
  const [settings, setSettings] = useState(null);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const TABS = ['clock', 'messages', 'timesheet', 'timeoff', 'schedule', 'reimbursements', 'mycount', 'account'];
  const hashTab = window.location.hash.replace('#', '');
  const [tab, setTab] = useState(TABS.includes(hashTab) ? hashTab : 'clock');
  const [entryView, setEntryView] = useState('list');
  const [shiftPrefill, setShiftPrefill] = useState(null);

  const handleFillFromShift = shift => {
    setShiftPrefill(shift);
    setTab('clock');
  };

  const fetchData = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [entries, projects, settings, ci] = await Promise.all([
        getOrFetch('entries', () => api.get('/time-entries').then(r => r.data)),
        getOrFetch('projects', () => api.get('/projects').then(r => r.data)),
        getOrFetch('settings', () => api.get('/settings').then(r => r.data)),
        api.get('/company-info').then(r => r.data).catch(() => ({})),
      ]);
      setEntries(entries);
      setProjects(projects);
      setSettings(settings);
      setCompanyInfo(ci);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const refreshEntries = async () => {
    try {
      const data = await api.get('/time-entries').then(r => r.data);
      await setCached('entries', data);
      setEntries(data);
    } catch {}
  };

  useEffect(() => { fetchData(); }, []);

  // When timeclock feature is off, redirect away from clock-only tabs
  useEffect(() => {
    if (settings && settings.module_timeclock === false && tab !== 'account') {
      setTab('account');
      window.location.hash = 'account';
    }
  }, [settings]);

  // Re-fetch entries after offline queue syncs
  useEffect(() => {
    if (!onSync) return;
    return onSync(count => { if (count > 0) refreshEntries(); });
  }, [onSync]);

  const handleEntryAdded = entry => {
    setEntries(prev => [entry, ...prev]);
  };
  const handleEntryDeleted = id => setEntries(prev => prev.filter(e => e.id !== id));
  const handleEntryUpdated = entry => setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, ...entry } : e));

  const handleExportPDF = (signatureDataUrl) => {
    const win = window.open('', '_blank');
    const workerName = user?.full_name || '';
    const workerEmail = user?.email || '';
    let sorted = [...entries].sort((a, b) => a.work_date.localeCompare(b.work_date));

    // Free plan: export is limited to the latest completed Mon–Sun week
    if (settings?.plan === 'free' && settings?.subscription_status !== 'trial') {
      const today = new Date();
      const dow = today.getDay();
      const lastSun = new Date(today); lastSun.setDate(today.getDate() - (dow === 0 ? 7 : dow));
      const lastMon = new Date(lastSun); lastMon.setDate(lastSun.getDate() - 6);
      const ws = lastMon.toLocaleDateString('en-CA');
      const we = lastSun.toLocaleDateString('en-CA');
      sorted = sorted.filter(e => { const d = String(e.work_date).substring(0, 10); return d >= ws && d <= we; });
    }

    const fmtTime = s => { const [h, m] = s.split(':'); const hr = parseInt(h); return `${hr % 12 || 12}:${m} ${hr < 12 ? 'AM' : 'PM'}`; };
    const fmtDate = d => new Date(d.substring(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const fmtDateShort = d => new Date(d.substring(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const fmtH = h => { const wh = Math.floor(h); const wm = Math.round((h - wh) * 60); return wm > 0 ? `${wh}h ${wm}m` : `${wh}h`; };
    const fmtMoney = v => `$${v.toFixed(2)}`;

    // Pay period
    const dates = sorted.map(e => e.work_date);
    const periodStart = dates.length ? fmtDateShort(dates[0]) : '—';
    const periodEnd = dates.length ? fmtDateShort(dates[dates.length - 1]) : '—';

    // Invoice metadata
    const now = new Date();
    const pad2 = n => String(n).padStart(2, '0');
    const invoiceNo = `INV-${now.getFullYear()}${pad2(now.getMonth()+1)}${pad2(now.getDate())}-${String(Date.now()).slice(-5)}`;
    const invoiceDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Company info (Bill To)
    const ci = companyInfo || {};
    const billToLines = [
      ci.name || user?.company_name || '',
      ci.address || '',
      ci.phone || '',
      ci.contact_email || '',
    ].filter(Boolean);

    // Feature flags
    const showProject = settings?.feature_project_integration !== false;
    const overtimeEnabled = settings?.feature_overtime !== false;

    // Rates
    const workerRate = parseFloat(user?.hourly_rate) || parseFloat(settings?.default_hourly_rate) || 0;
    const prevRate = parseFloat(settings?.prevailing_wage_rate) || 0;
    const showRateType = prevRate > 0;
    const otMultiplier = parseFloat(settings?.overtime_multiplier) || 1.5;
    const otRule = settings?.overtime_rule || 'daily';
    const otThreshold = parseFloat(settings?.overtime_threshold) || 8;

    // For weekly OT: track cumulative regular hours per ISO week
    const weeklyAccum = {};
    const getWeekKey = dateStr => {
      const d = new Date(dateStr.substring(0, 10) + 'T00:00:00');
      const day = d.getDay();
      const monday = new Date(d); monday.setDate(d.getDate() - ((day + 6) % 7));
      return monday.toLocaleDateString('en-CA');
    };

    // Build table rows + accumulate totals
    let regularHours = 0, overtimeHours = 0, prevailingHours = 0;
    let regularPay = 0, overtimePay = 0, prevailingPay = 0;

    const rows = sorted.map(e => {
      let ms = new Date(`1970-01-01T${e.end_time}`) - new Date(`1970-01-01T${e.start_time}`);
      if (ms < 0) ms += 86400000;
      const h = Math.max(0, ms / 3600000 - (e.break_minutes || 0) / 60);
      const isPrev = e.wage_type === 'prevailing';

      if (isPrev) {
        prevailingHours += h;
        prevailingPay += h * prevRate;
      } else if (overtimeEnabled) {
        let regH = 0, otH = 0;
        if (otRule === 'daily') {
          regH = Math.min(h, otThreshold);
          otH = Math.max(0, h - otThreshold);
        } else {
          const wk = getWeekKey(e.work_date);
          const prior = weeklyAccum[wk] || 0;
          weeklyAccum[wk] = prior + h;
          if (prior >= otThreshold) { otH = h; }
          else if (prior + h > otThreshold) { regH = otThreshold - prior; otH = h - regH; }
          else { regH = h; }
        }
        regularHours += regH;
        overtimeHours += otH;
        regularPay += regH * workerRate;
        overtimePay += otH * workerRate * otMultiplier;
      } else {
        regularHours += h;
        regularPay += h * workerRate;
      }

      const badge = isPrev
        ? `<span style="background:#d97706;color:#fff;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:700">Prevailing</span>`
        : `<span style="background:#2563eb;color:#fff;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:700">Regular</span>`;
      return `<tr>
        <td>${fmtDate(e.work_date)}</td>
        ${showProject ? `<td>${e.project_name || '—'}</td>` : ''}
        <td style="color:#6b7280">${e.notes || ''}</td>
        <td>${fmtTime(e.start_time)}</td>
        <td>${fmtTime(e.end_time)}</td>
        ${showRateType ? `<td>${badge}</td>` : ''}
        <td style="text-align:right;font-weight:600">${fmtH(h)}</td>
      </tr>`;
    }).join('');

    const totalHours = regularHours + overtimeHours + prevailingHours;
    const totalPay = regularPay + overtimePay + prevailingPay;

    // Summary rows
    const sumRows = [
      regularHours > 0 ? `<tr><td>Regular Hours</td><td style="text-align:right">${fmtH(regularHours)}</td></tr>` : '',
      overtimeEnabled && overtimeHours > 0 ? `<tr><td>Overtime Hours</td><td style="text-align:right">${fmtH(overtimeHours)}</td></tr>` : '',
      prevailingHours > 0 ? `<tr><td>Prevailing Hours</td><td style="text-align:right">${fmtH(prevailingHours)}</td></tr>` : '',
      `<tr style="border-top:1px solid #e5e7eb;font-weight:600"><td>Total Hours</td><td style="text-align:right">${fmtH(totalHours)}</td></tr>`,
      workerRate > 0 && regularHours > 0 ? `<tr><td>Regular Pay (${fmtMoney(workerRate)}/hr)</td><td style="text-align:right">${fmtMoney(regularPay)}</td></tr>` : '',
      overtimeEnabled && overtimeHours > 0 && workerRate > 0 ? `<tr><td>Overtime Pay (${otMultiplier}×)</td><td style="text-align:right">${fmtMoney(overtimePay)}</td></tr>` : '',
      prevRate > 0 && prevailingHours > 0 ? `<tr><td>Prevailing Pay (${fmtMoney(prevRate)}/hr)</td><td style="text-align:right">${fmtMoney(prevailingPay)}</td></tr>` : '',
    ].filter(Boolean).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice — ${workerName}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;color:#111;font-size:13px;padding:40px;background:#fff}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px}
.brand{font-size:22px;font-weight:800;color:#1a56db}
.brand-sub{font-size:12px;color:#6b7280;margin-top:2px}
.inv-title{font-size:32px;font-weight:800;color:#111;text-align:right}
.inv-meta{text-align:right;margin-top:6px;line-height:1.8;font-size:13px;color:#6b7280}
.inv-meta strong{color:#111;margin-left:6px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:28px;padding-bottom:24px;border-bottom:2px solid #e5e7eb}
.party-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:8px}
.party-name{font-size:15px;font-weight:700;color:#111;margin-bottom:4px}
.party-detail{font-size:12px;color:#6b7280;line-height:1.7}
.period-bar{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 16px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center}
.period-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#3b82f6}
.period-val{font-size:14px;font-weight:700;color:#1d4ed8}
table{width:100%;border-collapse:collapse;margin-bottom:28px}
th{background:#f9fafb;padding:9px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;border-bottom:2px solid #e5e7eb}
td{padding:9px 10px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;vertical-align:middle}
tr:last-child td{border-bottom:none}
.summary-wrap{display:grid;grid-template-columns:1fr 320px;gap:32px;margin-bottom:24px}
.thank-you{font-size:12px;color:#6b7280;line-height:1.8;padding-top:8px}
.sum-table{border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:13px}
.sum-table tr td{padding:9px 14px;border-bottom:1px solid #f3f4f6}
.sum-table tr:last-child td{border-bottom:none}
.total-row{background:#1a56db;color:#fff!important;font-weight:700;font-size:14px}
.total-row td{color:#fff!important;padding:11px 14px}
.footer{border-top:1px solid #e5e7eb;padding-top:14px;display:flex;justify-content:space-between;font-size:11px;color:#9ca3af}
@media print{body{padding:20px}}
</style></head><body>

<div class="header">
  <div>
    <div class="brand">Ops Flow Assist</div>
    <div class="brand-sub">Employee Time Invoice</div>
  </div>
  <div>
    <div class="inv-title">INVOICE</div>
    <div class="inv-meta">
      Invoice #:<strong>${invoiceNo}</strong><br>
      Invoice Date:<strong>${invoiceDate}</strong>
    </div>
  </div>
</div>

<div class="parties">
  <div>
    <div class="party-label">From</div>
    <div class="party-name">${workerName}</div>
    <div class="party-detail">${workerEmail}</div>
  </div>
  <div>
    <div class="party-label">Bill To</div>
    <div class="party-detail">${billToLines.map((l, i) => i === 0 ? `<span class="party-name">${l}</span>` : l).join('<br>')}</div>
  </div>
</div>

<div class="period-bar">
  <span class="period-label">Pay Period</span>
  <span class="period-val">${periodStart} – ${periodEnd}</span>
</div>

<table>
  <thead><tr>
    <th>Date</th>${showProject ? '<th>Project</th>' : ''}<th>Description</th><th>Clock In</th><th>Clock Out</th>${showRateType ? '<th>Rate Type</th>' : ''}<th style="text-align:right">Hours</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>

<div class="summary-wrap">
  <div class="thank-you">
    Thank you for reviewing this invoice.<br>
    Please approve all time entries in OpsFloa<br>
    and process payment at your earliest convenience.
  </div>
  <div class="sum-table">
    <table style="width:100%;border-collapse:collapse">
      ${sumRows}
      <tr class="total-row"><td>Total Due</td><td style="text-align:right">${totalPay > 0 ? fmtMoney(totalPay) : '—'}</td></tr>
    </table>
  </div>
</div>

${signatureDataUrl ? `
<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end">
  <div style="text-align:center">
    <img src="${signatureDataUrl}" style="height:60px;display:block;margin-bottom:4px" />
    <div style="font-size:11px;color:#9ca3af;border-top:1px solid #d1d5db;padding-top:4px;min-width:200px">${workerName} — Digital Signature</div>
  </div>
</div>` : ''}

<div class="footer">
  <span>Generated by Ops Flow Assist</span>
  <span>${invoiceDate}</span>
</div>

</body></html>`;

    win.document.write(html);
    win.document.close();
    win.print();
  };

  const handleLanguageChange = async lang => {
    try {
      await api.post('/auth/update-language', { language: lang });
      updateUser({ language: lang });
    } catch {}
  };

  return (
    <div style={styles.page}>
      <OfflineBanner />
      <header style={styles.header} className="app-header">
        <div style={styles.headerTopRow}>
          <div style={styles.logoGroup}>
            <AppSwitcher currentApp="timeclock" userRole={user?.role} features={settings} />
            {user?.company_name && <span style={styles.companyName} className="company-name-desktop">{user.company_name}</span>}
          </div>
          <div style={styles.headerRight} className="header-right">
            <NotificationBell />
            {isPwa && <button style={styles.headerBtn} className="header-btn" onClick={() => window.location.reload()}>↻</button>}
            <span style={styles.userName} className="header-username">{user.full_name}</span>
            <select style={styles.langSelect} value={user?.language || 'English'} onChange={e => handleLanguageChange(e.target.value)}>
              <option value="English" style={{ color: '#111827', background: '#fff' }}>EN</option>
              <option value="Spanish" style={{ color: '#111827', background: '#fff' }}>ES</option>
            </select>
            <button style={styles.headerBtn} className="header-btn" onClick={logout}>{t.logout}</button>
          </div>
        </div>
        {user?.company_name && <div className="company-name-row"><span className="company-name">{user.company_name}</span></div>}
      </header>

      {showChangePassword && <ChangePassword onClose={() => setShowChangePassword(false)} t={t} />}
      {showSignatureModal && (
        <SignatureModal
          onConfirm={sig => { setShowSignatureModal(false); handleExportPDF(sig); }}
          onCancel={() => setShowSignatureModal(false)}
          required={(settings?.invoice_signature ?? 'optional') === 'required'}
        />
      )}

      <main style={styles.main} className="mobile-main">
        <div style={styles.tabs} className="tab-bar">
          {settings?.module_timeclock !== false && <button style={tab === 'clock' ? styles.tabActive : styles.tab} onClick={() => { setTab('clock'); window.location.hash = 'clock'; }}>🕐 Clock</button>}
          {settings?.module_timeclock !== false && <button style={tab === 'messages' ? styles.tabActive : styles.tab} onClick={() => { setTab('messages'); window.location.hash = 'messages'; }}>💬 Messages</button>}
          {settings?.module_timeclock !== false && <button style={tab === 'timesheet' ? styles.tabActive : styles.tab} onClick={() => { setTab('timesheet'); window.location.hash = 'timesheet'; }}>📋 Timesheet</button>}
          <button style={tab === 'timeoff' ? styles.tabActive : styles.tab} onClick={() => { setTab('timeoff'); window.location.hash = 'timeoff'; }}>🏖 Time Off</button>
          {settings?.feature_scheduling !== false && <button style={tab === 'schedule' ? styles.tabActive : styles.tab} onClick={() => { setTab('schedule'); window.location.hash = 'schedule'; }}>📅 Schedule</button>}
          <button style={tab === 'reimbursements' ? styles.tabActive : styles.tab} onClick={() => { setTab('reimbursements'); window.location.hash = 'reimbursements'; }}>💳 Expenses</button>
          {settings?.module_inventory !== false && <button style={tab === 'mycount' ? styles.tabActive : styles.tab} onClick={() => { setTab('mycount'); window.location.hash = 'mycount'; }}>📦 My Count</button>}
          <button style={tab === 'account' ? styles.tabActive : styles.tab} onClick={() => { setTab('account'); window.location.hash = 'account'; }}>👤 Account</button>
        </div>

        {tab === 'messages' && <CompanyChat />}

        {tab === 'clock' && (
          <>
            <ClockInOut projects={projects} onEntryAdded={handleEntryAdded} t={t} geolocationEnabled={settings?.feature_geolocation ?? false} projectsEnabled={settings?.feature_project_integration !== false} />
            <TimeEntryForm projects={projects} onEntryAdded={handleEntryAdded} t={t} prefill={shiftPrefill} projectsEnabled={settings?.feature_project_integration !== false} />
          </>
        )}

        {tab === 'timesheet' && (
          <>
            <UpcomingShifts onFillEntry={handleFillFromShift} />
            {!loading && <WorkerSummary entries={entries} hourlyRate={user?.hourly_rate} rateType={user?.rate_type ?? 'hourly'} overtimeMultiplier={settings?.overtime_multiplier ?? 1.5} prevailingRate={settings?.prevailing_wage_rate ?? 0} overtimeEnabled={settings?.feature_overtime ?? true} overtimeRule={settings?.overtime_rule ?? 'daily'} overtimeThreshold={settings?.overtime_threshold ?? 8} showWages={settings?.show_worker_wages ?? false} currency={settings?.currency ?? 'USD'} />}
            <TimesheetSignOff t={t} />
            <div style={styles.timesheetToolbar}>
              <div style={styles.viewToggle}>
                <button style={entryView === 'timesheet' ? styles.toggleActive : styles.toggleBtn} onClick={() => setEntryView('timesheet')}>{t.timesheetView}</button>
                <button style={entryView === 'list' ? styles.toggleActive : styles.toggleBtn} onClick={() => setEntryView('list')}>{t.listView}</button>
              </div>
              {!loading && entries.length > 0 && (
                <button style={styles.exportBtn} onClick={() => {
                  if ((settings?.invoice_signature ?? 'optional') === 'none') handleExportPDF(null);
                  else setShowSignatureModal(true);
                }}>⬇ Export PDF</button>
              )}
            </div>
            {loadError ? <p style={{ color: '#dc2626', padding: '12px' }}>{t.loadError} <button onClick={fetchData} style={{ textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>{t.retry}</button></p> : loading ? <p>{t.loadingEntries}</p> : entryView === 'timesheet' ? (
              <TimesheetView entries={entries} language={user?.language} projects={projects} onRefresh={refreshEntries} />
            ) : (
              <EntryList entries={entries} onDeleted={handleEntryDeleted} onUpdated={handleEntryUpdated} t={t} language={user?.language} currentUserId={user?.id} projects={projects} onRefresh={refreshEntries} />
            )}
          </>
        )}

        {tab === 'timeoff' && <TimeOffTab />}

        {tab === 'schedule' && <WorkerSchedule />}

        {tab === 'reimbursements' && <ReimbursementsView />}

        {tab === 'mycount' && <MyCount />}

        {tab === 'account' && (
          <>
            <NotificationSetup />
            <div style={styles.accountCard} className="mobile-card">
              <div style={styles.accountRow}>
                <div>
                  <div style={styles.accountLabel}>Password</div>
                  <div style={styles.accountSub}>Change your login password</div>
                </div>
                <button style={styles.accountBtn} onClick={() => setShowChangePassword(true)}>Change Password</button>
              </div>
            </div>
            <MFASetup />
            <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '8px 0 4px' }}>
              Need help? Email us at <a href="mailto:info@opsfloa.com" style={{ color: '#1a56db' }}>info@opsfloa.com</a>
            </div>
            {!loading && (settings?.show_worker_wages ?? false) && <PayStubView user={user} settings={settings} companyInfo={companyInfo} />}
          </>
        )}
      </main>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#f4f6f9' },
  header: { background: '#1a56db', color: '#fff', padding: '0 24px', paddingTop: 'env(safe-area-inset-top)', height: 'calc(56px + env(safe-area-inset-top))', display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  headerTopRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  logoGroup: { display: 'flex', alignItems: 'center', gap: 10 },
  logo: { fontWeight: 700, fontSize: 20 },
  companyName: { fontSize: 14, fontWeight: 400, opacity: 0.75 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  userName: { fontSize: 14 },
  langSelect: { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '5px 8px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  headerBtn: { background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, fontWeight: 600 },
  main: { maxWidth: 700, margin: '24px auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 20 },
  tabs: { display: 'flex', gap: 4, background: '#e8edf5', borderRadius: 10, padding: 4, width: '100%' },
  tab: { flex: 1, padding: '14px 0', background: 'none', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 14, color: '#666', cursor: 'pointer', textAlign: 'center' },
  tabActive: { flex: 1, padding: '14px 0', background: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 14, color: '#1a56db', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', textAlign: 'center' },
  timesheetToolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  viewToggle: { display: 'flex', gap: 4, background: '#e8edf5', borderRadius: 8, padding: 3, width: 'fit-content' },
  exportBtn: { background: 'none', border: '1px solid #d1d5db', color: '#374151', padding: '6px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  toggleBtn: { padding: '6px 14px', background: 'none', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, color: '#666', cursor: 'pointer' },
  toggleActive: { padding: '6px 14px', background: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, color: '#1a56db', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  accountCard: { background: '#fff', borderRadius: 12, padding: '14px 18px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' },
  accountRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  accountLabel: { fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 2 },
  accountSub: { fontSize: 12, color: '#6b7280' },
  accountBtn: { background: 'none', border: '1px solid #d1d5db', color: '#374151', padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
};
