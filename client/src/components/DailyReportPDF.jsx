import React from 'react';
import {
  Document, Page, Text, View, StyleSheet, PDFDownloadLink, Image,
} from '@react-pdf/renderer';

const WEATHER_LABELS = {
  sunny: 'Sunny', partly_cloudy: 'Partly Cloudy', cloudy: 'Cloudy',
  rainy: 'Rainy', stormy: 'Stormy', snow: 'Snow', windy: 'Windy',
};

const pdf = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: '#1a1a1a', padding: '40 48 48 48' },
  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 14, borderBottom: '2 solid #1a56db' },
  headerLeft: {},
  companyName: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#1a56db', marginBottom: 2 },
  reportTitle: { fontSize: 11, color: '#6b7280', letterSpacing: 1, textTransform: 'uppercase' },
  headerRight: { alignItems: 'flex-end' },
  headerMeta: { fontSize: 9, color: '#374151', marginBottom: 2 },
  headerMetaBold: { fontFamily: 'Helvetica-Bold' },
  // Status badge
  statusBadge: { marginTop: 6, padding: '3 8', borderRadius: 4, alignSelf: 'flex-end' },
  statusText: { fontSize: 8, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  // Section
  section: { marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#1a56db', textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionLine: { flex: 1, height: 1, backgroundColor: '#dbeafe', marginLeft: 8 },
  // Table
  table: { borderRadius: 4, overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#eff6ff', padding: '5 8' },
  tableRow: { flexDirection: 'row', padding: '5 8', borderBottom: '1 solid #f3f4f6' },
  tableRowAlt: { flexDirection: 'row', padding: '5 8', borderBottom: '1 solid #f3f4f6', backgroundColor: '#fafafa' },
  colTrade: { flex: 2 },
  colCount: { flex: 1, textAlign: 'center' },
  colHours: { flex: 1, textAlign: 'center' },
  colNotes: { flex: 2, color: '#6b7280' },
  colName: { flex: 3 },
  colQty: { flex: 1, textAlign: 'center' },
  colDesc: { flex: 3 },
  thText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#1e40af', textTransform: 'uppercase', letterSpacing: 0.5 },
  tdText: { fontSize: 9, color: '#374151' },
  // Text block
  textBlock: { fontSize: 9, color: '#374151', lineHeight: 1.6, padding: '8 10', backgroundColor: '#f9fafb', borderRadius: 4, borderLeft: '3 solid #dbeafe' },
  // Photos
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  photoWrap: { width: '31%', marginBottom: 6 },
  photo: { width: '100%', height: 90, objectFit: 'cover', borderRadius: 4 },
  photoCaption: { fontSize: 7, color: '#6b7280', marginTop: 2 },
  // Summary bar
  summaryBar: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  summaryCard: { flex: 1, backgroundColor: '#eff6ff', borderRadius: 6, padding: '8 10' },
  summaryLabel: { fontSize: 7, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  summaryValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#1a56db' },
  // Footer
  footer: { position: 'absolute', bottom: 24, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', borderTop: '1 solid #e5e7eb', paddingTop: 6 },
  footerText: { fontSize: 7, color: '#9ca3af' },
});

function SectionHeader({ title }) {
  return (
    <View style={pdf.sectionHeader}>
      <Text style={pdf.sectionTitle}>{title}</Text>
      <View style={pdf.sectionLine} />
    </View>
  );
}

function TextBlock({ text }) {
  if (!text?.trim()) return <Text style={{ ...pdf.textBlock, color: '#9ca3af', fontStyle: 'italic' }}>None reported</Text>;
  return <Text style={pdf.textBlock}>{text}</Text>;
}

export function DailyReportDocument({ report, companyName, fieldPhotos = [] }) {
  const totalWorkers = report.manpower?.reduce((s, m) => s + (parseInt(m.worker_count) || 0), 0) || 0;
  const totalHours = report.manpower?.reduce((s, m) => s + (parseFloat(m.hours) || 0), 0) || 0;
  const weather = report.weather_condition ? WEATHER_LABELS[report.weather_condition] || report.weather_condition : null;
  const weatherStr = [weather, report.weather_temp != null ? `${report.weather_temp}°F` : null].filter(Boolean).join(', ');
  const dateStr = new Date(report.report_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const isSubmitted = report.status === 'submitted';
  const isReviewed = report.status === 'reviewed';

  return (
    <Document>
      <Page size="LETTER" style={pdf.page}>
        {/* Header */}
        <View style={pdf.headerRow} fixed>
          <View style={pdf.headerLeft}>
            <Text style={pdf.companyName}>{companyName || 'Daily Report'}</Text>
            <Text style={pdf.reportTitle}>Daily Site Report</Text>
          </View>
          <View style={pdf.headerRight}>
            <Text style={pdf.headerMeta}><Text style={pdf.headerMetaBold}>Date: </Text>{dateStr}</Text>
            {report.project_name && <Text style={pdf.headerMeta}><Text style={pdf.headerMetaBold}>Project: </Text>{report.project_name}</Text>}
            {report.superintendent && <Text style={pdf.headerMeta}><Text style={pdf.headerMetaBold}>Superintendent: </Text>{report.superintendent}</Text>}
            {weatherStr && <Text style={pdf.headerMeta}><Text style={pdf.headerMetaBold}>Weather: </Text>{weatherStr}</Text>}
            <View style={{ ...pdf.statusBadge, backgroundColor: isReviewed ? '#1a56db' : isSubmitted ? '#d1fae5' : '#fef3c7' }}>
              <Text style={{ ...pdf.statusText, color: isReviewed ? '#fff' : isSubmitted ? '#065f46' : '#92400e' }}>
                {isReviewed ? 'REVIEWED' : isSubmitted ? 'SUBMITTED' : 'DRAFT'}
              </Text>
            </View>
            {isReviewed && report.reviewed_by && (
              <Text style={{ ...pdf.headerMeta, marginTop: 4, color: '#1a56db' }}>
                <Text style={pdf.headerMetaBold}>Reviewed by: </Text>
                {report.reviewed_by}
                {report.reviewed_at ? ` · ${new Date(report.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
              </Text>
            )}
          </View>
        </View>

        {/* Summary bar */}
        {(totalWorkers > 0 || report.manpower?.length > 0) && (
          <View style={pdf.summaryBar}>
            <View style={pdf.summaryCard}>
              <Text style={pdf.summaryLabel}>Total Workers</Text>
              <Text style={pdf.summaryValue}>{totalWorkers}</Text>
            </View>
            <View style={pdf.summaryCard}>
              <Text style={pdf.summaryLabel}>Total Hours</Text>
              <Text style={pdf.summaryValue}>{totalHours.toFixed(1)}</Text>
            </View>
            <View style={pdf.summaryCard}>
              <Text style={pdf.summaryLabel}>Equipment Items</Text>
              <Text style={pdf.summaryValue}>{report.equipment?.length || 0}</Text>
            </View>
            <View style={pdf.summaryCard}>
              <Text style={pdf.summaryLabel}>Photos</Text>
              <Text style={pdf.summaryValue}>{fieldPhotos.length}</Text>
            </View>
          </View>
        )}

        {/* Manpower */}
        {report.manpower?.length > 0 && (
          <View style={pdf.section}>
            <SectionHeader title="Manpower" />
            <View style={pdf.table}>
              <View style={pdf.tableHeader}>
                <Text style={{ ...pdf.thText, ...pdf.colTrade }}>Trade / Name</Text>
                <Text style={{ ...pdf.thText, ...pdf.colCount }}>Workers</Text>
                <Text style={{ ...pdf.thText, ...pdf.colHours }}>Hours</Text>
                <Text style={{ ...pdf.thText, ...pdf.colNotes }}>Notes</Text>
              </View>
              {report.manpower.map((m, i) => (
                <View key={i} style={i % 2 === 0 ? pdf.tableRow : pdf.tableRowAlt}>
                  <Text style={{ ...pdf.tdText, ...pdf.colTrade }}>{m.trade || '—'}</Text>
                  <Text style={{ ...pdf.tdText, ...pdf.colCount }}>{m.worker_count}</Text>
                  <Text style={{ ...pdf.tdText, ...pdf.colHours }}>{m.hours != null ? parseFloat(m.hours).toFixed(1) : '—'}</Text>
                  <Text style={{ ...pdf.tdText, ...pdf.colNotes }}>{m.notes || ''}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Work Performed */}
        <View style={pdf.section}>
          <SectionHeader title="Work Performed" />
          <TextBlock text={report.work_performed} />
        </View>

        {/* Equipment */}
        {report.equipment?.length > 0 && (
          <View style={pdf.section}>
            <SectionHeader title="Equipment on Site" />
            <View style={pdf.table}>
              <View style={pdf.tableHeader}>
                <Text style={{ ...pdf.thText, ...pdf.colName }}>Equipment</Text>
                <Text style={{ ...pdf.thText, ...pdf.colQty }}>Qty</Text>
                <Text style={{ ...pdf.thText, ...pdf.colHours }}>Hours</Text>
              </View>
              {report.equipment.map((e, i) => (
                <View key={i} style={i % 2 === 0 ? pdf.tableRow : pdf.tableRowAlt}>
                  <Text style={{ ...pdf.tdText, ...pdf.colName }}>{e.name}</Text>
                  <Text style={{ ...pdf.tdText, ...pdf.colQty }}>{e.quantity}</Text>
                  <Text style={{ ...pdf.tdText, ...pdf.colHours }}>{e.hours != null ? parseFloat(e.hours).toFixed(1) : '—'}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Materials */}
        {report.materials?.length > 0 && (
          <View style={pdf.section}>
            <SectionHeader title="Materials Delivered" />
            <View style={pdf.table}>
              <View style={pdf.tableHeader}>
                <Text style={{ ...pdf.thText, ...pdf.colDesc }}>Description</Text>
                <Text style={{ ...pdf.thText, ...pdf.colQty }}>Quantity</Text>
              </View>
              {report.materials.map((m, i) => (
                <View key={i} style={i % 2 === 0 ? pdf.tableRow : pdf.tableRowAlt}>
                  <Text style={{ ...pdf.tdText, ...pdf.colDesc }}>{m.description}</Text>
                  <Text style={{ ...pdf.tdText, ...pdf.colQty }}>{m.quantity || '—'}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Delays / Issues */}
        <View style={pdf.section}>
          <SectionHeader title="Delays / Issues" />
          <TextBlock text={report.delays_issues} />
        </View>

        {/* Visitor Log */}
        {report.visitor_log && (
          <View style={pdf.section}>
            <SectionHeader title="Visitor Log" />
            <TextBlock text={report.visitor_log} />
          </View>
        )}

        {/* Photos */}
        {fieldPhotos.length > 0 && (
          <View style={pdf.section}>
            <SectionHeader title={`Site Photos (${fieldPhotos.length})`} />
            <View style={pdf.photoGrid}>
              {fieldPhotos.map((p, i) => (
                <View key={i} style={pdf.photoWrap}>
                  <Image src={p.url} style={pdf.photo} />
                  {p.caption && <Text style={pdf.photoCaption}>{p.caption}</Text>}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={pdf.footer} fixed>
          <Text style={pdf.footerText}>{companyName} — Daily Site Report — {dateStr}</Text>
          <Text style={pdf.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function PDFButton({ report, companyName, fieldPhotos, style }) {
  const fileName = `daily-report-${report.report_date}-${(report.project_name || 'site').toLowerCase().replace(/\s+/g, '-')}.pdf`;
  return (
    <PDFDownloadLink
      document={<DailyReportDocument report={report} companyName={companyName} fieldPhotos={fieldPhotos} />}
      fileName={fileName}
      style={style}
    >
      {({ loading }) => loading ? 'Preparing PDF...' : '⬇ Download PDF'}
    </PDFDownloadLink>
  );
}
