import React, { useState, useEffect } from 'react';
import api from '../api';
import { fmtHours } from '../utils';

function formatDate(str) {
  const d = new Date(String(str).substring(0, 10) + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(t) {
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr < 12 ? 'AM' : 'PM'}`;
}

function netHours(start, end, brk) {
  return (new Date(`1970-01-01T${end}`) - new Date(`1970-01-01T${start}`)) / 3600000 - (brk || 0) / 60;
}

export default function PayStubView() {
  const [stubs, setStubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    api.get('/time-entries/pay-stubs')
      .then(r => { setStubs(r.data); if (r.data.length > 0) setOpenId(r.data[0].id); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (stubs.length === 0) return (
    <div style={styles.card}>
      <h2 style={styles.heading}>Pay Stubs</h2>
      <p style={styles.empty}>No locked pay periods yet. Pay stubs appear here once your admin closes a pay period.</p>
    </div>
  );

  return (
    <div style={styles.card}>
      <h2 style={styles.heading}>Pay Stubs</h2>
      <div style={styles.list}>
        {stubs.map(stub => {
          const label = stub.label || `${formatDate(stub.period_start)} – ${formatDate(stub.period_end)}`;
          const isOpen = openId === stub.id;
          const { regular_hours, prevailing_hours, total_mileage } = stub.summary;
          const total = fmtHours(regular_hours + prevailing_hours);

          return (
            <div key={stub.id} style={styles.stub}>
              <button style={styles.stubHeader} onClick={() => setOpenId(isOpen ? null : stub.id)}>
                <div style={styles.stubLeft}>
                  <span style={styles.stubLabel}>{label}</span>
                  <div style={styles.stubMeta}>
                    <span style={styles.metaChip}>{total} total</span>
                    {prevailing_hours > 0 && <span style={{ ...styles.metaChip, background: '#fef3c7', color: '#b45309' }}>{fmtHours(prevailing_hours)} prevailing</span>}
                    {total_mileage > 0 && <span style={styles.metaChip}>{total_mileage} mi</span>}
                  </div>
                </div>
                <span style={styles.chevron}>{isOpen ? '▾' : '▸'}</span>
              </button>

              {isOpen && (
                <div style={styles.stubBody}>
                  <div style={styles.statRow}>
                    <div style={styles.stat}>
                      <div style={styles.statVal}>{fmtHours(regular_hours)}</div>
                      <div style={styles.statLabel}>Regular</div>
                    </div>
                    <div style={styles.stat}>
                      <div style={{ ...styles.statVal, color: '#d97706' }}>{fmtHours(prevailing_hours)}</div>
                      <div style={styles.statLabel}>Prevailing Wage</div>
                    </div>
                    <div style={styles.stat}>
                      <div style={styles.statVal}>{total}</div>
                      <div style={styles.statLabel}>Total Hours</div>
                    </div>
                    {total_mileage > 0 && (
                      <div style={styles.stat}>
                        <div style={styles.statVal}>{total_mileage} mi</div>
                        <div style={styles.statLabel}>Mileage</div>
                      </div>
                    )}
                  </div>

                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Date</th>
                        <th style={styles.th}>Project</th>
                        <th style={styles.th}>Time</th>
                        <th style={styles.th}>Hours</th>
                        <th style={styles.th}>Type</th>
                        <th style={styles.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stub.entries.map(e => (
                        <tr key={e.id} style={styles.tr}>
                          <td style={styles.td}>{formatDate(e.work_date_str || e.work_date)}</td>
                          <td style={styles.td}>{e.project_name}</td>
                          <td style={styles.td}>{formatTime(e.start_time)} – {formatTime(e.end_time)}</td>
                          <td style={styles.td}>{fmtHours(netHours(e.start_time, e.end_time, e.break_minutes))}</td>
                          <td style={styles.td}>
                            <span style={{ ...styles.wageBadge, background: e.wage_type === 'prevailing' ? '#d97706' : '#2563eb' }}>
                              {e.wage_type === 'prevailing' ? 'PW' : 'Reg'}
                            </span>
                          </td>
                          <td style={styles.td}>
                            {e.status === 'approved' && <span style={styles.approved}>✓ Approved</span>}
                            {e.status === 'rejected' && <span style={styles.rejected}>✕ Rejected</span>}
                            {(!e.status || e.status === 'pending') && <span style={styles.pending}>Pending</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' },
  heading: { fontSize: 18, fontWeight: 700, marginBottom: 16 },
  empty: { color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: '24px 0' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  stub: { border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' },
  stubHeader: { width: '100%', background: '#f9fafb', border: 'none', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left' },
  stubLeft: { display: 'flex', flexDirection: 'column', gap: 6 },
  stubLabel: { fontSize: 15, fontWeight: 700, color: '#111827' },
  stubMeta: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  metaChip: { fontSize: 11, fontWeight: 600, background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: 10 },
  chevron: { fontSize: 14, color: '#6b7280' },
  stubBody: { padding: 16, borderTop: '1px solid #e5e7eb' },
  statRow: { display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' },
  stat: { background: '#f9fafb', borderRadius: 8, padding: '10px 16px', minWidth: 90, textAlign: 'center', flex: 1 },
  statVal: { fontSize: 20, fontWeight: 800, color: '#111827' },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 2, fontWeight: 600 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', padding: '6px 8px', borderBottom: '1px solid #f3f4f6' },
  tr: { borderBottom: '1px solid #f9fafb' },
  td: { padding: '8px 8px', color: '#374151' },
  wageBadge: { color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 },
  approved: { fontSize: 11, fontWeight: 700, color: '#059669', background: '#d1fae5', padding: '1px 6px', borderRadius: 8 },
  rejected: { fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '1px 6px', borderRadius: 8 },
  pending: { fontSize: 11, color: '#92400e', background: '#fef3c7', padding: '1px 6px', borderRadius: 8 },
};
