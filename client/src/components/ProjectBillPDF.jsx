import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { formatCurrency } from '../utils';

const s = StyleSheet.create({
  page: { padding: '40 48', fontSize: 10, fontFamily: 'Helvetica', color: '#1a1a1a' },
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32 },
  companyBlock: { flex: 1 },
  companyName: { fontSize: 20, fontWeight: 'bold', color: '#1a56db', marginBottom: 4 },
  companyMeta: { fontSize: 9, color: '#555', lineHeight: 1.5 },
  invoiceBlock: { alignItems: 'flex-end' },
  invoiceTitle: { fontSize: 28, fontWeight: 'bold', color: '#e5e7eb', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
  invoiceNumber: { fontSize: 10, color: '#374151', fontWeight: 'bold', marginBottom: 2 },
  invoiceDate: { fontSize: 9, color: '#6b7280' },
  // Bill-to / project
  infoRow: { flexDirection: 'row', gap: 32, marginBottom: 28 },
  infoBlock: { flex: 1 },
  infoLabel: { fontSize: 8, fontWeight: 'bold', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  infoValue: { fontSize: 10, color: '#111827', lineHeight: 1.5 },
  // Summary
  summaryBox: { backgroundColor: '#f0f4ff', borderRadius: 4, padding: '12 16', marginBottom: 20 },
  summaryRow: { flexDirection: 'row', gap: 0 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  summaryLabel: { fontSize: 8, color: '#6b7280', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  // Cost breakdown
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 9, fontWeight: 'bold', color: '#374151', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '0.5pt solid #e5e7eb', paddingBottom: 4, marginBottom: 8 },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottom: '0.5pt solid #f3f4f6' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, marginTop: 2, borderTop: '1pt solid #374151' },
  totalLabel: { fontSize: 12, fontWeight: 'bold' },
  totalValue: { fontSize: 12, fontWeight: 'bold', color: '#1a56db' },
  // Entries table
  tableHeader: { flexDirection: 'row', backgroundColor: '#f8fafc', paddingVertical: 5, paddingHorizontal: 4, borderBottom: '0.5pt solid #e5e7eb' },
  tableRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4, borderBottom: '0.5pt solid #f3f4f6' },
  colWorker: { flex: 2.2, fontSize: 9 },
  colDate: { flex: 1.2, fontSize: 9 },
  colTime: { flex: 1, fontSize: 9 },
  colHours: { flex: 0.7, fontSize: 9, textAlign: 'right' },
  colType: { flex: 0.8, fontSize: 9, textAlign: 'right' },
  headerText: { fontSize: 8, fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4 },
  // Footer
  footer: { marginTop: 32, borderTop: '0.5pt solid #e5e7eb', paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 8, color: '#9ca3af' },
});

