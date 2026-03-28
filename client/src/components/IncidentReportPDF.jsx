import React from 'react';
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink } from '@react-pdf/renderer';

const TYPE_LABELS = {
  'injury': 'Injury',
  'near-miss': 'Near-Miss',
  'property-damage': 'Property Damage',
  'environmental': 'Environmental',
  'other': 'Other',
};

const TREATMENT_LABELS = {
  'none': 'No treatment needed',
  'first-aid': 'First aid on-site',
  'medical-attention': 'Medical attention (off-site)',
  'hospitalization': 'Hospitalization',
};

const pdf = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: '#1a1a1a', padding: '40 48 48 48' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 14, borderBottom: '2 solid #d97706' },
  companyName: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#d97706', marginBottom: 2 },
  reportTitle: { fontSize: 11, color: '#6b7280', letterSpacing: 1, textTransform: 'uppercase' },
  headerMeta: { fontSize: 9, color: '#374151', marginBottom: 2, textAlign: 'right' },
  // Summary bar
  summaryBar: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: '#fffbeb', borderRadius: 6, padding: '8 10' },
  summaryLabel: { fontSize: 7, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  summaryValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#d97706' },
  // Incident card
  incidentCard: { marginBottom: 12, borderRadius: 6, border: '1 solid #e5e7eb', padding: '10 12' },
  incidentCardAlt: { marginBottom: 12, borderRadius: 6, border: '1 solid #e5e7eb', padding: '10 12', backgroundColor: '#fafafa' },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardLeft: { flex: 1 },
  incidentType: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111827', marginBottom: 2 },
  incidentMeta: { fontSize: 8, color: '#6b7280' },
  badgeOpen: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#92400e', backgroundColor: '#fef3c7', padding: '2 6', borderRadius: 4 },
  badgeClosed: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#065f46', backgroundColor: '#d1fae5', padding: '2 6', borderRadius: 4 },
  stoppedTag: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#dc2626', backgroundColor: '#fee2e2', padding: '2 6', borderRadius: 4, marginTop: 3 },
  injuryBox: { backgroundColor: '#fef2f2', border: '1 solid #fecaca', borderRadius: 4, padding: '6 8', marginBottom: 6 },
  injuryText: { fontSize: 8, color: '#374151', lineHeight: 1.6 },
  sectionLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2, marginTop: 6 },
  sectionText: { fontSize: 9, color: '#374151', lineHeight: 1.6 },
  reporterLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#059669', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  // Footer
  footer: { position: 'absolute', bottom: 24, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', borderTop: '1 solid #e5e7eb', paddingTop: 6 },
  footerText: { fontSize: 7, color: '#9ca3af' },
});

export function IncidentReportDocument({ incidents, companyName }) {
  const openCount = incidents.filter(i => i.status === 'open').length;
  const closedCount = incidents.filter(i => i.status === 'closed').length;
  const injuryCount = incidents.filter(i => i.type === 'injury').length;
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Document>
      <Page size="LETTER" style={pdf.page}>
        {/* Header */}
        <View style={pdf.headerRow} fixed>
          <View>
            <Text style={pdf.companyName}>{companyName || 'Incident Reports'}</Text>
            <Text style={pdf.reportTitle}>Incident Report Log</Text>
          </View>
          <View>
            <Text style={pdf.headerMeta}>Generated: {dateStr}</Text>
            <Text style={pdf.headerMeta}>{incidents.length} report{incidents.length !== 1 ? 's' : ''}</Text>
          </View>
        </View>

        {/* Summary */}
        <View style={pdf.summaryBar}>
          <View style={pdf.summaryCard}>
            <Text style={pdf.summaryLabel}>Open</Text>
            <Text style={pdf.summaryValue}>{openCount}</Text>
          </View>
          <View style={pdf.summaryCard}>
            <Text style={pdf.summaryLabel}>Closed</Text>
            <Text style={pdf.summaryValue}>{closedCount}</Text>
          </View>
          <View style={pdf.summaryCard}>
            <Text style={pdf.summaryLabel}>Injuries</Text>
            <Text style={pdf.summaryValue}>{injuryCount}</Text>
          </View>
          <View style={pdf.summaryCard}>
            <Text style={pdf.summaryLabel}>Total</Text>
            <Text style={pdf.summaryValue}>{incidents.length}</Text>
          </View>
        </View>

        {/* Incidents */}
        {incidents.map((incident, i) => {
          const isInjury = incident.type === 'injury';
          const dateStr = incident.incident_date?.toString().substring(0, 10);
          const timeStr = incident.incident_time ? ` at ${incident.incident_time.substring(0, 5)}` : '';
          const metaParts = [
            dateStr + timeStr,
            incident.project_name,
          ].filter(Boolean).join(' · ');

          return (
            <View key={incident.id} style={i % 2 === 0 ? pdf.incidentCard : pdf.incidentCardAlt}>
              <View style={pdf.cardTopRow}>
                <View style={pdf.cardLeft}>
                  {incident.reporter_name && (
                    <Text style={pdf.reporterLabel}>{incident.reporter_name}</Text>
                  )}
                  <Text style={pdf.incidentType}>{TYPE_LABELS[incident.type] || incident.type}</Text>
                  <Text style={pdf.incidentMeta}>{metaParts}</Text>
                  {incident.work_stopped && (
                    <View style={pdf.stoppedTag}><Text>Work Stopped</Text></View>
                  )}
                </View>
                <View style={incident.status === 'closed' ? pdf.badgeClosed : pdf.badgeOpen}>
                  <Text>{incident.status === 'closed' ? 'Closed' : 'Open'}</Text>
                </View>
              </View>

              {isInjury && (incident.injured_name || incident.body_part || incident.treatment) && (
                <View style={pdf.injuryBox}>
                  {incident.injured_name && <Text style={pdf.injuryText}>Injured: {incident.injured_name}</Text>}
                  {incident.body_part && <Text style={pdf.injuryText}>Body part: {incident.body_part}</Text>}
                  {incident.treatment && <Text style={pdf.injuryText}>Treatment: {TREATMENT_LABELS[incident.treatment] || incident.treatment}</Text>}
                </View>
              )}

              {incident.description && (
                <>
                  <Text style={pdf.sectionLabel}>Description</Text>
                  <Text style={pdf.sectionText}>{incident.description}</Text>
                </>
              )}

              {incident.witnesses && (
                <>
                  <Text style={pdf.sectionLabel}>Witnesses</Text>
                  <Text style={pdf.sectionText}>{incident.witnesses}</Text>
                </>
              )}

              {incident.corrective_action && (
                <>
                  <Text style={pdf.sectionLabel}>Corrective Action</Text>
                  <Text style={pdf.sectionText}>{incident.corrective_action}</Text>
                </>
              )}
            </View>
          );
        })}

        {/* Footer */}
        <View style={pdf.footer} fixed>
          <Text style={pdf.footerText}>{companyName} — Incident Report Log — {dateStr}</Text>
          <Text style={pdf.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function IncidentReportPDFButton({ incidents, companyName, style }) {
  const fileName = `incident-reports-${new Date().toLocaleDateString('en-CA')}.pdf`;
  return (
    <PDFDownloadLink
      document={<IncidentReportDocument incidents={incidents} companyName={companyName} />}
      fileName={fileName}
      style={style}
    >
      {({ loading }) => loading ? 'Preparing PDF...' : '⬇ Export PDF'}
    </PDFDownloadLink>
  );
}
