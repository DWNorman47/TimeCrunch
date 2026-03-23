import React, { useState, useEffect } from 'react';
import api from '../api';
import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer';
import ProjectBillPDF from './ProjectBillPDF';
import { fmtHours, formatCurrency } from '../utils';

function downloadCSV(rows, filename) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function defaultDates() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 10);
  const fmt = d => d.toISOString().split('T')[0];
  return { from: fmt(from), to: fmt(today) };
}

export default function ProjectReports({ currency = 'USD' }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/projects/metrics')
      .then(r => setProjects(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading...</p>;
  if (projects.length === 0) return <p style={{ color: '#666' }}>No projects yet. Add one in the Manage tab.</p>;

  return (
    <div style={styles.list}>
      {projects.map(p => <ProjectCard key={p.id} project={p} currency={currency} />)}
    </div>
  );
}

function ProjectCard({ project: p, currency = 'USD' }) {
  const [expanded, setExpanded] = useState(false);
  const [from, setFrom] = useState(defaultDates().from);
  const [to, setTo] = useState(defaultDates().to);
  const [billData, setBillData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const fetchBill = async () => {
    setLoading(true);
    try {
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;
      const r = await api.get(`/admin/projects/${p.id}/entries`, { params });
      setBillData(r.data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardTop} onClick={() => setExpanded(e => !e)}>
        <div style={styles.cardHeader}>
          <span style={styles.name}>{p.name}</span>
          <div style={styles.headerRight}>
            <span style={styles.sub}>{p.worker_count} worker{p.worker_count !== 1 ? 's' : ''} · {p.total_entries} entr{p.total_entries !== 1 ? 'ies' : 'y'}</span>
            <span style={styles.expandBtn}>{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
        <div style={styles.metrics}>
          <Metric label="Total" value={fmtHours(parseFloat(p.total_hours))} />
          {parseFloat(p.regular_hours) > 0 && <Metric label="Regular" value={fmtHours(parseFloat(p.regular_hours))} color="#2563eb" />}
          {parseFloat(p.overtime_hours) > 0 && <Metric label="Overtime" value={fmtHours(parseFloat(p.overtime_hours))} color="#dc2626" />}
          {parseFloat(p.prevailing_hours) > 0 && <Metric label="Prevailing" value={fmtHours(parseFloat(p.prevailing_hours))} color="#d97706" />}
        </div>
        <div style={styles.barContainer}>
          <HoursBar regular={parseFloat(p.regular_hours)} overtime={parseFloat(p.overtime_hours)} prevailing={parseFloat(p.prevailing_hours)} />
        </div>
        {p.budget_hours && (
          <BudgetBar used={parseFloat(p.total_hours)} budget={parseFloat(p.budget_hours)} label="hrs" />
        )}
        {p.budget_dollars && (
          <BudgetBar used={parseFloat(p.total_hours) * 30} budget={parseFloat(p.budget_dollars)} label="$" money />
        )}
      </div>

      {expanded && (
        <div style={styles.billSection}>
          <h4 style={styles.billHeading}>Generate Bill</h4>
          <div style={styles.dateRow}>
            <div style={styles.dateField}>
              <label style={styles.label}>From</label>
              <input style={styles.input} type="date" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div style={styles.dateField}>
              <label style={styles.label}>To</label>
              <input style={styles.input} type="date" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <button style={styles.fetchBtn} onClick={fetchBill} disabled={loading}>
              {loading ? 'Loading...' : 'Load Entries'}
            </button>
          </div>

          {billData && (
            <div style={{ marginTop: 16 }}>
              <div style={styles.billSummary}>
                <span>Entries: <b>{billData.entries.length}</b></span>
                <span>Total: <b>{fmtHours(billData.summary.total_hours)}</b></span>
                {billData.summary.regular_hours > 0 && <span style={{ color: '#2563eb' }}>Regular: <b>{fmtHours(billData.summary.regular_hours)} · {formatCurrency(billData.summary.regular_cost, currency)}</b></span>}
                {billData.summary.overtime_hours > 0 && <span style={{ color: '#dc2626' }}>Overtime: <b>{fmtHours(billData.summary.overtime_hours)} · {formatCurrency(billData.summary.overtime_cost, currency)}</b></span>}
                {billData.summary.prevailing_hours > 0 && <span style={{ color: '#d97706' }}>Prevailing: <b>{fmtHours(billData.summary.prevailing_hours)} · {formatCurrency(billData.summary.prevailing_cost, currency)}</b></span>}
                <span style={{ fontWeight: 700 }}>Total Cost: <b>{formatCurrency(billData.summary.total_cost, currency)}</b></span>
              </div>
              <div style={styles.btnRow}>
                <button style={styles.previewBtn} onClick={() => setShowPreview(s => !s)}>
                  {showPreview ? 'Hide Preview' : 'Preview Bill'}
                </button>
                <button style={styles.csvBtn} onClick={() => {
                  const headers = ['Date', 'Worker', 'Wage Type', 'Start', 'End', 'Hours'];
                  const rows = billData.entries.map(e => {
                    const h = ((new Date(`1970-01-01T${e.end_time}`) - new Date(`1970-01-01T${e.start_time}`)) / 3600000).toFixed(2);
                    return [e.work_date?.toString().substring(0,10), e.worker_name, e.wage_type, e.start_time, e.end_time, h];
                  });
                  downloadCSV([headers, ...rows], `${p.name.replace(/\s+/g,'-')}-${from||'all'}-to-${to||'all'}.csv`);
                }}>Export CSV</button>
                <PDFDownloadLink
                  document={<ProjectBillPDF data={billData} currency={currency} />}
                  fileName={`bill-${p.name.replace(/\s+/g, '-')}-${from || 'all'}-to-${to || 'all'}.pdf`}
                  style={styles.pdfBtn}
                >
                  {({ loading: l }) => l ? 'Preparing PDF...' : 'Download PDF'}
                </PDFDownloadLink>
              </div>
              {showPreview && (
                <PDFViewer style={styles.pdfViewer}>
                  <ProjectBillPDF data={billData} currency={currency} />
                </PDFViewer>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, color }) {
  return (
    <div style={styles.metric}>
      <span style={{ ...styles.metricVal, color: color || '#222' }}>{value}</span>
      <span style={styles.metricLabel}>{label}</span>
    </div>
  );
}

function BudgetBar({ used, budget, label, money }) {
  const pct = Math.min((used / budget) * 100, 100);
  const over = used > budget;
  const color = pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#059669';
  const fmt = v => money ? `$${v.toFixed(0)}` : `${v.toFixed(1)}`;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginBottom: 3 }}>
        <span>Budget ({label})</span>
        <span style={{ color: over ? '#dc2626' : '#374151', fontWeight: 600 }}>
          {fmt(used)} / {fmt(budget)}{over ? ' — OVER BUDGET' : ''}
        </span>
      </div>
      <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function HoursBar({ regular, overtime, prevailing }) {
  const total = regular + overtime + prevailing;
  if (total === 0) return null;
  const pct = v => `${((v / total) * 100).toFixed(1)}%`;
  return (
    <div style={styles.bar}>
      {regular > 0 && <div style={{ ...styles.barSegment, width: pct(regular), background: '#2563eb' }} title={`Regular: ${fmtHours(regular)}`} />}
      {overtime > 0 && <div style={{ ...styles.barSegment, width: pct(overtime), background: '#dc2626' }} title={`Overtime: ${fmtHours(overtime)}`} />}
      {prevailing > 0 && <div style={{ ...styles.barSegment, width: pct(prevailing), background: '#d97706' }} title={`Prevailing: ${fmtHours(prevailing)}`} />}
    </div>
  );
}

const styles = {
  list: { display: 'flex', flexDirection: 'column', gap: 16 },
  card: { background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden' },
  cardTop: { padding: '18px 20px', cursor: 'pointer' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  name: { fontWeight: 700, fontSize: 17 },
  sub: { color: '#888', fontSize: 13 },
  metrics: { display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 },
  metric: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60 },
  metricVal: { fontWeight: 700, fontSize: 20 },
  metricLabel: { fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 },
  barContainer: { marginTop: 4 },
  bar: { display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#f0f0f0' },
  barSegment: { height: '100%', transition: 'width 0.3s' },
  expandBtn: { color: '#aaa', fontSize: 12 },
  billSection: { padding: '16px 20px', borderTop: '1px solid #f0f0f0', background: '#fafafa' },
  billHeading: { marginBottom: 12, fontSize: 15, fontWeight: 600 },
  dateRow: { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' },
  dateField: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: '#666' },
  input: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 14 },
  fetchBtn: { padding: '8px 18px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  billSummary: { display: 'flex', gap: 20, fontSize: 14, flexWrap: 'wrap', marginBottom: 12 },
  btnRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  previewBtn: { padding: '10px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  csvBtn: { padding: '10px 20px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  pdfBtn: { display: 'inline-block', padding: '10px 20px', background: '#059669', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 14, textDecoration: 'none' },
  pdfViewer: { width: '100%', height: 600, marginTop: 16, borderRadius: 8, border: '1px solid #e5e7eb' },
};
