import React, { useState, useEffect } from 'react';
import api from '../api';
import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer';
import ProjectBillPDF from './ProjectBillPDF';

function defaultDates() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 10);
  const fmt = d => d.toISOString().split('T')[0];
  return { from: fmt(from), to: fmt(today) };
}

export default function ProjectReports() {
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
      {projects.map(p => <ProjectCard key={p.id} project={p} />)}
    </div>
  );
}

function ProjectCard({ project: p }) {
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
          <span style={styles.sub}>{p.worker_count} worker{p.worker_count !== 1 ? 's' : ''} · {p.total_entries} entr{p.total_entries !== 1 ? 'ies' : 'y'}</span>
        </div>
        <div style={styles.metrics}>
          <Metric label="Total" value={`${parseFloat(p.total_hours).toFixed(2)}h`} />
          {parseFloat(p.regular_hours) > 0 && <Metric label="Regular" value={`${parseFloat(p.regular_hours).toFixed(2)}h`} color="#2563eb" />}
          {parseFloat(p.overtime_hours) > 0 && <Metric label="Overtime" value={`${parseFloat(p.overtime_hours).toFixed(2)}h`} color="#dc2626" />}
          {parseFloat(p.prevailing_hours) > 0 && <Metric label="Prevailing" value={`${parseFloat(p.prevailing_hours).toFixed(2)}h`} color="#d97706" />}
        </div>
        <div style={styles.barContainer}>
          <HoursBar regular={parseFloat(p.regular_hours)} overtime={parseFloat(p.overtime_hours)} prevailing={parseFloat(p.prevailing_hours)} />
        </div>
        <button style={styles.expandBtn}>{expanded ? '▲' : '▼'}</button>
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
                <span>Total: <b>{billData.summary.total_hours.toFixed(2)}h</b></span>
                {billData.summary.regular_hours > 0 && <span style={{ color: '#2563eb' }}>Regular: <b>{billData.summary.regular_hours.toFixed(2)}h · ${billData.summary.regular_cost.toFixed(2)}</b></span>}
                {billData.summary.overtime_hours > 0 && <span style={{ color: '#dc2626' }}>Overtime: <b>{billData.summary.overtime_hours.toFixed(2)}h · ${billData.summary.overtime_cost.toFixed(2)}</b></span>}
                {billData.summary.prevailing_hours > 0 && <span style={{ color: '#d97706' }}>Prevailing: <b>{billData.summary.prevailing_hours.toFixed(2)}h · ${billData.summary.prevailing_cost.toFixed(2)}</b></span>}
                <span style={{ fontWeight: 700 }}>Total Cost: <b>${billData.summary.total_cost.toFixed(2)}</b></span>
              </div>
              <div style={styles.btnRow}>
                <button style={styles.previewBtn} onClick={() => setShowPreview(s => !s)}>
                  {showPreview ? 'Hide Preview' : 'Preview Bill'}
                </button>
                <PDFDownloadLink
                  document={<ProjectBillPDF data={billData} />}
                  fileName={`bill-${p.name.replace(/\s+/g, '-')}-${from || 'all'}-to-${to || 'all'}.pdf`}
                  style={styles.pdfBtn}
                >
                  {({ loading: l }) => l ? 'Preparing PDF...' : 'Download PDF'}
                </PDFDownloadLink>
              </div>
              {showPreview && (
                <PDFViewer style={styles.pdfViewer}>
                  <ProjectBillPDF data={billData} />
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

function HoursBar({ regular, overtime, prevailing }) {
  const total = regular + overtime + prevailing;
  if (total === 0) return null;
  const pct = v => `${((v / total) * 100).toFixed(1)}%`;
  return (
    <div style={styles.bar}>
      {regular > 0 && <div style={{ ...styles.barSegment, width: pct(regular), background: '#2563eb' }} title={`Regular: ${regular.toFixed(2)}h`} />}
      {overtime > 0 && <div style={{ ...styles.barSegment, width: pct(overtime), background: '#dc2626' }} title={`Overtime: ${overtime.toFixed(2)}h`} />}
      {prevailing > 0 && <div style={{ ...styles.barSegment, width: pct(prevailing), background: '#d97706' }} title={`Prevailing: ${prevailing.toFixed(2)}h`} />}
    </div>
  );
}

const styles = {
  list: { display: 'flex', flexDirection: 'column', gap: 16 },
  card: { background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden' },
  cardTop: { padding: '18px 20px', cursor: 'pointer', position: 'relative' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 },
  name: { fontWeight: 700, fontSize: 17 },
  sub: { color: '#888', fontSize: 13 },
  metrics: { display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 },
  metric: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60 },
  metricVal: { fontWeight: 700, fontSize: 20 },
  metricLabel: { fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 },
  barContainer: { marginTop: 4 },
  bar: { display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#f0f0f0' },
  barSegment: { height: '100%', transition: 'width 0.3s' },
  expandBtn: { position: 'absolute', top: 18, right: 20, background: 'none', border: 'none', fontSize: 14, color: '#888', cursor: 'pointer' },
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
  pdfBtn: { display: 'inline-block', padding: '10px 20px', background: '#059669', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 14, textDecoration: 'none' },
  pdfViewer: { width: '100%', height: 600, marginTop: 16, borderRadius: 8, border: '1px solid #e5e7eb' },
};
