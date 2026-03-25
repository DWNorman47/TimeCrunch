import React, { useState, useEffect } from 'react';
import api from '../api';

export default function QuickBooks({ workers, projects }) {
  const [status, setStatus] = useState(null);
  const [qboEmployees, setQboEmployees] = useState([]);
  const [qboCustomers, setQboCustomers] = useState([]);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [workerMappings, setWorkerMappings] = useState({});
  const [projectMappings, setProjectMappings] = useState({});
  const [pushFrom, setPushFrom] = useState('');
  const [pushTo, setPushTo] = useState('');
  const [pushResult, setPushResult] = useState(null);
  const [pushing, setPushing] = useState(false);
  const [forcePush, setForcePush] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/qbo/status').then(r => setStatus(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!status?.connected) return;
    setLoadingMappings(true);
    Promise.all([api.get('/qbo/employees'), api.get('/qbo/customers')])
      .then(([e, c]) => { setQboEmployees(e.data); setQboCustomers(c.data); })
      .catch(err => setError(err.response?.data?.error || 'Failed to load QuickBooks data'))
      .finally(() => setLoadingMappings(false));

    // Pre-populate existing mappings from workers/projects
    const wm = {};
    workers.forEach(w => { if (w.qbo_employee_id) wm[w.id] = w.qbo_employee_id; });
    setWorkerMappings(wm);

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
    if (!window.confirm('Disconnect QuickBooks? Existing mappings will be preserved.')) return;
    await api.delete('/qbo/disconnect');
    setStatus({ connected: false });
  };

  const saveWorkerMapping = async (workerId, qboEmployeeId) => {
    setWorkerMappings(m => ({ ...m, [workerId]: qboEmployeeId }));
    await api.patch(`/qbo/workers/${workerId}/mapping`, { qbo_employee_id: qboEmployeeId || null });
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

  if (!status) return <p style={{ color: '#666' }}>Loading...</p>;

  return (
    <div style={styles.wrap}>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Connection</h3>
        {status.disconnected && (
          <div style={styles.reconnectBanner}>
            ⚠ Your QuickBooks authorization expired or was revoked. Reconnect to resume syncing.
          </div>
        )}
        {status.connected ? (
          <div style={styles.connectedBox}>
            <span style={styles.connectedDot} />
            <span style={{ fontWeight: 600, color: '#166534' }}>Connected to QuickBooks</span>
            {status.connected_at && (
              <span style={styles.connectedSince}>since {new Date(status.connected_at).toLocaleDateString()}</span>
            )}
            <button style={styles.disconnectBtn} onClick={handleDisconnect}>Disconnect</button>
          </div>
        ) : (
          <div>
            <p style={styles.hint}>Connect your QuickBooks Online account to push time entries directly.</p>
            <button style={styles.connectBtn} onClick={handleConnect}>
              {status.disconnected ? 'Reconnect to QuickBooks' : 'Connect to QuickBooks'}
            </button>
          </div>
        )}
        {error && <p style={styles.error}>{error}</p>}
      </div>

      {status.connected && (
        <>
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Worker Mappings</h3>
            <p style={styles.hint}>Link each worker to their corresponding employee in QuickBooks.</p>
            {loadingMappings ? <p>Loading QuickBooks employees...</p> : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>OpsFloa Worker</th>
                    <th style={styles.th}>QuickBooks Employee</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map(w => (
                    <tr key={w.id}>
                      <td style={styles.td}>{w.full_name}</td>
                      <td style={styles.td}>
                        <select
                          style={styles.select}
                          value={workerMappings[w.id] || ''}
                          onChange={e => saveWorkerMapping(w.id, e.target.value)}
                        >
                          <option value="">— Not mapped —</option>
                          {qboEmployees.map(e => (
                            <option key={e.Id} value={e.Id}>{e.DisplayName}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Project Mappings</h3>
            <p style={styles.hint}>Link each project to the corresponding customer or job in QuickBooks.</p>
            {loadingMappings ? <p>Loading QuickBooks customers...</p> : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>OpsFloa Project</th>
                    <th style={styles.th}>QuickBooks Customer / Job</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map(p => (
                    <tr key={p.id}>
                      <td style={styles.td}>{p.name}</td>
                      <td style={styles.td}>
                        <select
                          style={styles.select}
                          value={projectMappings[p.id] || ''}
                          onChange={e => saveProjectMapping(p.id, e.target.value)}
                        >
                          <option value="">— Not mapped —</option>
                          {qboCustomers.map(c => (
                            <option key={c.Id} value={c.Id}>{c.DisplayName}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Push Time Entries</h3>
            <p style={styles.hint}>Push entries to QuickBooks as Time Activities. Only mapped workers and projects will be included. Entries already synced are skipped unless you enable re-push.</p>
            <div style={styles.pushRow}>
              <div>
                <label style={styles.label}>From</label>
                <input style={styles.dateInput} type="date" value={pushFrom} onChange={e => setPushFrom(e.target.value)} />
              </div>
              <div>
                <label style={styles.label}>To</label>
                <input style={styles.dateInput} type="date" value={pushTo} onChange={e => setPushTo(e.target.value)} />
              </div>
              <button style={styles.pushBtn} onClick={handlePush} disabled={pushing}>
                {pushing ? 'Pushing...' : 'Push to QuickBooks'}
              </button>
            </div>
            <label style={styles.forceLabel}>
              <input type="checkbox" checked={forcePush} onChange={e => setForcePush(e.target.checked)} style={{ marginRight: 6 }} />
              Re-push already synced entries
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
  sectionTitle: { fontSize: 16, fontWeight: 700, color: '#1a202c', marginBottom: 12 },
  hint: { fontSize: 13, color: '#6b7280', marginBottom: 14 },
  connectedBox: { display: 'flex', alignItems: 'center', gap: 10 },
  connectedDot: { width: 10, height: 10, borderRadius: '50%', background: '#16a34a', flexShrink: 0 },
  connectedSince: { fontSize: 13, color: '#6b7280', flex: 1 },
  connectBtn: { background: '#2CA01C', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  disconnectBtn: { background: 'none', border: '1px solid #d1d5db', borderRadius: 7, padding: '6px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: '#6b7280' },
  error: { color: '#e53e3e', fontSize: 13, marginTop: 8 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #e5e7eb' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f3f4f6', fontSize: 14 },
  select: { width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 },
  pushRow: { display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 },
  dateInput: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 14 },
  pushBtn: { background: '#2CA01C', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  resultBox: { marginTop: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '14px 16px' },
  reconnectBanner: { background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 },
  forceLabel: { display: 'flex', alignItems: 'center', fontSize: 13, color: '#6b7280', marginTop: 10, cursor: 'pointer' },
};
