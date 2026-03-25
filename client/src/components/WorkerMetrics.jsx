import React, { useState } from 'react';
import api from '../api';
import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer';
import BillPDF from './BillPDF';
import { fmtHours, formatCurrency } from '../utils';
import { useT } from '../hooks/useT';

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

export default function WorkerMetrics({ worker, currency = 'USD', companyInfo = {}, overtimeEnabled = true }) {
  const t = useT();
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
      const r = await api.get(`/admin/workers/${worker.id}/entries`, { params });
      setBillData(r.data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.summary} onClick={() => setExpanded(e => !e)}>
        <div>
          <span style={styles.name}>{worker.full_name}</span>
          <span style={styles.username}>@{worker.username}</span>
        </div>
        <div style={styles.metrics}>
          <Metric label={t.totalMetric} value={fmtHours(parseFloat(worker.total_hours))} />
          {parseFloat(worker.regular_hours) > 0 && <Metric label={t.regularMetric} value={fmtHours(parseFloat(worker.regular_hours))} color="#2563eb" />}
          {overtimeEnabled && parseFloat(worker.overtime_hours) > 0 && <Metric label={t.overtimeMetric} value={fmtHours(parseFloat(worker.overtime_hours))} color="#dc2626" />}
          {parseFloat(worker.prevailing_hours) > 0 && <Metric label={t.prevailingMetric} value={fmtHours(parseFloat(worker.prevailing_hours))} color="#d97706" />}
          <Metric label={t.entriesMetric} value={worker.total_entries} />
        </div>
        <button style={styles.expandBtn}>{expanded ? '▲' : '▼'}</button>
      </div>

      {expanded && (
        <div style={styles.billSection}>
          <h4 style={styles.billHeading}>{t.generateBill}</h4>
          <div style={styles.dateRow}>
            <div style={styles.dateField}>
              <label style={styles.label}>{t.from}</label>
              <input style={styles.input} type="date" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div style={styles.dateField}>
              <label style={styles.label}>{t.to}</label>
              <input style={styles.input} type="date" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <button style={styles.fetchBtn} onClick={fetchBill} disabled={loading}>
              {loading ? t.loading : t.loadEntries}
            </button>
          </div>

          {billData && (
            <div style={{ marginTop: 16 }}>
              <div style={styles.billSummary}>
                <span>{t.entriesLabel} <b>{billData.entries.length}</b></span>
                <span>{t.totalLabel} <b>{fmtHours(billData.summary.total_hours)}</b></span>
                {billData.summary.regular_hours > 0 && <span style={{ color: '#2563eb' }}>{t.regularLabel} <b>{fmtHours(billData.summary.regular_hours)} · {formatCurrency(billData.summary.regular_cost, currency)}</b></span>}
                {overtimeEnabled && billData.summary.overtime_hours > 0 && <span style={{ color: '#dc2626' }}>{t.overtimeLabel} <b>{fmtHours(billData.summary.overtime_hours)} · {formatCurrency(billData.summary.overtime_cost, currency)}</b></span>}
                {billData.summary.prevailing_hours > 0 && <span style={{ color: '#d97706' }}>{t.prevailingLabel} <b>{fmtHours(billData.summary.prevailing_hours)} · {formatCurrency(billData.summary.prevailing_cost, currency)}</b></span>}
                <span style={{ fontWeight: 700 }}>{t.totalCostLabel} <b>{formatCurrency(billData.summary.total_cost, currency)}</b></span>
              </div>
              <div style={styles.btnRow}>
                <button style={styles.previewBtn} onClick={() => setShowPreview(p => !p)}>
                  {showPreview ? t.hideBill : t.previewBill}
                </button>
                <button style={styles.csvBtn} onClick={() => {
                  const headers = ['Date', 'Project', 'Wage Type', 'Start', 'End', 'Hours'];
                  const rows = billData.entries.map(e => {
                    const h = ((new Date(`1970-01-01T${e.end_time}`) - new Date(`1970-01-01T${e.start_time}`)) / 3600000).toFixed(2);
                    return [e.work_date?.toString().substring(0,10), e.project_name, e.wage_type, e.start_time, e.end_time, h];
                  });
                  downloadCSV([headers, ...rows], `${worker.username}-${from||'all'}-to-${to||'all'}.csv`);
                }}>{t.exportCSV}</button>
                <PDFDownloadLink
                  document={<BillPDF data={billData} currency={currency} companyInfo={companyInfo} />}
                  fileName={`bill-${worker.username}-${from || 'all'}-to-${to || 'all'}.pdf`}
                  style={styles.pdfBtn}
                >
                  {({ loading: l }) => l ? t.preparingPDF : t.downloadPDF}
                </PDFDownloadLink>
              </div>
              {showPreview && (
                <PDFViewer style={styles.pdfViewer}>
                  <BillPDF data={billData} currency={currency} companyInfo={companyInfo} />
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

const styles = {
  card: { background: '#fff', borderRadius: 12, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden' },
  summary: { padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 20, cursor: 'pointer', flexWrap: 'wrap' },
  name: { fontWeight: 700, fontSize: 17, marginRight: 8 },
  username: { color: '#888', fontSize: 13 },
  metrics: { display: 'flex', gap: 20, flex: 1, flexWrap: 'wrap' },
  metric: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60 },
  metricVal: { fontWeight: 700, fontSize: 18 },
  metricLabel: { fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 },
  expandBtn: { background: 'none', border: 'none', fontSize: 14, color: '#888', marginLeft: 'auto' },
  billSection: { padding: '16px 20px', borderTop: '1px solid #f0f0f0', background: '#fafafa' },
  billHeading: { marginBottom: 12, fontSize: 15, fontWeight: 600 },
  dateRow: { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' },
  dateField: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: '#666' },
  input: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 14 },
  fetchBtn: { padding: '8px 18px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 14 },
  billSummary: { display: 'flex', gap: 20, fontSize: 14, flexWrap: 'wrap', marginBottom: 12 },
  btnRow: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  previewBtn: { padding: '10px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  csvBtn: { padding: '10px 20px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  pdfBtn: { display: 'inline-block', padding: '10px 20px', background: '#059669', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 14, textDecoration: 'none' },
  pdfViewer: { width: '100%', height: 600, marginTop: 16, borderRadius: 8, border: '1px solid #e5e7eb' },
};
