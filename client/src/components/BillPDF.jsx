import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica', color: '#222' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 4, color: '#1a56db' },
  subtitle: { fontSize: 12, color: '#666', marginBottom: 20 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', marginBottom: 6, borderBottom: '1pt solid #ddd', paddingBottom: 3 },
  row: { flexDirection: 'row', paddingVertical: 4, borderBottom: '0.5pt solid #eee' },
  headerRow: { flexDirection: 'row', paddingVertical: 5, backgroundColor: '#f0f4ff', borderBottom: '1pt solid #ccd' },
  col: { flex: 1, paddingHorizontal: 4 },
  colWide: { flex: 2, paddingHorizontal: 4 },
  bold: { fontWeight: 'bold' },
  summaryRow: { flexDirection: 'row', gap: 24, marginTop: 8, flexWrap: 'wrap' },
  summaryItem: { alignItems: 'center' },
  summaryVal: { fontSize: 16, fontWeight: 'bold' },
  summaryLabel: { fontSize: 9, color: '#888' },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottom: '0.5pt solid #eee' },
  costTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, marginTop: 2 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
});

function formatDate(d) {
  const dt = new Date(d.substring(0, 10) + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(t) {
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m} ${hour < 12 ? 'AM' : 'PM'}`;
}

function calcHours(start, end) {
  const s = new Date(`1970-01-01T${start}`);
  const e = new Date(`1970-01-01T${end}`);
  return ((e - s) / 3600000).toFixed(2);
}

export default function BillPDF({ data }) {
  const { worker, entries, summary, period } = data;
  const periodStr = period.from || period.to
    ? `${period.from ? formatDate(period.from) : 'Beginning'} – ${period.to ? formatDate(period.to) : 'Present'}`
    : 'All Time';

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>OpsFloa</Text>
        <Text style={s.subtitle}>Work Report — {periodStr}</Text>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Employee</Text>
          <Text>{worker.full_name}</Text>
          <Text style={{ color: '#888', fontSize: 10 }}>@{worker.username}</Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Summary</Text>
          <View style={s.summaryRow}>
            <View style={s.summaryItem}>
              <Text style={s.summaryVal}>{summary.total_hours.toFixed(2)}h</Text>
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
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Cost Breakdown</Text>
          {summary.regular_hours > 0 && (
            <View style={s.costRow}>
              <Text style={{ color: '#2563eb' }}>Regular ({summary.regular_hours.toFixed(2)}h × ${summary.rate.toFixed(2)}/hr)</Text>
              <Text style={{ color: '#2563eb', fontWeight: 'bold' }}>${summary.regular_cost.toFixed(2)}</Text>
            </View>
          )}
          {summary.overtime_hours > 0 && (
            <View style={s.costRow}>
              <Text style={{ color: '#dc2626' }}>Overtime ({summary.overtime_hours.toFixed(2)}h × ${(summary.rate * 1.5).toFixed(2)}/hr)</Text>
              <Text style={{ color: '#dc2626', fontWeight: 'bold' }}>${summary.overtime_cost.toFixed(2)}</Text>
            </View>
          )}
          {summary.prevailing_hours > 0 && (
            <View style={s.costRow}>
              <Text style={{ color: '#d97706' }}>Prevailing ({summary.prevailing_hours.toFixed(2)}h × $45.00/hr)</Text>
              <Text style={{ color: '#d97706', fontWeight: 'bold' }}>${summary.prevailing_cost.toFixed(2)}</Text>
            </View>
          )}
          <View style={s.costTotal}>
            <Text style={{ fontWeight: 'bold', fontSize: 13 }}>Total Due</Text>
            <Text style={{ fontWeight: 'bold', fontSize: 13 }}>${summary.total_cost.toFixed(2)}</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Time Entries ({entries.length})</Text>
          <View style={s.headerRow}>
            <Text style={[s.colWide, s.bold]}>Project</Text>
            <Text style={[s.col, s.bold]}>Date</Text>
            <Text style={[s.col, s.bold]}>Start</Text>
            <Text style={[s.col, s.bold]}>End</Text>
            <Text style={[s.col, s.bold]}>Hours</Text>
            <Text style={[s.col, s.bold]}>Type</Text>
          </View>
          {entries.map(e => (
            <View key={e.id} style={s.row}>
              <Text style={s.colWide}>{e.project_name}</Text>
              <Text style={s.col}>{formatDate(e.work_date)}</Text>
              <Text style={s.col}>{formatTime(e.start_time)}</Text>
              <Text style={s.col}>{formatTime(e.end_time)}</Text>
              <Text style={s.col}>{calcHours(e.start_time, e.end_time)}</Text>
              <Text style={s.col}>{e.wage_type}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