function fmtDate(d) {
  if (!d) return '';
  return new Date(d.toString().substring(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m} ${hour < 12 ? 'AM' : 'PM'}`;
}

function calcHours(start, end) {
  if (!start || !end) return '—';
  const s = new Date(`1970-01-01T${start}`);
  const e = new Date(`1970-01-01T${end}`);
  return ((e - s) / 3600000).toFixed(2);
}

function invoiceNumber(projectId, period) {
  const date = period?.to || new Date().toISOString().substring(0, 10);
  const ym = date.substring(0, 7).replace('-', '');
  return `INV-${String(projectId).padStart(4, '0')}-${ym}`;
}

export default function ProjectBillPDF({ data, currency = 'USD', companyInfo = {}, project: projectMeta = {} }) {
  const { project, entries, summary, period } = data;
  const periodStr = period?.from || period?.to
    ? `${period.from ? fmtDate(period.from) : 'Beginning'} – ${period.to ? fmtDate(period.to) : 'Present'}`
    : 'All Time';
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const invNum = invoiceNumber(project?.id || projectMeta?.id, period);

  // Due date: NET 30
  const dueDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  })();

  const clientName = projectMeta?.client_name || project?.client_name || '';
  const clientAddress = projectMeta?.address || project?.address || '';

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <View style={s.companyBlock}>
            <Text style={s.companyName}>{companyInfo.name || 'OpsFloa'}</Text>
            {companyInfo.address && <Text style={s.companyMeta}>{companyInfo.address}</Text>}
            {companyInfo.phone && <Text style={s.companyMeta}>{companyInfo.phone}</Text>}
            {companyInfo.contact_email && <Text style={s.companyMeta}>{companyInfo.contact_email}</Text>}
          </View>
          <View style={s.invoiceBlock}>
            <Text style={s.invoiceTitle}>Invoice</Text>
            <Text style={s.invoiceNumber}>{invNum}</Text>
            <Text style={s.invoiceDate}>Issued: {today}</Text>
            <Text style={s.invoiceDate}>Due: {dueDate} (NET 30)</Text>
          </View>
        </View>

        {/* Bill To / Project */}
        <View style={s.infoRow}>
          {(clientName || clientAddress) && (
            <View style={s.infoBlock}>
              <Text style={s.infoLabel}>Bill To</Text>
              {clientName && <Text style={s.infoValue}>{clientName}</Text>}
              {clientAddress && <Text style={[s.infoValue, { color: '#6b7280' }]}>{clientAddress}</Text>}
            </View>
          )}
          <View style={s.infoBlock}>
            <Text style={s.infoLabel}>Project</Text>
            <Text style={s.infoValue}>{project?.name || projectMeta?.name || '—'}</Text>
            {(projectMeta?.job_number || project?.job_number) && (
              <Text style={[s.infoValue, { color: '#6b7280' }]}>Job #{projectMeta?.job_number || project?.job_number}</Text>
            )}
            <Text style={[s.infoValue, { color: '#6b7280', marginTop: 2 }]}>{periodStr}</Text>
          </View>
        </View>

        {/* Summary row */}
        <View style={s.summaryBox}>
          <View style={s.summaryRow}>
            <View style={s.summaryItem}>
              <Text style={s.summaryVal}>{(summary.total_hours || 0).toFixed(2)}h</Text>
              <Text style={s.summaryLabel}>Total Hours</Text>
            </View>
            {summary.regular_hours > 0 && (
              <View style={s.summaryItem}>
                <Text style={[s.summaryVal, { color: '#2563eb' }]}>{summary.regular_hours.toFixed(2)}h</Text>
                <Text style={s.summaryLabel}>Regular</Text>
              </View>
            )}
            {summary.overtime_hours > 0 && (
              <View style={s.summaryItem}>
                <Text style={[s.summaryVal, { color: '#dc2626' }]}>{summary.overtime_hours.toFixed(2)}h</Text>
                <Text style={s.summaryLabel}>Overtime</Text>
              </View>
            )}
            {summary.prevailing_hours > 0 && (
              <View style={s.summaryItem}>
                <Text style={[s.summaryVal, { color: '#d97706' }]}>{summary.prevailing_hours.toFixed(2)}h</Text>
                <Text style={s.summaryLabel}>Prevailing</Text>
              </View>
            )}
            <View style={s.summaryItem}>
              <Text style={[s.summaryVal, { color: '#059669' }]}>{formatCurrency(summary.total_cost, currency)}</Text>
              <Text style={s.summaryLabel}>Amount Due</Text>
            </View>
          </View>
        </View>

        {/* Cost breakdown */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Cost Breakdown</Text>
          {summary.regular_hours > 0 && (
            <View style={s.costRow}>
              <Text style={{ color: '#374151' }}>Regular labor — {summary.regular_hours.toFixed(2)} hrs</Text>
              <Text style={{ color: '#2563eb', fontWeight: 'bold' }}>{formatCurrency(summary.regular_cost, currency)}</Text>
            </View>
          )}
          {summary.overtime_hours > 0 && (
            <View style={s.costRow}>
              <Text style={{ color: '#374151' }}>Overtime — {summary.overtime_hours.toFixed(2)} hrs × {summary.overtime_multiplier}x</Text>
              <Text style={{ color: '#dc2626', fontWeight: 'bold' }}>{formatCurrency(summary.overtime_cost, currency)}</Text>
            </View>
          )}
          {summary.prevailing_hours > 0 && (
            <View style={s.costRow}>
              <Text style={{ color: '#374151' }}>Prevailing wage — {summary.prevailing_hours.toFixed(2)} hrs @ {formatCurrency(summary.prevailing_wage_rate, currency)}/hr</Text>
              <Text style={{ color: '#d97706', fontWeight: 'bold' }}>{formatCurrency(summary.prevailing_cost, currency)}</Text>
            </View>
          )}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total Due</Text>
            <Text style={s.totalValue}>{formatCurrency(summary.total_cost, currency)}</Text>
          </View>
        </View>

        {/* Time entries */}
        {entries?.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Time Entries ({entries.length})</Text>
            <View style={s.tableHeader}>
              <Text style={[s.colWorker, s.headerText]}>Worker</Text>
              <Text style={[s.colDate, s.headerText]}>Date</Text>
              <Text style={[s.colTime, s.headerText]}>Start</Text>
              <Text style={[s.colTime, s.headerText]}>End</Text>
              <Text style={[s.colHours, s.headerText]}>Hours</Text>
              <Text style={[s.colType, s.headerText]}>Type</Text>
            </View>
            {entries.map(e => (
              <View key={e.id} style={s.tableRow}>
                <Text style={s.colWorker}>{e.invoice_name || e.worker_name}</Text>
                <Text style={s.colDate}>{fmtDate(e.work_date)}</Text>
                <Text style={s.colTime}>{fmtTime(e.start_time)}</Text>
                <Text style={s.colTime}>{fmtTime(e.end_time)}</Text>
                <Text style={s.colHours}>{calcHours(e.start_time, e.end_time)}</Text>
                <Text style={s.colType}>{e.wage_type}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>{invNum}</Text>
          <Text style={s.footerText}>Thank you for your business.</Text>
        </View>

      </Page>
    </Document>
  );
}
