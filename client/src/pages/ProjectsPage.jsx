import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import AppSwitcher from '../components/AppSwitcher';
import { PDFDownloadLink } from '@react-pdf/renderer';
import ProjectBillPDF from '../components/ProjectBillPDF';

function punchColor(status) {
  return { open: '#f59e0b', in_progress: '#3b82f6', resolved: '#059669', closed: '#9ca3af' }[status] || '#9ca3af';
}

// ── Project Card ──────────────────────────────────────────────────────────────

function ProjectCard({ project, metrics, settings, onClick }) {
  const m = metrics || {};
  const totalHours = parseFloat(m.total_hours || 0);
  const budgetHours = parseFloat(project.budget_hours || 0);
  const budgetDollars = parseFloat(project.budget_dollars || 0);
  const workerCount = parseInt(m.worker_count || 0);

  const hoursUsedPct = budgetHours > 0 ? Math.min(100, (totalHours / budgetHours) * 100) : 0;

  const hourColor = hoursUsedPct >= 100 ? '#ef4444' : hoursUsedPct >= 85 ? '#f59e0b' : '#059669';

  const fmtHours = h => {
    const n = parseFloat(h);
    if (isNaN(n)) return '0h';
    return n % 1 === 0 ? `${n}h` : `${n.toFixed(1)}h`;
  };

  const fmtMoney = v => {
    const n = parseFloat(v);
    if (isNaN(n) || n === 0) return null;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: settings?.currency || 'USD', maximumFractionDigits: 0 }).format(n);
  };

  const statusColors = { planning: '#dbeafe|#1d4ed8', in_progress: '#d1fae5|#065f46', on_hold: '#fef3c7|#92400e', completed: '#e5e7eb|#374151' };
  const [statusBg, statusFg] = (statusColors[project.status] || '#f3f4f6|#6b7280').split('|');
  const statusLabel = { planning: 'Planning', in_progress: 'In Progress', on_hold: 'On Hold', completed: 'Completed' }[project.status];

  return (
    <div style={styles.card} onClick={onClick}>
      <div style={styles.cardTop}>
        <div style={styles.cardName}>{project.name}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, marginLeft: 8 }}>
          {statusLabel && <span style={{ fontSize: 10, fontWeight: 700, background: statusBg, color: statusFg, padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{statusLabel}</span>}
          <div style={styles.cardBadge}>{workerCount} worker{workerCount !== 1 ? 's' : ''}</div>
        </div>
      </div>
      {project.client_name && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8, marginTop: -4 }}>{project.client_name}{project.job_number ? ` · ${project.job_number}` : ''}</div>}

      <div style={styles.statsRow}>
        <div style={styles.statItem}>
          <div style={styles.statValue}>{fmtHours(totalHours)}</div>
          <div style={styles.statLabel}>Total hours</div>
        </div>
        {budgetHours > 0 && (
          <div style={styles.statItem}>
            <div style={{ ...styles.statValue, color: hourColor }}>{fmtHours(budgetHours)}</div>
            <div style={styles.statLabel}>Budget hours</div>
          </div>
        )}
        {m.overtime_hours > 0 && (
          <div style={styles.statItem}>
            <div style={{ ...styles.statValue, color: '#f59e0b' }}>{fmtHours(m.overtime_hours)}</div>
            <div style={styles.statLabel}>Overtime</div>
          </div>
        )}
        {budgetDollars > 0 && (
          <div style={styles.statItem}>
            <div style={styles.statValue}>{fmtMoney(budgetDollars)}</div>
            <div style={styles.statLabel}>Budget</div>
          </div>
        )}
      </div>

      {budgetHours > 0 && (
        <div style={styles.progressWrap}>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${hoursUsedPct}%`, background: hourColor }} />
          </div>
          <div style={{ ...styles.progressLabel, color: hourColor }}>
            {hoursUsedPct.toFixed(0)}% of budget hours used
          </div>
        </div>
      )}
    </div>
  );
}

// ── Project Detail Panel ──────────────────────────────────────────────────────

function ProjectDetail({ project, metrics, settings, onClose }) {
  const [tab, setTab] = useState('overview');
  const [entries, setEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [billData, setBillData] = useState(null);
  const [billLoading, setBillLoading] = useState(false);
  const [billFrom, setBillFrom] = useState('');
  const [billTo, setBillTo] = useState('');
  const [workers, setWorkers] = useState([]);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [health, setHealth] = useState(null);

  const m = metrics || {};
  const fmtHours = h => {
    const n = parseFloat(h);
    if (isNaN(n) || n === 0) return '0h';
    return n % 1 === 0 ? `${n}h` : `${n.toFixed(1)}h`;
  };
  const fmtMoney = v => {
    const n = parseFloat(v);
    if (isNaN(n) || n === 0) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: settings?.currency || 'USD', maximumFractionDigits: 0 }).format(n);
  };

  useEffect(() => {
    if (tab === 'entries') {
      setEntriesLoading(true);
      api.get(`/admin/projects/${project.id}/entries`)
        .then(r => setEntries(r.data.entries || []))
        .catch(() => {})
        .finally(() => setEntriesLoading(false));
    }
    if (tab === 'overview' && workers.length === 0) {
      setWorkersLoading(true);
      api.get(`/admin/projects/${project.id}/workers`)
        .then(r => setWorkers(r.data))
        .catch(() => {})
        .finally(() => setWorkersLoading(false));
      setActivityLoading(true);
      api.get(`/admin/projects/${project.id}/activity`)
        .then(r => setActivity(r.data))
        .catch(() => {})
        .finally(() => setActivityLoading(false));
      api.get(`/admin/projects/${project.id}/health`)
        .then(r => setHealth(r.data))
        .catch(() => {});
    }
  }, [tab, project.id]);

  const loadBilling = () => {
    setBillLoading(true);
    const params = {};
    if (billFrom) params.from = billFrom;
    if (billTo) params.to = billTo;
    api.get(`/admin/projects/${project.id}/entries`, { params })
      .then(r => setBillData(r.data))
      .catch(() => {})
      .finally(() => setBillLoading(false));
  };

  useEffect(() => {
    if (tab === 'billing' && !billData) loadBilling();
  }, [tab]);

  const budgetHours = parseFloat(project.budget_hours || 0);
  const totalHours = parseFloat(m.total_hours || 0);
  const hoursUsedPct = budgetHours > 0 ? Math.min(100, (totalHours / budgetHours) * 100) : 0;
  const hourColor = hoursUsedPct >= 100 ? '#ef4444' : hoursUsedPct >= 85 ? '#f59e0b' : '#059669';

  return (
    <div style={styles.detailOverlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={styles.detailPanel}>
        <div style={styles.detailHeader}>
          <div>
            <h2 style={styles.detailTitle}>{project.name}</h2>
            <p style={styles.detailSub}>
              {project.client_name && <>{project.client_name} · </>}
              {parseInt(m.worker_count || 0)} workers · {parseInt(m.total_entries || 0)} entries
            </p>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.detailTabs}>
          {['overview', 'billing', 'entries'].map(t => (
            <button key={t} style={{ ...styles.detailTab, ...(tab === t ? styles.detailTabActive : {}) }} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div style={styles.detailBody}>
          {tab === 'overview' && (
            <div>
              {/* Project metadata */}
              {(project.client_name || project.job_number || project.address || project.start_date || project.end_date || project.description || (project.status && project.status !== 'in_progress')) && (
                <div style={{ ...styles.budgetSection, marginBottom: 16 }}>
                  <div style={styles.sectionTitle}>Project Info</div>
                  {project.status && (() => {
                    const statusColors = { planning: '#dbeafe|#1d4ed8', in_progress: '#d1fae5|#065f46', on_hold: '#fef3c7|#92400e', completed: '#e5e7eb|#374151' };
                    const [bg, fg] = (statusColors[project.status] || '#f3f4f6|#6b7280').split('|');
                    const label = { planning: 'Planning', in_progress: 'In Progress', on_hold: 'On Hold', completed: 'Completed' }[project.status];
                    return label ? <span style={{ fontSize: 11, fontWeight: 700, background: bg, color: fg, padding: '2px 9px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-block', marginBottom: 8 }}>{label}</span> : null;
                  })()}
                  {project.client_name && <div style={styles.budgetRow}><span style={styles.budgetLabel}>Client</span><span style={styles.budgetValue}>{project.client_name}</span></div>}
                  {project.job_number && <div style={styles.budgetRow}><span style={styles.budgetLabel}>Job #</span><span style={styles.budgetValue}>{project.job_number}</span></div>}
                  {project.address && <div style={styles.budgetRow}><span style={styles.budgetLabel}>Address</span><span style={{ ...styles.budgetValue, textAlign: 'right', maxWidth: 220 }}>{project.address}</span></div>}
                  {project.start_date && <div style={styles.budgetRow}><span style={styles.budgetLabel}>Start</span><span style={styles.budgetValue}>{new Date(project.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>}
                  {project.end_date && <div style={styles.budgetRow}><span style={styles.budgetLabel}>Target End</span><span style={styles.budgetValue}>{new Date(project.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>}
                  {project.description && <p style={{ fontSize: 13, color: '#374151', margin: '8px 0 0', lineHeight: 1.5 }}>{project.description}</p>}
                </div>
              )}

              <div style={styles.metricsGrid}>
                <div style={styles.metricCard}>
                  <div style={styles.metricValue}>{fmtHours(m.total_hours)}</div>
                  <div style={styles.metricLabel}>Total Hours</div>
                </div>
                <div style={styles.metricCard}>
                  <div style={styles.metricValue}>{fmtHours(m.regular_hours)}</div>
                  <div style={styles.metricLabel}>Regular Hours</div>
                </div>
                <div style={styles.metricCard}>
                  <div style={{ ...styles.metricValue, color: parseFloat(m.overtime_hours) > 0 ? '#f59e0b' : '#111827' }}>
                    {fmtHours(m.overtime_hours)}
                  </div>
                  <div style={styles.metricLabel}>Overtime Hours</div>
                </div>
                <div style={styles.metricCard}>
                  <div style={styles.metricValue}>{parseInt(m.worker_count || 0)}</div>
                  <div style={styles.metricLabel}>Workers</div>
                </div>
              </div>

              {/* Health counts */}
              {health && (health.open_punchlist > 0 || health.open_rfis > 0 || health.reports_week > 0) && (
                <div style={styles.healthRow}>
                  {health.open_punchlist > 0 && (
                    <div style={styles.healthChip}>
                      <span style={{ ...styles.healthDot, background: '#f59e0b' }} />
                      <span>{health.open_punchlist} open punch{health.open_punchlist !== 1 ? 'list items' : 'list item'}</span>
                    </div>
                  )}
                  {health.open_rfis > 0 && (
                    <div style={styles.healthChip}>
                      <span style={{ ...styles.healthDot, background: '#3b82f6' }} />
                      <span>{health.open_rfis} open RFI{health.open_rfis !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {health.reports_week > 0 && (
                    <div style={styles.healthChip}>
                      <span style={{ ...styles.healthDot, background: '#059669' }} />
                      <span>{health.reports_week} field report{health.reports_week !== 1 ? 's' : ''} this week</span>
                    </div>
                  )}
                </div>
              )}

              {/* Worker roster */}
              {(workersLoading || workers.length > 0) && (
                <div style={{ ...styles.budgetSection, marginBottom: 16 }}>
                  <div style={styles.sectionTitle}>Workers ({workers.length})</div>
                  {workersLoading ? (
                    <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Loading…</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {workers.map(w => (
                        <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{w.worker_name}</span>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: '#6b7280' }}>
                              {parseFloat(w.total_hours).toFixed(1)}h
                            </span>
                            <span style={{ fontSize: 11, color: '#9ca3af' }}>
                              {new Date(w.last_worked).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(budgetHours > 0 || project.budget_dollars > 0) && (
                <div style={styles.budgetSection}>
                  <div style={styles.sectionTitle}>Budget</div>
                  {budgetHours > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={styles.budgetRow}>
                        <span style={styles.budgetLabel}>Hours</span>
                        <span style={{ ...styles.budgetValue, color: hourColor }}>{fmtHours(totalHours)} / {fmtHours(budgetHours)}</span>
                      </div>
                      <div style={styles.progressBar}>
                        <div style={{ ...styles.progressFill, width: `${hoursUsedPct}%`, background: hourColor }} />
                      </div>
                      <div style={{ ...styles.progressLabel, color: hourColor }}>{hoursUsedPct.toFixed(0)}% used</div>
                    </div>
                  )}
                  {project.budget_dollars > 0 && health && (() => {
                    const cost = parseFloat(health.approx_cost || 0);
                    const budget = parseFloat(project.budget_dollars);
                    const pct = Math.min(100, (cost / budget) * 100);
                    const color = pct >= 100 ? '#ef4444' : pct >= 85 ? '#f59e0b' : '#1a56db';
                    return (
                      <div style={{ marginBottom: 8 }}>
                        <div style={styles.budgetRow}>
                          <span style={styles.budgetLabel}>Est. Cost</span>
                          <span style={{ ...styles.budgetValue, color }}>{fmtMoney(cost)} / {fmtMoney(budget)}</span>
                        </div>
                        <div style={styles.progressBar}>
                          <div style={{ ...styles.progressFill, width: `${pct}%`, background: color }} />
                        </div>
                        <div style={{ ...styles.progressLabel, color }}>{pct.toFixed(0)}% of budget used</div>
                      </div>
                    );
                  })()}
                  {project.budget_dollars > 0 && !health && (
                    <div style={styles.budgetRow}>
                      <span style={styles.budgetLabel}>Dollar Budget</span>
                      <span style={styles.budgetValue}>{fmtMoney(project.budget_dollars)}</span>
                    </div>
                  )}
                </div>
              )}

              {project.wage_type && project.wage_type !== 'regular' && (
                <div style={styles.tagRow}>
                  <span style={styles.wageTag}>{project.wage_type === 'prevailing' ? 'Prevailing Wage' : project.wage_type}</span>
                </div>
              )}

              {/* Recent Activity accordion */}
              {(activityLoading || activity.length > 0) && (
                <div style={{ marginTop: 16 }}>
                  <button
                    style={styles.activityToggle}
                    onClick={() => setActivityOpen(o => !o)}
                  >
                    <span>Recent Activity</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {activity.length > 0 && <span style={styles.activityCount}>{activity.length}</span>}
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>{activityOpen ? '▴' : '▾'}</span>
                    </span>
                  </button>

                  {activityOpen && (
                    activityLoading ? (
                      <p style={{ fontSize: 12, color: '#9ca3af', margin: '8px 0 0' }}>Loading…</p>
                    ) : (
                      <div style={styles.activityList}>
                        {activity.map(item => (
                          <div key={`${item.type}-${item.id}`} style={styles.activityItem}>
                            <div style={{ ...styles.activityDot, background: item.type === 'note' ? '#059669' : punchColor(item.status) }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={styles.activityTitle}>
                                {item.type === 'punch' && (
                                  <span style={{ ...styles.activityTag, background: punchColor(item.status) + '22', color: punchColor(item.status) }}>
                                    {item.status}
                                  </span>
                                )}
                                {item.type === 'punch' && item.priority === 'high' && (
                                  <span style={{ ...styles.activityTag, background: '#fee2e2', color: '#dc2626' }}>high</span>
                                )}
                                <span style={styles.activityText}>{item.title}</span>
                              </div>
                              <div style={styles.activityMeta}>
                                {item.type === 'note' ? '📝' : '✅'}
                                {item.worker_name && <span>{item.worker_name} · </span>}
                                <span>{new Date(item.event_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} {new Date(item.event_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'billing' && (
            <div>
              <div style={styles.billFilterRow}>
                <div style={styles.fieldGroup}>
                  <label style={styles.filterLabel}>From</label>
                  <input style={styles.filterInput} type="date" value={billFrom} onChange={e => setBillFrom(e.target.value)} />
                </div>
                <div style={styles.fieldGroup}>
                  <label style={styles.filterLabel}>To</label>
                  <input style={styles.filterInput} type="date" value={billTo} onChange={e => setBillTo(e.target.value)} />
                </div>
                <button style={styles.generateBtn} onClick={loadBilling} disabled={billLoading}>
                  {billLoading ? 'Loading…' : 'Generate'}
                </button>
              </div>

              {billData && billData.summary && (
                <div>
                  <div style={styles.metricsGrid}>
                    <div style={styles.metricCard}>
                      <div style={styles.metricValue}>{parseFloat(billData.summary.total_hours).toFixed(1)}h</div>
                      <div style={styles.metricLabel}>Total Hours</div>
                    </div>
                    <div style={styles.metricCard}>
                      <div style={{ ...styles.metricValue, color: '#1a56db' }}>
                        {fmtMoney(billData.summary.total_cost)}
                      </div>
                      <div style={styles.metricLabel}>Total Cost</div>
                    </div>
                  </div>

                  <div style={styles.budgetSection}>
                    <div style={styles.sectionTitle}>Cost Breakdown</div>
                    {billData.summary.regular_hours > 0 && (
                      <div style={styles.budgetRow}>
                        <span style={styles.budgetLabel}>Regular ({parseFloat(billData.summary.regular_hours).toFixed(1)}h)</span>
                        <span style={{ ...styles.budgetValue, color: '#1a56db' }}>{fmtMoney(billData.summary.regular_cost)}</span>
                      </div>
                    )}
                    {billData.summary.overtime_hours > 0 && (
                      <div style={styles.budgetRow}>
                        <span style={styles.budgetLabel}>Overtime ({parseFloat(billData.summary.overtime_hours).toFixed(1)}h × {billData.summary.overtime_multiplier}x)</span>
                        <span style={{ ...styles.budgetValue, color: '#ef4444' }}>{fmtMoney(billData.summary.overtime_cost)}</span>
                      </div>
                    )}
                    {billData.summary.prevailing_hours > 0 && (
                      <div style={styles.budgetRow}>
                        <span style={styles.budgetLabel}>Prevailing ({parseFloat(billData.summary.prevailing_hours).toFixed(1)}h @ {fmtMoney(billData.summary.prevailing_wage_rate)}/hr)</span>
                        <span style={{ ...styles.budgetValue, color: '#f59e0b' }}>{fmtMoney(billData.summary.prevailing_cost)}</span>
                      </div>
                    )}
                    <div style={{ ...styles.budgetRow, borderTop: '1px solid #e5e7eb', marginTop: 6, paddingTop: 8 }}>
                      <span style={{ ...styles.budgetLabel, fontWeight: 700, color: '#111827' }}>Total Due</span>
                      <span style={{ ...styles.budgetValue, fontSize: 16, color: '#111827' }}>{fmtMoney(billData.summary.total_cost)}</span>
                    </div>
                  </div>

                  <PDFDownloadLink
                    document={<ProjectBillPDF data={billData} currency={settings?.currency || 'USD'} />}
                    fileName={`${project.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-billing.pdf`}
                    style={styles.pdfLink}
                  >
                    {({ loading }) => (loading ? 'Preparing PDF…' : '⬇ Download PDF Report')}
                  </PDFDownloadLink>
                </div>
              )}

              {!billData && !billLoading && (
                <p style={styles.emptyText}>Set a date range and click Generate to see billing.</p>
              )}
            </div>
          )}

          {tab === 'entries' && (
            entriesLoading ? <p style={styles.loadingText}>Loading…</p> :
            entries.length === 0 ? <p style={styles.emptyText}>No time entries for this project.</p> :
            <div style={styles.entriesTable}>
              <div style={styles.tableHeader}>
                <span style={styles.thDate}>Date</span>
                <span style={styles.thWorker}>Worker</span>
                <span style={styles.thHours}>Hours</span>
              </div>
              {entries.slice(0, 200).map(e => {
                const start = new Date(`1970-01-01T${e.start_time}`);
                const end = new Date(`1970-01-01T${e.end_time}`);
                let hrs = (end - start) / 3600000;
                if (hrs < 0) hrs += 24;
                return (
                  <div key={e.id} style={styles.tableRow}>
                    <span style={styles.tdDate}>{new Date(e.work_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <span style={styles.tdWorker}>{e.worker_name}</span>
                    <span style={styles.tdHours}>{hrs.toFixed(1)}h</span>
                  </div>
                );
              })}
              {entries.length > 200 && <p style={styles.moreText}>Showing first 200 of {entries.length} entries</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [features, setFeatures] = useState({});

  useEffect(() => {
    Promise.all([
      api.get('/admin/projects'),
      api.get('/admin/projects/metrics'),
      api.get('/settings'),
    ]).then(([pRes, mRes, sRes]) => {
      setProjects(pRes.data);
      const metricsMap = {};
      mRes.data.forEach(m => { metricsMap[m.id] = m; });
      setMetrics(metricsMap);
      setSettings(sRes.data);
      setFeatures(sRes.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const totalHours = Object.values(metrics).reduce((s, m) => s + parseFloat(m.total_hours || 0), 0);
  const activeProjects = projects.length;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logoGroup}>
          <AppSwitcher currentApp="projects" userRole={user?.role} features={features} />
          {user?.company_name && <span style={styles.companyName}>{user.company_name}</span>}
        </div>
        <div style={styles.headerRight}>
          <button style={styles.headerBtn} onClick={logout}>Logout</button>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.pageHeader}>
          <h1 style={styles.pageTitle}>Projects</h1>
          <p style={styles.pageSub}>
            {activeProjects} active project{activeProjects !== 1 ? 's' : ''}
            {totalHours > 0 && ` · ${totalHours.toFixed(0)} total hours`}
          </p>
        </div>

        {loading ? (
          <p style={styles.loadingText}>Loading…</p>
        ) : projects.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>📁</div>
            <p style={styles.emptyText}>No active projects. Create projects in Administration.</p>
          </div>
        ) : (
          <div style={styles.grid}>
            {projects.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                metrics={metrics[p.id]}
                settings={settings}
                onClick={() => setSelected(p)}
              />
            ))}
          </div>
        )}

        {selected && (
          <ProjectDetail
            project={selected}
            metrics={metrics[selected.id]}
            settings={settings}
            onClose={() => setSelected(null)}
          />
        )}
      </main>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: { minHeight: '100vh', background: '#f4f6f9', display: 'flex', flexDirection: 'column' },
  header: { background: '#7c3aed', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 },
  logoGroup: { display: 'flex', alignItems: 'center', gap: 10 },
  companyName: { fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)' },
  headerRight: { display: 'flex', gap: 12, alignItems: 'center' },
  headerBtn: { background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  main: { flex: 1, padding: '24px 20px', maxWidth: 1100, margin: '0 auto', width: '100%' },
  pageHeader: { marginBottom: 24 },
  pageTitle: { fontSize: 28, fontWeight: 800, color: '#111827', margin: 0 },
  pageSub: { fontSize: 14, color: '#6b7280', margin: '4px 0 0' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 },
  // Card
  card: { background: '#fff', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', cursor: 'pointer', transition: 'box-shadow 0.15s', borderLeft: '4px solid #7c3aed' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardName: { fontSize: 16, fontWeight: 700, color: '#111827', lineHeight: 1.3 },
  cardBadge: { fontSize: 11, fontWeight: 600, background: '#ede9fe', color: '#7c3aed', padding: '2px 8px', borderRadius: 10, flexShrink: 0, marginLeft: 8 },
  statsRow: { display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 },
  statItem: {},
  statValue: { fontSize: 20, fontWeight: 800, color: '#111827' },
  statLabel: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  progressWrap: { marginTop: 8 },
  progressBar: { height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: '100%', borderRadius: 3, transition: 'width 0.3s' },
  progressLabel: { fontSize: 11, fontWeight: 600 },
  // Loading / empty
  loadingText: { color: '#9ca3af', fontSize: 14, marginTop: 20 },
  empty: { textAlign: 'center', padding: '80px 20px' },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  // Detail panel
  detailOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', justifyContent: 'flex-end' },
  detailPanel: { width: '100%', maxWidth: 480, background: '#fff', height: '100%', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' },
  detailHeader: { padding: '20px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f3f4f6', paddingBottom: 16 },
  detailTitle: { fontSize: 20, fontWeight: 800, color: '#111827', margin: 0 },
  detailSub: { fontSize: 13, color: '#6b7280', margin: '4px 0 0' },
  closeBtn: { background: '#f3f4f6', border: 'none', borderRadius: 20, width: 32, height: 32, cursor: 'pointer', fontSize: 14, color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  detailTabs: { display: 'flex', borderBottom: '1px solid #f3f4f6', padding: '0 20px' },
  detailTab: { padding: '12px 16px', border: 'none', background: 'none', fontSize: 13, fontWeight: 600, color: '#6b7280', cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: -1 },
  detailTabActive: { color: '#7c3aed', borderBottomColor: '#7c3aed' },
  detailBody: { flex: 1, overflowY: 'auto', padding: 20 },
  metricsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 },
  metricCard: { background: '#f9fafb', borderRadius: 10, padding: '12px 14px' },
  metricValue: { fontSize: 22, fontWeight: 800, color: '#111827' },
  metricLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' },
  budgetSection: { background: '#f9fafb', borderRadius: 10, padding: '14px 16px', marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 10 },
  budgetRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 6 },
  budgetLabel: { fontSize: 13, color: '#6b7280' },
  budgetValue: { fontSize: 13, fontWeight: 700, color: '#111827' },
  tagRow: { display: 'flex', gap: 6, marginTop: 10 },
  wageTag: { fontSize: 11, fontWeight: 600, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 10 },
  // Billing
  billFilterRow: { display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  filterLabel: { fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' },
  filterInput: { padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff' },
  generateBtn: { background: '#7c3aed', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', alignSelf: 'flex-end' },
  pdfLink: { display: 'inline-block', marginTop: 16, background: '#eff6ff', color: '#1a56db', border: '1px solid #bfdbfe', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' },
  // Entries table
  entriesTable: { display: 'flex', flexDirection: 'column', gap: 2 },
  tableHeader: { display: 'flex', gap: 8, padding: '6px 10px', background: '#f9fafb', borderRadius: 6, marginBottom: 4 },
  tableRow: { display: 'flex', gap: 8, padding: '8px 10px', borderRadius: 6, fontSize: 13 },
  thDate: { flex: 1.2, fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' },
  thWorker: { flex: 2, fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' },
  thHours: { width: 50, textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' },
  tdDate: { flex: 1.2, color: '#6b7280' },
  tdWorker: { flex: 2, fontWeight: 600, color: '#111827' },
  tdHours: { width: 50, textAlign: 'right', fontWeight: 700, color: '#374151' },
  moreText: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 8 },
  // Health
  healthRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 },
  healthChip: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#374151', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 20, padding: '4px 10px' },
  healthDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  // Activity
  activityToggle: { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em' },
  activityCount: { fontSize: 11, fontWeight: 700, color: '#fff', background: '#9ca3af', padding: '1px 7px', borderRadius: 10 },
  activityList: { display: 'flex', flexDirection: 'column', gap: 1, marginTop: 6 },
  activityItem: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 7, background: '#fafafa', border: '1px solid #f3f4f6' },
  activityDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4 },
  activityTitle: { display: 'flex', gap: 4, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 2 },
  activityTag: { fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 },
  activityText: { fontSize: 13, color: '#111827', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' },
  activityMeta: { display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, color: '#9ca3af', flexWrap: 'wrap' },
};
