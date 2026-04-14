const cron = require('node-cron');
const pool = require('../db');
const logger = require('../logger');
const { sendEmail } = require('../email');
const { runJob } = require('./runJob');
const { weekRange } = require('../utils/weekBounds');

const APP_URL = process.env.APP_URL || 'https://app.opsfloa.com';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emailHeader(title, subtitle) {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
    <div style="border-bottom:3px solid #92400e;padding-bottom:12px;margin-bottom:20px">
      <h2 style="color:#92400e;margin:0;font-size:20px">${title}</h2>
      ${subtitle ? `<p style="color:#6b7280;margin:4px 0 0;font-size:13px">${subtitle}</p>` : ''}
    </div>
  `;
}

function emailFooter() {
  return `
    <p style="margin-top:24px;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px">
      This is an automated report from <a href="${APP_URL}" style="color:#92400e">OpsFloa</a>.
      To stop receiving these emails, turn off scheduled reports in Administration → Company → Notifications.
    </p>
    </div>
  `;
}

function tableStyle() {
  return 'width:100%;border-collapse:collapse;margin:12px 0;font-size:14px';
}

function th(text, align = 'left') {
  return `<th style="text-align:${align};padding:8px 10px;background:#f9fafb;font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb">${text}</th>`;
}

function td(text, opts = {}) {
  const style = [
    'padding:8px 10px',
    'border-bottom:1px solid #f3f4f6',
    opts.align ? `text-align:${opts.align}` : '',
    opts.bold ? 'font-weight:700' : '',
    opts.mono ? 'font-family:monospace' : '',
    opts.color ? `color:${opts.color}` : '',
  ].filter(Boolean).join(';');
  return `<td style="${style}">${text}</td>`;
}

// Get the primary admin email for a company (first active admin with email)
async function getAdminEmail(companyId) {
  const r = await pool.query(
    `SELECT email, full_name FROM users
     WHERE company_id = $1 AND role IN ('admin','super_admin') AND active = true AND email IS NOT NULL
     ORDER BY role DESC LIMIT 1`,
    [companyId]
  );
  return r.rows[0] || null;
}

// Check if a feature flag is enabled for a company
async function settingEnabled(companyId, key) {
  const r = await pool.query(
    `SELECT value FROM settings WHERE company_id = $1 AND key = $2`,
    [companyId, key]
  );
  if (r.rowCount === 0) return false; // default off for all report keys
  return r.rows[0].value === '1';
}

// Get all active, billable companies
async function activeCompanies() {
  const r = await pool.query(
    `SELECT id, name FROM companies WHERE subscription_status IN ('trial','active','exempt')`
  );
  return r.rows;
}

// ── Weekly Payroll Summary (Mondays) ─────────────────────────────────────────

async function sendWeeklyPayrollReport(companyId, companyName) {
  // Previous full week per the company's week_start setting
  const wsRow = await pool.query("SELECT value FROM settings WHERE company_id = $1 AND key = 'week_start'", [companyId]);
  const ws = parseInt(wsRow.rows[0]?.value ?? '1', 10);
  const { from, to } = weekRange(ws, -1);

  const fmtDisplay = s => new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const r = await pool.query(
    `SELECT u.full_name, u.id as user_id,
            COUNT(te.id) AS entry_count,
            COALESCE(SUM(te.total_hours), 0) AS total_hours,
            COALESCE(SUM(te.overtime_hours), 0) AS overtime_hours
     FROM users u
     LEFT JOIN time_entries te ON te.user_id = u.id
       AND te.company_id = $1
       AND te.work_date BETWEEN $2 AND $3
     WHERE u.company_id = $1 AND u.role = 'worker' AND u.active = true
     GROUP BY u.id, u.full_name
     ORDER BY total_hours DESC`,
    [companyId, from, to]
  );

  if (r.rowCount === 0) return;

  const totalHours    = r.rows.reduce((s, row) => s + parseFloat(row.total_hours), 0);
  const totalOT       = r.rows.reduce((s, row) => s + parseFloat(row.overtime_hours), 0);
  const activeWorkers = r.rows.filter(row => parseFloat(row.total_hours) > 0).length;

  const rows = r.rows.map(row => {
    const hrs = parseFloat(row.total_hours);
    const ot  = parseFloat(row.overtime_hours);
    return `<tr>
      ${td(row.full_name, { bold: true })}
      ${td(row.entry_count)}
      ${td(hrs.toFixed(2), { align: 'right' })}
      ${td(ot > 0 ? `<span style="color:#d97706;font-weight:700">${ot.toFixed(2)}</span>` : '—', { align: 'right' })}
    </tr>`;
  }).join('');

  const admin = await getAdminEmail(companyId);
  if (!admin) return;

  await sendEmail(
    admin.email,
    `Weekly Payroll Summary — ${fmtDisplay(from)} to ${fmtDisplay(to)}`,
    emailHeader(
      'Weekly Payroll Summary',
      `${fmtDisplay(from)} – ${fmtDisplay(to)} · ${companyName}`
    ) +
    `<div style="display:flex;gap:24px;margin-bottom:20px;flex-wrap:wrap">
      <div style="background:#f0fdf4;border-radius:8px;padding:12px 18px;min-width:100px">
        <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase">Total Hours</div>
        <div style="font-size:22px;font-weight:800;color:#059669">${totalHours.toFixed(1)}</div>
      </div>
      <div style="background:#fff7ed;border-radius:8px;padding:12px 18px;min-width:100px">
        <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase">Overtime</div>
        <div style="font-size:22px;font-weight:800;color:#d97706">${totalOT.toFixed(1)}</div>
      </div>
      <div style="background:#eff6ff;border-radius:8px;padding:12px 18px;min-width:100px">
        <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase">Active Workers</div>
        <div style="font-size:22px;font-weight:800;color:#2563eb">${activeWorkers}</div>
      </div>
    </div>
    <table style="${tableStyle()}">
      <thead><tr>${th('Worker')}${th('Entries')}${th('Hours', 'right')}${th('Overtime', 'right')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:12px">
      <a href="${APP_URL}/admin#reports" style="color:#92400e;font-weight:600">View full reports in OpsFloa →</a>
    </p>` +
    emailFooter()
  );
}

// ── Weekly Low-Stock Report (Mondays) ─────────────────────────────────────────

async function sendWeeklyLowStockReport(companyId, companyName) {
  const r = await pool.query(
    `SELECT i.name, i.sku, i.unit, i.reorder_point, i.reorder_qty,
            COALESCE(SUM(s.quantity), 0) AS total_qty
     FROM inventory_items i
     LEFT JOIN inventory_stock s ON i.id = s.item_id
     WHERE i.company_id = $1 AND i.active = true AND i.reorder_point > 0
     GROUP BY i.id
     HAVING COALESCE(SUM(s.quantity), 0) <= i.reorder_point
     ORDER BY i.name`,
    [companyId]
  );

  if (r.rowCount === 0) return; // nothing to report — skip email

  const admin = await getAdminEmail(companyId);
  if (!admin) return;

  const rows = r.rows.map(row => {
    const qty  = parseFloat(row.total_qty);
    const rp   = parseFloat(row.reorder_point);
    const isOut = qty <= 0;
    return `<tr>
      ${td(row.name, { bold: true })}
      ${td(row.sku || '—', { mono: true, color: '#9ca3af' })}
      ${td(`${qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(2)} ${row.unit}`, { align: 'right', color: isOut ? '#dc2626' : '#d97706', bold: isOut })}
      ${td(rp, { align: 'right', color: '#6b7280' })}
      ${td(row.reorder_qty > 0 ? row.reorder_qty : '—', { align: 'right' })}
    </tr>`;
  }).join('');

  await sendEmail(
    admin.email,
    `Low Stock Alert — ${r.rowCount} item${r.rowCount !== 1 ? 's' : ''} below reorder point`,
    emailHeader(
      `Low Stock Report`,
      `${r.rowCount} item${r.rowCount !== 1 ? 's' : ''} at or below reorder point · ${companyName}`
    ) +
    `<table style="${tableStyle()}">
      <thead><tr>
        ${th('Item')}${th('SKU')}${th('On Hand', 'right')}${th('Reorder At', 'right')}${th('Reorder Qty', 'right')}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:12px">
      <a href="${APP_URL}/inventory#stock" style="color:#92400e;font-weight:600">View stock in OpsFloa →</a>
    </p>` +
    emailFooter()
  );
}

// ── Monthly Inventory Valuation (1st of month) ────────────────────────────────

async function sendMonthlyValuationReport(companyId, companyName) {
  const r = await pool.query(
    `SELECT i.name, i.sku, i.category, i.unit, i.unit_cost,
            COALESCE(SUM(s.quantity), 0) AS total_qty,
            COALESCE(SUM(s.quantity), 0) * COALESCE(i.unit_cost, 0) AS total_value
     FROM inventory_items i
     LEFT JOIN inventory_stock s ON i.id = s.item_id AND s.company_id = i.company_id
     WHERE i.company_id = $1 AND i.active = true
     GROUP BY i.id
     HAVING COALESCE(SUM(s.quantity), 0) != 0
     ORDER BY total_value DESC`,
    [companyId]
  );

  if (r.rowCount === 0) return;

  const grandTotal = r.rows.reduce((s, row) => s + parseFloat(row.total_value || 0), 0);
  const admin      = await getAdminEmail(companyId);
  if (!admin) return;

  const fmt = n => parseFloat(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const rows = r.rows.map(row => {
    const qty = parseFloat(row.total_qty);
    const val = parseFloat(row.total_value);
    return `<tr>
      ${td(row.name, { bold: true })}
      ${td(row.category || '—', { color: '#6b7280' })}
      ${td(`${qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(2)} ${row.unit}`, { align: 'right' })}
      ${td(row.unit_cost != null ? fmt(row.unit_cost) : '<em style="color:#9ca3af">not set</em>', { align: 'right' })}
      ${td(fmt(val), { align: 'right', bold: true })}
    </tr>`;
  }).join('');

  await sendEmail(
    admin.email,
    `Monthly Inventory Valuation — ${month}`,
    emailHeader(
      'Monthly Inventory Valuation',
      `${month} · ${companyName}`
    ) +
    `<div style="background:#f0fdf4;border-radius:8px;padding:14px 20px;margin-bottom:20px;display:inline-block">
      <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:4px">Total Inventory Value</div>
      <div style="font-size:28px;font-weight:800;color:#059669">${fmt(grandTotal)}</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:2px">${r.rowCount} item${r.rowCount !== 1 ? 's' : ''} with stock on hand</div>
    </div>
    <table style="${tableStyle()}">
      <thead><tr>
        ${th('Item')}${th('Category')}${th('On Hand', 'right')}${th('Unit Cost', 'right')}${th('Total Value', 'right')}
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:#f0fdf4;border-top:2px solid #d1fae5">
          <td colspan="4" style="padding:8px 10px;font-weight:700">Total</td>
          <td style="padding:8px 10px;text-align:right;font-weight:800;font-size:15px">${fmt(grandTotal)}</td>
        </tr>
      </tfoot>
    </table>
    <p style="margin-top:12px">
      <a href="${APP_URL}/inventory#valuation" style="color:#92400e;font-weight:600">View full valuation in OpsFloa →</a>
    </p>` +
    emailFooter()
  );
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

async function runWeeklyReports() {
  const companies = await activeCompanies();
  for (const { id, name } of companies) {
    const [payroll, lowStock] = await Promise.all([
      settingEnabled(id, 'report_weekly_payroll'),
      settingEnabled(id, 'report_weekly_low_stock'),
    ]);
    // Per-company catches so one company's failure doesn't skip the rest.
    if (payroll)   await sendWeeklyPayrollReport(id, name).catch(err => logger.error({ err, companyId: id }, 'weekly payroll report failed'));
    if (lowStock)  await sendWeeklyLowStockReport(id, name).catch(err => logger.error({ err, companyId: id }, 'weekly low-stock report failed'));
  }
}

async function runMonthlyReports() {
  const companies = await activeCompanies();
  for (const { id, name } of companies) {
    const valuation = await settingEnabled(id, 'report_monthly_valuation');
    if (valuation) await sendMonthlyValuationReport(id, name).catch(err => logger.error({ err, companyId: id }, 'monthly valuation report failed'));
  }
}

function startScheduledReportsJob() {
  // Weekly reports: every Monday at 7 AM server time
  cron.schedule('0 7 * * 1', () => runJob('weeklyReports', runWeeklyReports));
  // Monthly reports: 1st of every month at 7 AM server time
  cron.schedule('0 7 1 * *', () => runJob('monthlyReports', runMonthlyReports));
}

module.exports = { startScheduledReportsJob };
