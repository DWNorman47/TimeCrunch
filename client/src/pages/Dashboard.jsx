import React, { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ClockInOut from '../components/ClockInOut';
import TimeEntryForm from '../components/TimeEntryForm';
import EntryList from '../components/EntryList';
import UpcomingShifts from '../components/UpcomingShifts';
import CompanyChat from '../components/CompanyChat';
import AppSwitcher from '../components/AppSwitcher';
import NotificationBell from '../components/NotificationBell';
import { getT } from '../i18n';
import { langToLocale } from '../utils';
import api from '../api';
import { getOrFetch, setCached } from '../offlineDb';
import { useOffline } from '../contexts/OfflineContext';
import OfflineBanner from '../components/OfflineBanner';
import SignatureModal from '../components/SignatureModal';

// Secondary tabs — lazy-loaded on first visit
const TimesheetView    = lazy(() => import('../components/TimesheetView'));
const WorkerSummary    = lazy(() => import('../components/WorkerSummary'));
const TimesheetSignOff = lazy(() => import('../components/TimesheetSignOff'));
const TimeOffTab       = lazy(() => import('../components/TimeOffTab'));
const AvailabilityTab  = lazy(() => import('../components/AvailabilityTab'));
const WorkerSchedule   = lazy(() => import('../components/WorkerSchedule'));
const ReimbursementsView = lazy(() => import('../components/ReimbursementsView'));

function TabLoader() {
  return <div style={{ padding: '32px 0', textAlign: 'center', color: '#6b7280', fontSize: 14 }}>Loading…</div>;
}

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
  const [refreshError, setRefreshError] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [headerClock, setHeaderClock] = useState(null); // null=loading, false=not clocked in, {clock_in_time}=clocked in
  const [headerElapsed, setHeaderElapsed] = useState(0);
  const headerTimerRef = useRef(null);
  const TABS = ['clock', 'messages', 'timesheet', 'timeoff', 'schedule', 'reimbursements'];
  const hashTab = window.location.hash.replace('#', '');
  const [tab, setTab] = useState(TABS.includes(hashTab) ? hashTab : 'clock');
  const [entryView, setEntryView] = useState('list');
  const [shiftPrefill, setShiftPrefill] = useState(null);
  const [chatUnread, setChatUnread] = useState(false);

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
      setRefreshError(false);
    } catch {
      setRefreshError(true);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Fetch clock status for header timer (independent of ClockInOut component)
  useEffect(() => {
    api.get('/clock/status').then(r => setHeaderClock(r.data || false)).catch(() => setHeaderClock(false));
  }, []);

  // Tick header elapsed timer while clocked in
  useEffect(() => {
    clearInterval(headerTimerRef.current);
    if (headerClock && headerClock.clock_in_time) {
      const tick = () => setHeaderElapsed(Math.floor((Date.now() - new Date(headerClock.clock_in_time)) / 1000));
      tick();
      headerTimerRef.current = setInterval(tick, 1000);
    } else {
      setHeaderElapsed(0);
    }
    return () => clearInterval(headerTimerRef.current);
  }, [headerClock]);

  // When timeclock feature is off, redirect away from clock-only tabs
  useEffect(() => {
    if (settings && settings.module_timeclock === false && ['clock', 'messages', 'timesheet'].includes(tab)) {
      setTab('timeoff');
      history.replaceState(null, '', '#timeoff');
    }
  }, [settings]);

  // Re-fetch entries after offline queue syncs
  useEffect(() => {
    if (!onSync) return;
    return onSync(count => { if (count > 0) refreshEntries(); });
  }, [onSync]);

  // Background chat unread check (only when not on messages tab)
  useEffect(() => {
    if (tab === 'messages') return;
    const check = () => {
      api.get('/chat').then(r => {
        const lastRead = localStorage.getItem('chatLastRead');
        const hasUnread = r.data.some(
          m => m.sender_id !== user?.id && (!lastRead || new Date(m.created_at) > new Date(lastRead))
        );
        setChatUnread(hasUnread);
      }).catch(() => {});
    };
    check();
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, [tab, user?.id]);

  const handleEntryAdded = entry => {
    setEntries(prev => [entry, ...prev]);
    setHeaderClock(false); // worker clocked out
  };

  const handleClockedIn = clockStatus => {
    setHeaderClock(clockStatus); // worker clocked in
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
    const locale = langToLocale(user?.language);
    const fmtDate = d => new Date(d.substring(0, 10) + 'T00:00:00').toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const fmtDateShort = d => new Date(d.substring(0, 10) + 'T00:00:00').toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
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
    const invoiceDate = now.toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' });

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
        ? `<span style="background:#d97706;color:#fff;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:700">${t.prevailing}</span>`
        : `<span style="background:#2563eb;color:#fff;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:700">${t.regular}</span>`;
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
      regularHours > 0 ? `<tr><td>${t.regularHours}</td><td style="text-align:right">${fmtH(regularHours)}</td></tr>` : '',
      overtimeEnabled && overtimeHours > 0 ? `<tr><td>${t.overtimeHours}</td><td style="text-align:right">${fmtH(overtimeHours)}</td></tr>` : '',
      prevailingHours > 0 ? `<tr><td>${t.prevailingHours}</td><td style="text-align:right">${fmtH(prevailingHours)}</td></tr>` : '',
      `<tr style="border-top:1px solid #e5e7eb;font-weight:600"><td>${t.totalHours}</td><td style="text-align:right">${fmtH(totalHours)}</td></tr>`,
      workerRate > 0 && regularHours > 0 ? `<tr><td>${t.regularPay} (${fmtMoney(workerRate)}/hr)</td><td style="text-align:right">${fmtMoney(regularPay)}</td></tr>` : '',
      overtimeEnabled && overtimeHours > 0 && workerRate > 0 ? `<tr><td>${t.overtimePay} (${otMultiplier}×)</td><td style="text-align:right">${fmtMoney(overtimePay)}</td></tr>` : '',
      prevRate > 0 && prevailingHours > 0 ? `<tr><td>${t.prevailingPay} (${fmtMoney(prevRate)}/hr)</td><td style="text-align:right">${fmtMoney(prevailingPay)}</td></tr>` : '',
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
    <div class="brand-sub">${t.employeeTimeInvoice}</div>
  </div>
  <div>
    <div class="inv-title">${t.invoiceLabel}</div>
    <div class="inv-meta">
      ${t.pdfInvoiceNo}<strong>${invoiceNo}</strong><br>
      ${t.pdfInvoiceDate}<strong>${invoiceDate}</strong>
    </div>
  </div>
</div>

<div class="parties">
  <div>
    <div class="party-label">${t.from}</div>
    <div class="party-name">${workerName}</div>
    <div class="party-detail">${workerEmail}</div>
  </div>
  <div>
    <div class="party-label">${t.billTo}</div>
    <div class="party-detail">${billToLines.map((l, i) => i === 0 ? `<span class="party-name">${l}</span>` : l).join('<br>')}</div>
  </div>
</div>

<div class="period-bar">
  <span class="period-label">${t.payPeriod}</span>
  <span class="period-val">${periodStart} – ${periodEnd}</span>
</div>

<table>
  <thead><tr>
    <th>${t.date}</th>${showProject ? `<th>${t.project}</th>` : ''}<th>${t.descriptionLabel}</th><th>${t.clockIn}</th><th>${t.clockOut}</th>${showRateType ? `<th>${t.rateTypeLabel}</th>` : ''}<th style="text-align:right">${t.hours}</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>

<div class="summary-wrap">
  <div class="thank-you">
    ${t.thankYouInvoice}
  </div>
  <div class="sum-table">
    <table style="width:100%;border-collapse:collapse">
      ${sumRows}
      <tr class="total-row"><td>${t.totalDue}</td><td style="text-align:right">${totalPay > 0 ? fmtMoney(totalPay) : '—'}</td></tr>
    </table>
  </div>
</div>

${signatureDataUrl ? `
<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end">
  <div style="text-align:center">
    <img src="${signatureDataUrl}" style="height:60px;display:block;margin-bottom:4px" />
    <div style="font-size:11px;color:#9ca3af;border-top:1px solid #d1d5db;padding-top:4px;min-width:200px">${workerName} — ${t.pdfDigitalSignature}</div>
  </div>
</div>` : ''}

<div class="footer">
  <span>${t.pdfGeneratedBy}</span>
  <span>${invoiceDate}</span>
</div>

</body></html>`;

    win.document.write(html);
    win.document.close();
    win.print();
  };

  const fmtHeaderElapsed = secs => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
            {headerClock && <span style={styles.headerTimer} className="header-clock-timer-desktop">⏱ {fmtHeaderElapsed(headerElapsed)}</span>}
            <button style={styles.headerBtn} className="header-btn" onClick={logout}>{t.logout}</button>
          </div>
        </div>
        {user?.company_name && (
          <div className="company-name-row">
            <span className="company-name">{user.company_name}</span>
            {headerClock && <span className="header-clock-timer-mobile" style={styles.headerTimerMobile}>⏱ {fmtHeaderElapsed(headerElapsed)}</span>}
          </div>
        )}
      </header>

      {showSignatureModal && (
        <SignatureModal
          onConfirm={sig => { setShowSignatureModal(false); handleExportPDF(sig); }}
          onCancel={() => setShowSignatureModal(false)}
          required={(settings?.invoice_signature ?? 'optional') === 'required'}
        />
      )}

      <main style={styles.main} className="mobile-main">
        <div style={styles.tabs} className="tab-bar">
          {settings?.module_timeclock !== false && <button style={tab === 'clock' ? styles.tabActive : styles.tab} onClick={() => { setTab('clock'); history.replaceState(null, '', '#clock'); }}>{t.tabClock}</button>}
          {settings?.module_timeclock !== false && (
            <button
              style={tab === 'messages' ? styles.tabActive : styles.tab}
              onClick={() => {
                setTab('messages');
                history.replaceState(null, '', '#messages');
                setChatUnread(false);
                localStorage.setItem('chatLastRead', new Date().toISOString());
              }}
            >
              {t.tabMessages}{chatUnread && <span style={styles.unreadDot} />}
            </button>
          )}
          {settings?.module_timeclock !== false && <button style={tab === 'timesheet' ? styles.tabActive : styles.tab} onClick={() => { setTab('timesheet'); history.replaceState(null, '', '#timesheet'); }}>{t.tabTimesheet}</button>}
          <button style={tab === 'timeoff' ? styles.tabActive : styles.tab} onClick={() => { setTab('timeoff'); history.replaceState(null, '', '#timeoff'); }}>{t.tabTimeOff}</button>
          {settings?.feature_scheduling !== false && <button style={tab === 'schedule' ? styles.tabActive : styles.tab} onClick={() => { setTab('schedule'); history.replaceState(null, '', '#schedule'); }}>{t.tabSchedule}</button>}
          {settings?.feature_scheduling !== false && <button style={tab === 'availability' ? styles.tabActive : styles.tab} onClick={() => { setTab('availability'); history.replaceState(null, '', '#availability'); }}>{t.tabAvailability}</button>}
          <button style={tab === 'reimbursements' ? styles.tabActive : styles.tab} onClick={() => { setTab('reimbursements'); history.replaceState(null, '', '#reimbursements'); }}>{t.tabExpenses}</button>
        </div>

        {tab === 'messages' && <CompanyChat onRead={() => { setChatUnread(false); localStorage.setItem('chatLastRead', new Date().toISOString()); }} />}

        {tab === 'clock' && (
          <>
            <ClockInOut projects={projects} onEntryAdded={handleEntryAdded} onClockedIn={handleClockedIn} t={t} geolocationEnabled={settings?.feature_geolocation ?? false} projectsEnabled={settings?.feature_project_integration !== false} />
            <TimeEntryForm projects={projects} onEntryAdded={handleEntryAdded} t={t} prefill={shiftPrefill} projectsEnabled={settings?.feature_project_integration !== false} />
          </>
        )}

        {tab === 'timesheet' && (
          <Suspense fallback={<TabLoader />}>
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
                }}>⬇ {t.exportPDF}</button>
              )}
            </div>
            {refreshError && <p style={{ color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', fontSize: 13, margin: '0 0 8px' }}>{t.loadError} <button onClick={() => { setRefreshError(false); refreshEntries(); }} style={{ textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: '#b45309' }}>{t.retry}</button></p>}
            {loadError ? <p style={{ color: '#dc2626', padding: '12px' }}>{t.loadError} <button onClick={fetchData} style={{ textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>{t.retry}</button></p> : loading ? <p>{t.loadingEntries}</p> : entryView === 'timesheet' ? (
              <TimesheetView entries={entries} language={user?.language} projects={projects} onRefresh={refreshEntries} />
            ) : (
              <EntryList entries={entries} onDeleted={handleEntryDeleted} onUpdated={handleEntryUpdated} t={t} language={user?.language} currentUserId={user?.id} projects={projects} onRefresh={refreshEntries} />
            )}
          </Suspense>
        )}

        {tab === 'timeoff' && <Suspense fallback={<TabLoader />}><TimeOffTab /></Suspense>}

        {tab === 'availability' && <Suspense fallback={<TabLoader />}><AvailabilityTab /></Suspense>}

        {tab === 'schedule' && <Suspense fallback={<TabLoader />}><WorkerSchedule /></Suspense>}

        {tab === 'reimbursements' && <Suspense fallback={<TabLoader />}><ReimbursementsView /></Suspense>}

      </main>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#f4f6f9' },
  header: { background: '#1a56db', color: '#fff', padding: '0 24px', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 0, minHeight: 'calc(56px + env(safe-area-inset-top))', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'sticky', top: 0, zIndex: 100 },
  headerTopRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: 56 },
  logoGroup: { display: 'flex', alignItems: 'center', gap: 10 },
  logo: { fontWeight: 700, fontSize: 20 },
  companyName: { fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  userName: { fontSize: 14 },
  langSelect: { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '5px 8px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  headerBtn: { background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  headerTimer: { fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.15)', padding: '4px 10px', borderRadius: 6, fontVariantNumeric: 'tabular-nums' },
  headerTimerMobile: { fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 },
  main: { maxWidth: 700, margin: '24px auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 20 },
  tabs: { display: 'flex', gap: 4, background: '#e8edf5', borderRadius: 10, padding: 4, width: '100%' },
  tab: { flex: 1, padding: '14px 0', background: 'none', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 14, color: '#666', cursor: 'pointer', textAlign: 'center' },
  tabActive: { flex: 1, padding: '14px 0', background: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 14, color: '#1a56db', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', textAlign: 'center', position: 'relative' },
  unreadDot: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#ef4444', marginLeft: 4, verticalAlign: 'middle', flexShrink: 0 },
  timesheetToolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  viewToggle: { display: 'flex', gap: 4, background: '#e8edf5', borderRadius: 8, padding: 3, width: 'fit-content' },
  exportBtn: { background: 'none', border: '1px solid #d1d5db', color: '#374151', padding: '6px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  toggleBtn: { padding: '6px 14px', background: 'none', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, color: '#666', cursor: 'pointer' },
  toggleActive: { padding: '6px 14px', background: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, color: '#1a56db', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
};
