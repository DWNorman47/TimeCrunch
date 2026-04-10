import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import { useT } from '../hooks/useT';

const VENDOR_TYPES = ['contractor', 'subcontractor'];
const EMPLOYEE_TYPES = ['employee', 'owner'];
const IMPORT_PAGE_SIZE = 15;
const MAP_PAGE_SIZE = 20;

function Paginator({ page, total, pageSize, onChange }) {
  if (total <= pageSize) return null;
  const totalPages = Math.ceil(total / pageSize);
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);
  return (
    <div style={styles.paginator}>
      <button style={styles.pageBtn} onClick={() => onChange(page - 1)} disabled={page === 0}>‹</button>
      <span style={styles.pageInfo}>{start}–{end} of {total}</span>
      <button style={styles.pageBtn} onClick={() => onChange(page + 1)} disabled={page >= totalPages - 1}>›</button>
    </div>
  );
}

export default function QuickBooks({ workers, projects, onWorkersImported, onProjectsImported }) {
  const t = useT();
  const [status, setStatus] = useState(null);
  const [qboEmployees, setQboEmployees] = useState([]);
  const [qboVendors, setQboVendors] = useState([]);
  const [qboCustomers, setQboCustomers] = useState([]);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [employeeMappings, setEmployeeMappings] = useState({});
  const [vendorMappings, setVendorMappings] = useState({});
  const [projectMappings, setProjectMappings] = useState({});
  const [pushFrom, setPushFrom] = useState('');
  const [pushTo, setPushTo] = useState('');
  const [pushResult, setPushResult] = useState(null);
  const [pushing, setPushing] = useState(false);
  const [forcePush, setForcePush] = useState(false);
  const [error, setError] = useState('');
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  // Import state
  const [selectedWorkers, setSelectedWorkers] = useState(new Set());
  const [selectedVendors, setSelectedVendors] = useState(new Set());
  const [vendorTypes, setVendorTypes] = useState({});
  const [selectedProjects, setSelectedProjects] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Import search + pagination
  const [importSearch, setImportSearch] = useState('');
  const [empImportPage, setEmpImportPage] = useState(0);
  const [vendImportPage, setVendImportPage] = useState(0);
  const [custImportPage, setCustImportPage] = useState(0);

  // Mapping table pagination
  const [workerMapPages, setWorkerMapPages] = useState({});
  const [projectMapPage, setProjectMapPage] = useState(0);

  // Reset import pages when search changes
  useEffect(() => {
    setEmpImportPage(0);
    setVendImportPage(0);
    setCustImportPage(0);
  }, [importSearch]);

  useEffect(() => {
    api.get('/qbo/status').then(r => setStatus(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!status?.connected) return;
    setLoadingMappings(true);
    Promise.all([api.get('/qbo/employees'), api.get('/qbo/vendors'), api.get('/qbo/customers')])
      .then(([e, v, c]) => {
        setQboEmployees(e.data);
        setQboVendors(v.data);
        setQboCustomers(c.data);
      })
      .catch(err => {
        const code = err.response?.data?.code;
        if (code === 'qbo_auth_expired') {
          setStatus(s => ({ ...s, connected: false, disconnected: true }));
        } else {
          setError(err.response?.data?.error || 'Failed to load QuickBooks data');
        }
      })
      .finally(() => setLoadingMappings(false));

    const em = {};
    const vm = {};
    workers.forEach(w => {
      if (VENDOR_TYPES.includes(w.worker_type) && w.qbo_vendor_id) vm[w.id] = w.qbo_vendor_id;
      else if (w.qbo_employee_id) em[w.id] = w.qbo_employee_id;
    });
    setEmployeeMappings(em);
    setVendorMappings(vm);

    const pm = {};
    projects.forEach(p => { if (p.qbo_customer_id) pm[p.id] = p.qbo_customer_id; });
    setProjectMappings(pm);
  }, [status?.connected]);

  const handleConnect = async () => {
    try {
      const r = await api.get('/qbo/connect');
      window.location.href = r.data.url;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to connect');
    }
  };

  const handleDisconnect = async () => {
    setConfirmingDisconnect(false);
    await api.delete('/qbo/disconnect');
    setStatus({ connected: false });
  };

  const saveEmployeeMapping = async (workerId, qboEmployeeId) => {
    setEmployeeMappings(m => ({ ...m, [workerId]: qboEmployeeId }));
    await api.patch(`/qbo/workers/${workerId}/mapping`, { qbo_employee_id: qboEmployeeId || null });
  };

  const saveVendorMapping = async (workerId, qboVendorId) => {
    setVendorMappings(m => ({ ...m, [workerId]: qboVendorId }));
    await api.patch(`/qbo/workers/${workerId}/mapping`, { qbo_vendor_id: qboVendorId || null });
  };

  const saveProjectMapping = async (projectId, qboCustomerId) => {
    setProjectMappings(m => ({ ...m, [projectId]: qboCustomerId }));
    await api.patch(`/qbo/projects/${projectId}/mapping`, { qbo_customer_id: qboCustomerId || null });
  };

  const handlePush = async () => {
    setPushing(true);
    setPushResult(null);
    setError('');
    try {
      const r = await api.post('/qbo/push', { from: pushFrom || undefined, to: pushTo || undefined, force: forcePush || undefined });
      setPushResult(r.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Push failed');
    } finally {
      setPushing(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setImportResult(null);
    setError('');
    try {
      const workerPayload = [
        ...qboEmployees
          .filter(e => selectedWorkers.has(e.Id))
          .map(e => ({
            display_name: e.DisplayName,
            email: e.PrimaryEmailAddr?.Address || null,
            qbo_employee_id: e.Id,
            worker_type: 'employee',
          })),
        ...qboVendors
          .filter(v => selectedVendors.has(v.Id))
          .map(v => ({
            display_name: v.DisplayName,
            email: v.PrimaryEmailAddr?.Address || null,
            qbo_vendor_id: v.Id,
            worker_type: vendorTypes[v.Id] || 'contractor',
          })),
      ];
      const projectPayload = qboCustomers
        .filter(c => selectedProjects.has(c.Id))
        .map(c => ({ name: c.DisplayName, qbo_customer_id: c.Id }));

      const results = {};
      if (workerPayload.length > 0) {
        const r = await api.post('/qbo/import/workers', { workers: workerPayload });
        results.workers = r.data;
        if (r.data.imported.length > 0 && onWorkersImported) onWorkersImported(r.data.imported);
      }
      if (projectPayload.length > 0) {
        const r = await api.post('/qbo/import/projects', { projects: projectPayload });
        results.projects = r.data;
        if (r.data.imported.length > 0 && onProjectsImported) onProjectsImported(r.data.imported);
      }
      setImportResult(results);
      setSelectedWorkers(new Set());
      setSelectedVendors(new Set());
      setSelectedProjects(new Set());
      setImportSearch('');
    } catch (err) {
      setError(err.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  // Filtered import lists
  const q = importSearch.trim().toLowerCase();
  const filteredEmployees = useMemo(() =>
    q ? qboEmployees.filter(e => e.DisplayName?.toLowerCase().includes(q) || e.PrimaryEmailAddr?.Address?.toLowerCase().includes(q)) : qboEmployees,
    [qboEmployees, q]);
  const filteredVendors = useMemo(() =>
    q ? qboVendors.filter(v => v.DisplayName?.toLowerCase().includes(q) || v.PrimaryEmailAddr?.Address?.toLowerCase().includes(q)) : qboVendors,
    [qboVendors, q]);
  const filteredCustomers = useMemo(() =>
    q ? qboCustomers.filter(c => c.DisplayName?.toLowerCase().includes(q)) : qboCustomers,
    [qboCustomers, q]);

  if (!status) return <p style={{ color: '#666' }}>{t.loading}</p>;

  const TYPE_LABELS = {
    employee: t.qboTypeEmployee,
    owner: t.qboTypeOwner,
    contractor: t.qboTypeContractor,
    subcontractor: t.qboTypeSubcontractor,
  };

  const workersByType = {};
  workers.forEach(w => {
    const wtype = w.worker_type || 'employee';
    if (!workersByType[wtype]) workersByType[wtype] = [];
    workersByType[wtype].push(w);
  });
  const typeOrder = ['employee', 'owner', 'contractor', 'subcontractor'];
  const presentTypes = typeOrder.filter(wtype => workersByType[wtype]?.length > 0);

  const mappedEmployeeIds = new Set(Object.values(employeeMappings));
  const mappedVendorIds = new Set(Object.values(vendorMappings));
  const mappedCustomerIds = new Set(Object.values(projectMappings));
  const unmappedEmployees = filteredEmployees.filter(e => !mappedEmployeeIds.has(e.Id));
  const unmappedVendors = filteredVendors.filter(v => !mappedVendorIds.has(v.Id));
  const unmappedCustomers = filteredCustomers.filter(c => !mappedCustomerIds.has(c.Id));

  const totalUnmapped =
    qboEmployees.filter(e => !mappedEmployeeIds.has(e.Id)).length +
    qboVendors.filter(v => !mappedVendorIds.has(v.Id)).length +
    qboCustomers.filter(c => !mappedCustomerIds.has(c.Id)).length;

  const totalSelections = selectedWorkers.size + selectedVendors.size + selectedProjects.size;

  return (
    <div style={styles.wrap}>
      {/* ── Connection ── */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>{t.qboConnection}</h3>
        {status.disconnected && (
          <div style={styles.reconnectBanner}>⚠ {t.qboReconnectBanner}</div>
        )}
        {status.connected ? (
          <div style={styles.connectedBox}>
            <span style={styles.connectedDot} />
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600, color: '#166534' }}>
                {status.qbo_company_name || t.qboConnected}
              </span>
              {status.connected_at && (
                <span style={styles.connectedSince}> · {t.qboConnectedSince} {new Date(status.connected_at).toLocaleDateString()}</span>
              )}
            </div>
            {confirmingDisconnect ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#374151' }}>{t.qboDisconnectConfirm}</span>
                <button style={styles.disconnectBtn} onClick={handleDisconnect}>{t.confirm}</button>
                <button style={styles.cancelBtn} onClick={() => setConfirmingDisconnect(false)}>{t.cancel}</button>
              </div>
            ) : (
              <button style={styles.disconnectBtn} onClick={() => setConfirmingDisconnect(true)}>{t.qboDisconnect}</button>
            )}
          </div>
        ) : (
          <div>
            <p style={styles.hint}>{t.qboConnectionHint}</p>
            <button style={styles.connectBtn} onClick={handleConnect}>
              {status.disconnected ? t.qboReconnect : t.qboConnect}
            </button>
          </div>
        )}
        {error && <p style={styles.error}>{error}</p>}
      </div>

      {status.connected && (
        <>
          {/* ── Worker mapping tables ── */}
          {presentTypes.map(type => {
            const isVendorType = VENDOR_TYPES.includes(type);
            const qboList = isVendorType ? qboVendors : qboEmployees;
            const qboLabel = isVendorType ? t.qboQBVendor : t.qboQBEmployee;
            const mappings = isVendorType ? vendorMappings : employeeMappings;
            const saveFn = isVendorType ? saveVendorMapping : saveEmployeeMapping;
            const typeWorkers = workersByType[type];
            const page = workerMapPages[type] || 0;
            const pagedWorkers = typeWorkers.slice(page * MAP_PAGE_SIZE, (page + 1) * MAP_PAGE_SIZE);
            return (
              <div key={type} style={styles.section}>
                <div style={styles.sectionHeader}>
                  <h3 style={styles.sectionTitle}>{TYPE_LABELS[type]}</h3>
                  <span style={styles.countBadge}>{typeWorkers.length}</span>
                </div>
                {loadingMappings ? <p>{t.qboLoadingData}</p> : (
                  <>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>{t.qboOpsFloaWorker}</th>
                          <th style={styles.th}>{qboLabel}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedWorkers.map(w => (
                          <tr key={w.id}>
                            <td style={styles.td}>{w.full_name}</td>
                            <td style={styles.td}>
                              <select
                                style={styles.select}
                                value={mappings[w.id] || ''}
                                onChange={e => saveFn(w.id, e.target.value)}
                              >
                                <option value="">{t.qboNotMapped}</option>
                                {qboList.map(e => (
                                  <option key={e.Id} value={e.Id}>{e.DisplayName}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Paginator
                      page={page}
                      total={typeWorkers.length}
                      pageSize={MAP_PAGE_SIZE}
                      onChange={p => setWorkerMapPages(prev => ({ ...prev, [type]: p }))}
                    />
                  </>
                )}
              </div>
            );
          })}

          {/* ── Project mapping table ── */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <h3 style={styles.sectionTitle}>{t.qboProjectMappings}</h3>
              <span style={styles.countBadge}>{projects.length}</span>
            </div>
            <p style={styles.hint}>{t.qboProjectMappingsHint}</p>
            {loadingMappings ? <p>{t.qboLoadingCustomers}</p> : (
              <>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>{t.qboOpsFloaProject}</th>
                      <th style={styles.th}>{t.qboQBCustomer}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.slice(projectMapPage * MAP_PAGE_SIZE, (projectMapPage + 1) * MAP_PAGE_SIZE).map(p => (
                      <tr key={p.id}>
                        <td style={styles.td}>{p.name}</td>
                        <td style={styles.td}>
                          <select
                            style={styles.select}
                            value={projectMappings[p.id] || ''}
                            onChange={e => saveProjectMapping(p.id, e.target.value)}
                          >
                            <option value="">{t.qboNotMapped}</option>
                            {qboCustomers.map(c => (
                              <option key={c.Id} value={c.Id}>{c.DisplayName}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Paginator
                  page={projectMapPage}
                  total={projects.length}
                  pageSize={MAP_PAGE_SIZE}
                  onChange={setProjectMapPage}
                />
              </>
            )}
          </div>

          {/* ── Import from QuickBooks ── */}
          {!loadingMappings && totalUnmapped > 0 && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                <h3 style={styles.sectionTitle}>{t.qboImportFromQB}</h3>
                {totalSelections > 0 && (
                  <span style={styles.selectedBadge}>{totalSelections} selected</span>
                )}
              </div>
              <p style={styles.hint}>{t.qboImportHint}</p>

              <input
                style={styles.searchInput}
                type="text"
                placeholder="Search by name or email…"
                value={importSearch}
                onChange={e => setImportSearch(e.target.value)}
              />

              {/* Employees */}
              {unmappedEmployees.length > 0 && (() => {
                const page = empImportPage;
                const paged = unmappedEmployees.slice(page * IMPORT_PAGE_SIZE, (page + 1) * IMPORT_PAGE_SIZE);
                const allUnmappedEmpIds = qboEmployees.filter(e => !mappedEmployeeIds.has(e.Id)).map(e => e.Id);
                return (
                  <div style={styles.importGroup}>
                    <div style={styles.importGroupLabel}>
                      <span>{t.qboEmployeesGroup}</span>
                      {selectedWorkers.size > 0 && <span style={styles.groupBadge}>{selectedWorkers.size}</span>}
                      <button style={styles.selectAllBtn} onClick={() =>
                        setSelectedWorkers(s => s.size === allUnmappedEmpIds.length ? new Set() : new Set(allUnmappedEmpIds))
                      }>
                        {selectedWorkers.size === allUnmappedEmpIds.length ? t.qboDeselectAll : t.qboSelectAll}
                      </button>
                    </div>
                    {paged.map(e => (
                      <label key={e.Id} style={styles.importRow}>
                        <input type="checkbox" checked={selectedWorkers.has(e.Id)} onChange={() => setSelectedWorkers(s => {
                          const n = new Set(s); n.has(e.Id) ? n.delete(e.Id) : n.add(e.Id); return n;
                        })} />
                        <span style={styles.importName}>{e.DisplayName}</span>
                        {e.PrimaryEmailAddr?.Address && <span style={styles.importEmail}>{e.PrimaryEmailAddr.Address}</span>}
                      </label>
                    ))}
                    <Paginator
                      page={page}
                      total={unmappedEmployees.length}
                      pageSize={IMPORT_PAGE_SIZE}
                      onChange={setEmpImportPage}
                    />
                  </div>
                );
              })()}

              {/* Vendors */}
              {unmappedVendors.length > 0 && (() => {
                const page = vendImportPage;
                const paged = unmappedVendors.slice(page * IMPORT_PAGE_SIZE, (page + 1) * IMPORT_PAGE_SIZE);
                const allUnmappedVendIds = qboVendors.filter(v => !mappedVendorIds.has(v.Id)).map(v => v.Id);
                return (
                  <div style={styles.importGroup}>
                    <div style={styles.importGroupLabel}>
                      <span>{t.qboVendorsGroup}</span>
                      {selectedVendors.size > 0 && <span style={styles.groupBadge}>{selectedVendors.size}</span>}
                      <button style={styles.selectAllBtn} onClick={() =>
                        setSelectedVendors(s => s.size === allUnmappedVendIds.length ? new Set() : new Set(allUnmappedVendIds))
                      }>
                        {selectedVendors.size === allUnmappedVendIds.length ? t.qboDeselectAll : t.qboSelectAll}
                      </button>
                    </div>
                    {paged.map(v => (
                      <label key={v.Id} style={styles.importRow}>
                        <input type="checkbox" checked={selectedVendors.has(v.Id)} onChange={() => setSelectedVendors(s => {
                          const n = new Set(s); n.has(v.Id) ? n.delete(v.Id) : n.add(v.Id); return n;
                        })} />
                        <span style={styles.importName}>{v.DisplayName}</span>
                        {v.PrimaryEmailAddr?.Address && <span style={styles.importEmail}>{v.PrimaryEmailAddr.Address}</span>}
                        <select
                          style={styles.importTypeSelect}
                          value={vendorTypes[v.Id] || 'contractor'}
                          onChange={e => { e.stopPropagation(); setVendorTypes(prev => ({ ...prev, [v.Id]: e.target.value })); }}
                          onClick={e => e.stopPropagation()}
                        >
                          <option value="contractor">Contractor</option>
                          <option value="subcontractor">Subcontractor</option>
                          <option value="owner">Owner / Officer</option>
                        </select>
                      </label>
                    ))}
                    <Paginator
                      page={page}
                      total={unmappedVendors.length}
                      pageSize={IMPORT_PAGE_SIZE}
                      onChange={setVendImportPage}
                    />
                  </div>
                );
              })()}

              {/* Customers */}
              {unmappedCustomers.length > 0 && (() => {
                const page = custImportPage;
                const paged = unmappedCustomers.slice(page * IMPORT_PAGE_SIZE, (page + 1) * IMPORT_PAGE_SIZE);
                const allUnmappedCustIds = qboCustomers.filter(c => !mappedCustomerIds.has(c.Id)).map(c => c.Id);
                return (
                  <div style={styles.importGroup}>
                    <div style={styles.importGroupLabel}>
                      <span>{t.qboCustomersGroup}</span>
                      {selectedProjects.size > 0 && <span style={styles.groupBadge}>{selectedProjects.size}</span>}
                      <button style={styles.selectAllBtn} onClick={() =>
                        setSelectedProjects(s => s.size === allUnmappedCustIds.length ? new Set() : new Set(allUnmappedCustIds))
                      }>
                        {selectedProjects.size === allUnmappedCustIds.length ? t.qboDeselectAll : t.qboSelectAll}
                      </button>
                    </div>
                    {paged.map(c => (
                      <label key={c.Id} style={styles.importRow}>
                        <input type="checkbox" checked={selectedProjects.has(c.Id)} onChange={() => setSelectedProjects(s => {
                          const n = new Set(s); n.has(c.Id) ? n.delete(c.Id) : n.add(c.Id); return n;
                        })} />
                        <span style={styles.importName}>{c.DisplayName}</span>
                      </label>
                    ))}
                    <Paginator
                      page={page}
                      total={unmappedCustomers.length}
                      pageSize={IMPORT_PAGE_SIZE}
                      onChange={setCustImportPage}
                    />
                  </div>
                );
              })()}

              {q && unmappedEmployees.length === 0 && unmappedVendors.length === 0 && unmappedCustomers.length === 0 && (
                <p style={styles.hint}>No results for "{importSearch}"</p>
              )}

              <button
                style={{ ...styles.pushBtn, marginTop: 16, opacity: totalSelections === 0 ? 0.5 : 1 }}
                onClick={handleImport}
                disabled={importing || totalSelections === 0}
              >
                {importing ? t.qboImporting : `${t.qboImportSelected} (${totalSelections})`}
              </button>

              {importResult && (
                <div style={styles.resultBox}>
                  {importResult.workers && (
                    <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#166534' }}>
                      {importResult.workers.imported.length} worker{importResult.workers.imported.length !== 1 ? 's' : ''} imported.
                      {importResult.workers.temp_password && (
                        <span style={{ fontWeight: 400, color: '#374151' }}> Temp password: <code>{importResult.workers.temp_password}</code></span>
                      )}
                    </p>
                  )}
                  {importResult.projects && (
                    <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#166534' }}>
                      {importResult.projects.imported.length} project{importResult.projects.imported.length !== 1 ? 's' : ''} imported.
                    </p>
                  )}
                  {(importResult.workers?.skipped?.length > 0 || importResult.projects?.skipped?.length > 0) && (
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ cursor: 'pointer', color: '#92400e', fontWeight: 600, fontSize: 13 }}>
                        {(importResult.workers?.skipped?.length || 0) + (importResult.projects?.skipped?.length || 0)} skipped
                      </summary>
                      <ul style={{ marginTop: 4, paddingLeft: 18 }}>
                        {[...(importResult.workers?.skipped || []), ...(importResult.projects?.skipped || [])].map((s, i) => (
                          <li key={i} style={{ fontSize: 13, color: '#666' }}>{s.display_name || s.name}: {s.reason}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Push time entries ── */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>{t.qboPushEntries}</h3>
            <p style={styles.hint}>{t.qboPushHint}</p>
            <div style={styles.pushRow}>
              <div>
                <label style={styles.label}>{t.qboFrom}</label>
                <input style={styles.dateInput} type="date" value={pushFrom} onChange={e => setPushFrom(e.target.value)} />
              </div>
              <div>
                <label style={styles.label}>{t.qboTo}</label>
                <input style={styles.dateInput} type="date" value={pushTo} onChange={e => setPushTo(e.target.value)} />
              </div>
              <button style={styles.pushBtn} onClick={handlePush} disabled={pushing}>
                {pushing ? t.qboPushing : t.qboPush}
              </button>
            </div>
            <label style={styles.forceLabel}>
              <input type="checkbox" checked={forcePush} onChange={e => setForcePush(e.target.checked)} style={{ marginRight: 6 }} />
              {t.qboRepush}
            </label>
            {pushResult && (
              <div style={styles.resultBox}>
                <p style={{ margin: 0, fontWeight: 600, color: '#166534' }}>
                  {pushResult.pushed} {pushResult.pushed === 1 ? 'entry' : 'entries'} pushed successfully.
                </p>
                {pushResult.already_synced > 0 && (
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280' }}>
                    {pushResult.already_synced} already synced (skipped).
                  </p>
                )}
                {pushResult.skipped.length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer', color: '#92400e', fontWeight: 600 }}>
                      {pushResult.skipped.length} skipped
                    </summary>
                    <ul style={{ marginTop: 6, paddingLeft: 20 }}>
                      {pushResult.skipped.map((s, i) => (
                        <li key={i} style={{ fontSize: 13, color: '#666' }}>{s.reason}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 24 },
  section: { background: '#fff', borderRadius: 12, padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: '#1a202c', margin: 0 },
  countBadge: { fontSize: 11, fontWeight: 700, background: '#f3f4f6', color: '#6b7280', padding: '2px 8px', borderRadius: 10 },
  selectedBadge: { fontSize: 11, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 10, marginLeft: 'auto' },
  hint: { fontSize: 13, color: '#6b7280', marginBottom: 14 },
  connectedBox: { display: 'flex', alignItems: 'center', gap: 10 },
  connectedDot: { width: 10, height: 10, borderRadius: '50%', background: '#16a34a', flexShrink: 0 },
  connectedSince: { fontSize: 13, color: '#6b7280', flex: 1 },
  connectBtn: { background: '#2CA01C', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  disconnectBtn: { background: 'none', border: '1px solid #d1d5db', borderRadius: 7, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: '#6b7280' },
  cancelBtn: { background: '#e5e7eb', border: 'none', borderRadius: 7, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: '#374151' },
  error: { color: '#e53e3e', fontSize: 13, marginTop: 8 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f3f4f6', fontSize: 14 },
  select: { width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 },
  searchInput: { width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, marginBottom: 16, boxSizing: 'border-box' },
  pushRow: { display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 },
  dateInput: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 14 },
  pushBtn: { background: '#2CA01C', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  resultBox: { marginTop: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '14px 16px' },
  reconnectBanner: { background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 },
  forceLabel: { display: 'flex', alignItems: 'center', fontSize: 13, color: '#6b7280', marginTop: 10, cursor: 'pointer' },
  importGroup: { marginBottom: 20, borderBottom: '1px solid #f3f4f6', paddingBottom: 16 },
  importGroupLabel: { fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 },
  groupBadge: { fontSize: 11, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8', padding: '2px 7px', borderRadius: 10 },
  selectAllBtn: { background: 'none', border: 'none', color: '#1a56db', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, marginLeft: 'auto' },
  importRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f9fafb', cursor: 'pointer', fontSize: 14 },
  importName: { flex: 1, fontWeight: 500, color: '#111827' },
  importEmail: { fontSize: 12, color: '#9ca3af' },
  importTypeSelect: { padding: '4px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, minHeight: 'unset' },
  paginator: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, justifyContent: 'flex-end' },
  pageBtn: { background: '#f3f4f6', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 16, cursor: 'pointer', color: '#374151', minHeight: 'unset', lineHeight: 1 },
  pageInfo: { fontSize: 13, color: '#6b7280', fontVariantNumeric: 'tabular-nums' },
};
