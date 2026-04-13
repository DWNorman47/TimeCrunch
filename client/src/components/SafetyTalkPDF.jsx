import React from 'react';
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink } from '@react-pdf/renderer';
import { useT } from '../hooks/useT';
import { useAuth } from '../contexts/AuthContext';
import { langToLocale } from '../utils';

function fmtDate(str, locale = 'en-US') {
  return new Date(str + 'T00:00:00').toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

const pdf = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: '#1a1a1a', padding: '40 48 48 48' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 14, borderBottom: '2 solid #1a56db' },
  companyName: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#1a56db', marginBottom: 2 },
  reportTitle: { fontSize: 11, color: '#6b7280', letterSpacing: 1, textTransform: 'uppercase' },
  headerMeta: { fontSize: 9, color: '#374151', marginBottom: 2, textAlign: 'right' },
  // Summary bar
  summaryBar: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: '#eff6ff', borderRadius: 6, padding: '8 10' },
  summaryLabel: { fontSize: 7, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  summaryValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#1a56db' },
  // Talk card
  talkCard: { marginBottom: 14, borderRadius: 6, border: '1 solid #e5e7eb', padding: '10 12' },
  talkCardAlt: { marginBottom: 14, borderRadius: 6, border: '1 solid #e5e7eb', padding: '10 12', backgroundColor: '#fafafa' },
  talkTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  talkLeft: { flex: 1 },
  talkTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#111827', marginBottom: 3 },
  talkMeta: { fontSize: 8, color: '#6b7280' },
  projectTag: { fontSize: 8, color: '#6d28d9', marginLeft: 4 },
  signoffBadge: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#065f46', backgroundColor: '#d1fae5', padding: '2 8', borderRadius: 10 },
  sectionLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3, marginTop: 8 },
  contentText: { fontSize: 9, color: '#374151', lineHeight: 1.7 },
  // Sign-off list
  signoffRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  signoffChip: { fontSize: 8, color: '#374151', backgroundColor: '#f3f4f6', padding: '2 8', borderRadius: 10, border: '1 solid #e5e7eb' },
  // Footer
  footer: { position: 'absolute', bottom: 24, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', borderTop: '1 solid #e5e7eb', paddingTop: 6 },
  footerText: { fontSize: 7, color: '#9ca3af' },
});

export function SafetyTalkDocument({ talks, companyName, t, language }) {
  const locale = langToLocale(language);
  const totalSignoffs = talks.reduce((s, t) => s + parseInt(t.signoff_count || 0), 0);
  const dateStr = new Date().toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Document>
      <Page size="LETTER" style={pdf.page}>
        {/* Header */}
        <View style={pdf.headerRow} fixed>
          <View>
            <Text style={pdf.companyName}>{companyName || t.pdfSafetyTalkLog}</Text>
            <Text style={pdf.reportTitle}>{t.pdfSafetyTalkLog}</Text>
          </View>
          <View>
            <Text style={pdf.headerMeta}>{t.pdfGenerated}{dateStr}</Text>
            <Text style={pdf.headerMeta}>{talks.length !== 1 ? t.pdfTalkCountPlural.replace('{n}', talks.length) : t.pdfTalkCount.replace('{n}', talks.length)}</Text>
          </View>
        </View>

        {/* Summary */}
        <View style={pdf.summaryBar}>
          <View style={pdf.summaryCard}>
            <Text style={pdf.summaryLabel}>{t.pdfTalks}</Text>
            <Text style={pdf.summaryValue}>{talks.length}</Text>
          </View>
          <View style={pdf.summaryCard}>
            <Text style={pdf.summaryLabel}>{t.pdfTotalSignoffs}</Text>
            <Text style={pdf.summaryValue}>{totalSignoffs}</Text>
          </View>
          <View style={pdf.summaryCard}>
            <Text style={pdf.summaryLabel}>{t.pdfAvgSignoffs}</Text>
            <Text style={pdf.summaryValue}>{talks.length > 0 ? (totalSignoffs / talks.length).toFixed(1) : '0'}</Text>
          </View>
        </View>

        {/* Talks */}
        {talks.map((talk, i) => {
          const metaParts = [
            fmtDate(talk.talk_date, locale),
            talk.given_by ? `${t.pdfBy} ${talk.given_by}` : null,
            talk.project_name,
          ].filter(Boolean).join(' · ');

          return (
            <View key={talk.id} style={i % 2 === 0 ? pdf.talkCard : pdf.talkCardAlt}>
              <View style={pdf.talkTopRow}>
                <View style={pdf.talkLeft}>
                  <Text style={pdf.talkTitle}>{talk.title}</Text>
                  <Text style={pdf.talkMeta}>{metaParts}</Text>
                </View>
                <View style={pdf.signoffBadge}>
                  <Text>{talk.signoff_count} {t.pdfSigned}</Text>
                </View>
              </View>

              {talk.content && (
                <>
                  <Text style={pdf.sectionLabel}>{t.pdfContentNotes}</Text>
                  <Text style={pdf.contentText}>{talk.content}</Text>
                </>
              )}

              {talk.signoffs && talk.signoffs.length > 0 && (
                <>
                  <Text style={pdf.sectionLabel}>{t.pdfSignoffsLabel}</Text>
                  <View style={pdf.signoffRow}>
                    {talk.signoffs.map((s, j) => (
                      <View key={j} style={pdf.signoffChip}>
                        <Text>{s.full_name || s.worker_name}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>
          );
        })}

        {/* Footer */}
        <View style={pdf.footer} fixed>
          <Text style={pdf.footerText}>{companyName} — {t.pdfSafetyTalkLogShort} — {dateStr}</Text>
          <Text style={pdf.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function SafetyTalkPDFButton({ talks, companyName, style }) {
  const t = useT();
  const { user } = useAuth();
  const fileName = `safety-talks-${new Date().toLocaleDateString('en-CA')}.pdf`;
  return (
    <PDFDownloadLink
      document={<SafetyTalkDocument talks={talks} companyName={companyName} t={t} language={user?.language} />}
      fileName={fileName}
      style={style}
    >
      {({ loading }) => loading ? t.pdfPreparingBtn : t.pdfExportBtn}
    </PDFDownloadLink>
  );
}
