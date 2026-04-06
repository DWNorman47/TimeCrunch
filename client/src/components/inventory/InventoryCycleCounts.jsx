import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';

const STATUS_COLORS = {
  draft:       { color: '#6b7280', bg: '#f3f4f6', label: 'Draft' },
  in_progress: { color: '#2563eb', bg: '#dbeafe', label: 'In Progress' },
  completed:   { color: '#059669', bg: '#d1fae5', label: 'Completed' },
};

function CycleCountDetail({ count, onBack, onComplete }) {
  const [lines, setLines] = useState(count.lines || []);
  const [countData, setCountData] = useState(count);
  const [saving, setSaving] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const patchLine = async (line, countedQty) => {
    setSaving(line.id);
    try {
      const r = await api.patch(`/inventory/cycle-counts/${count.id}/lines/${line.id}`, { counted_qty: countedQty });
      setLines(prev => prev.map(l => l.id === line.id ? { ...l, ...r.data, variance: parseFloat(countedQty) - parseFloat(l.expected_qty) } : l));
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to save count.');
    } finally {
      setSaving(null);
    }
  };

  const advanceStatus = async () => {
    try {
      const r = await api.patch(`/inventory/cycle-counts/${count.id}`, { status: 'in_progress' });
      setCountData(r.data);
    } catch (e) { alert(e.response?.data?.error || 'Failed to update status.'); }
  };

  const complete = async () => {
    setCompleting(true); setError('');
    try {
      await api.post(`/inventory/cycle-counts/${count.id}/complete`);
      onComplete();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to complete count.');
    } finally {
      setCompleting(false); setConfirmOpen(false);
    }
  };

  const uncounted = lines.filter(l => l.counted_qty === null || l.counted_qty === undefined).length;
  const variantLines = lines.filter(l => l.counted_qty !== null && l.counted_qty !== undefined && parseFloat(l.variance ?? (parseFloat(l.counted_qty) - parseFloat(l.expected_qty))) !== 0);
  const sc = STATUS_COLORS[countData.status] || STATUS_COLORS.draft;

  return (
    <div style={d.wrap}>
      <button style={d.back} onClick={onBack}>← Back to Cycle Counts</button>

      <div style={d.header}>
        <div>
          <h2 style={d.title}>Count — {countData.location_name}</h2>
          <p style={d.sub}>Started by {countData.started_by_name} · {new Date(countData.started_at).toLocaleDateString()}</p>
        </div>
        <div style={d.headerRight}>
          <span style={{ ...d.statusBadge, color: sc.color, background: sc.bg }}>{sc.label}</span>
          {countData.status === 'draft' && (
            <button style={d.advanceBtn} onClick={advanceStatus}>Start Counting</button>
          )}
          {countData.status === 'in_progress' && (
            <button
              style={{ ...d.completeBtn, opacity: uncounted > 0 ? 0.5 : 1 }}
              onClick={() => uncounted > 0 ? alert(`${uncounted} item(s) not yet counted.`) : setConfirmOpen(true)}
            >
              Complete Count
            </button>
          )}
        </div>
      </div>

      {error && <div style={d.error}>{error}</div>}

      {lines.length === 0 ? (
        <div style={d.empty}>No items were in stock at this location when the count was created.</div>
      ) : (
        <div style={d.tableWrap}>
          <table style={d.table}>
            <thead>
              <tr style={d.thead}>
                <th style={d.th}>Item</th>
                <th style={d.th}>SKU</th>
                <th style={d.th}>Unit</th>
                <th style={{ ...d.th, textAlign: 'right' }}>Expected</th>
                <th style={{ ...d.th, textAlign: 'right' }}>Counted</th>
                <th style={{ ...d.th, textAlign: 'right' }}>Variance</th>
                <th style={d.th}>Counted By</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const counted = line.counted_qty !== null && line.counted_qty !== undefined;
                const variance = counted ? parseFloat(line.counted_qty) - parseFloat(line.expected_qty) : null;
                return (
                  <tr key={line.id} style={i % 2 === 0 ? d.rowEven : d.row}>
                    <td style={{ ...d.td, fontWeight: 600 }}>{line.item_name}</td>
                    <td style={{ ...d.td, fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>{line.sku || '—'}</td>
                    <td style={{ ...d.td, color: '#6b7280' }}>{line.unit}</td>
                    <td style={{ ...d.td, textAlign: 'right' }}>{parseFloat(line.expected_qty)}</td>
                    <td style={{ ...d.td, textAlign: 'right' }}>
                      {countData.status !== 'completed' ? (
                        <input
                          style={d.countInput}
                          type="number"
                          min="0"
                          step="any"
                          defaultValue={counted ? line.counted_qty : ''}
                          placeholder="—"
                          disabled={saving === line.id}
                          onBlur={e => {
                            const val = e.target.value;
                            if (val !== '' && val !== String(line.counted_qty)) patchLine(line, parseFloat(val));
                          }}
                        />
                      ) : (
                        <span>{counted ? parseFloat(line.counted_qty) : '—'}</span>
                      )}
                    </td>
                    <td style={{ ...d.td, textAlign: 'right', fontWeight: variance !== null && variance !== 0 ? 700 : 400, color: variance === null ? '#9ca3af' : variance > 0 ? '#059669' : variance < 0 ? '#dc2626' : '#374151' }}>
                      {variance === null ? '—' : variance > 0 ? `+${variance}` : variance}
                    </td>
                    <td style={{ ...d.td, fontSize: 13, color: '#6b7280' }}>{line.counted_by_name || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {uncounted > 0 && countData.status === 'in_progress' && (
        <p style={d.uncountedNote}>{uncounted} item{uncounted !== 1 ? 's' : ''} not yet counted.</p>
      )}

      {/* Confirm complete modal */}
      {confirmOpen && (
        <div style={d.modalOverlay}>
          <div style={d.modal}>
            <h3 style={d.modalTitle}>Complete Cycle Count?</h3>
            {variantLines.length > 0 ? (
              <>
                <p style={d.modalBody}>{variantLines.length} adjustment{variantLines.length !== 1 ? 's' : ''} will be posted to stock:</p>
                <ul style={d.modalList}>
                  {variantLines.map(l => {
                    const v = parseFloat(l.counted_qty) - parseFloat(l.expected_qty);
                    return <li key={l.id} style={d.modalListItem}>{l.item_name}: {v > 0 ? `+${v}` : v} {l.unit}</li>;
                  })}
                </ul>
              </>
            ) : (
              <p style={d.modalBody}>No variances found. Stock will not be adjusted.</p>
            )}
            <div style={d.modalActions}>
              <button style={d.cancelBtn} onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button style={d.confirmBtn} onClick={complete} disabled={completing}>
                {completing ? 'Completing…' : 'Confirm & Complete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InventoryCycleCounts({ locations, onComplete }) {
  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newLocationId, setNewLocationId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLocation, setFilterLocation] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterLocation) params.set('location_id', filterLocation);
      const r = await api.get(`/inventory/cycle-counts?${params}`);
      setCounts(r.data);
    } catch { setError('Failed to load cycle counts'); }
    finally { setLoading(false); }
  }, [filterStatus, filterLocation]);

  useEffect(() => { load(); }, [load]);

  const startCount = async () => {
    if (!newLocationId) return alert('Select a location.');
    setCreating(true);
    try {
      const r = await api.post('/inventory/cycle-counts', { location_id: parseInt(newLocationId) });
      setSelected(r.data);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to create count.');
    } finally {
      setCreating(false); setNewLocationId('');
    }
  };

  const openCount = async (count) => {
    try {
      const r = await api.get(`/inventory/cycle-counts/${count.id}`);
      setSelected(r.data);
    } catch { alert('Failed to load count details.'); }
  };

  const handleComplete = () => {
    setSelected(null);
    load();
    onComplete?.();
  };

  if (selected) {
    return (
      <CycleCountDetail
        count={selected}
        onBack={() => { setSelected(null); load(); }}
        onComplete={handleComplete}
      />
    );
  }

  const activeLocations = locations.filter(l => l.active);

  return (
    <div style={s.wrap}>
      {/* Start new count */}
      <div style={s.startBar}>
        <select style={s.select} value={newLocationId} onChange={e => setNewLocationId(e.target.value)}>
          <option value="">Select location to count…</option>
          {activeLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button style={s.startBtn} onClick={startCount} disabled={creating || !newLocationId}>
          {creating ? 'Creating…' : '+ Start Count'}
        </button>
      </div>

      {/* Filters */}
      <div style={s.filters}>
        <select style={s.select} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <select style={s.select} value={filterLocation} onChange={e => setFilterLocation(e.target.value)}>
          <option value="">All Locations</option>
          {activeLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : counts.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyIcon}>🔄</div>
          <p>No cycle counts yet. Start one above to audit your stock.</p>
        </div>
      ) : (
        <div style={s.list}>
          {counts.map(count => {
            const sc = STATUS_COLORS[count.status] || STATUS_COLORS.draft;
            const pct = count.line_count > 0 ? Math.round((count.counted_count / count.line_count) * 100) : 0;
            return (
              <div key={count.id} style={s.card} onClick={() => openCount(count)}>
                <div style={s.cardTop}>
                  <div>
                    <div style={s.cardTitle}>{count.location_name}</div>
                    <div style={s.cardMeta}>
                      Started by {count.started_by_name} · {new Date(count.started_at).toLocaleDateString()}
                      {count.completed_at && ` · Completed ${new Date(count.completed_at).toLocaleDateString()}`}
                    </div>
                  </div>
                  <span style={{ ...s.badge, color: sc.color, background: sc.bg }}>{sc.label}</span>
                </div>
                <div style={s.cardProgress}>
                  <span style={s.cardProgressText}>{count.counted_count}/{count.line_count} items counted</span>
                  {count.status !== 'completed' && count.line_count > 0 && (
                    <div style={s.progressBar}>
                      <div style={{ ...s.progressFill, width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const d = {
  wrap:          { padding: 16 },
  back:          { background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginBottom: 16, padding: 0 },
  header:        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20 },
  title:         { fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 4 },
  sub:           { fontSize: 13, color: '#6b7280' },
  headerRight:   { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  statusBadge:   { padding: '4px 14px', borderRadius: 12, fontSize: 13, fontWeight: 700 },
  advanceBtn:    { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  completeBtn:   { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  error:         { background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 14 },
  empty:         { textAlign: 'center', padding: 40, color: '#6b7280' },
  tableWrap:     { overflowX: 'auto', borderRadius: 10, border: '1px solid #e5e7eb' },
  table:         { width: '100%', borderCollapse: 'collapse', minWidth: 580 },
  thead:         { background: '#f9fafb' },
  th:            { padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '2px solid #e5e7eb' },
  row:           { borderBottom: '1px solid #f3f4f6' },
  rowEven:       { background: '#fafafa', borderBottom: '1px solid #f3f4f6' },
  td:            { padding: '10px 12px', fontSize: 14, color: '#374151' },
  countInput:    { width: 80, padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, textAlign: 'right' },
  uncountedNote: { textAlign: 'center', fontSize: 13, color: '#d97706', fontWeight: 600, marginTop: 12 },
  modalOverlay:  { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 },
  modal:         { background: '#fff', borderRadius: 14, padding: 28, maxWidth: 460, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' },
  modalTitle:    { fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 12 },
  modalBody:     { fontSize: 14, color: '#374151', marginBottom: 12 },
  modalList:     { margin: '0 0 16px', paddingLeft: 20 },
  modalListItem: { fontSize: 14, color: '#374151', marginBottom: 4 },
  modalActions:  { display: 'flex', gap: 10, justifyContent: 'flex-end' },
  cancelBtn:     { padding: '9px 18px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#374151' },
  confirmBtn:    { padding: '9px 20px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
};

const s = {
  wrap:          { padding: 16 },
  startBar:      { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 },
  filters:       { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  select:        { padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, background: '#fff', color: '#374151', flex: 1, minWidth: 160 },
  startBtn:      { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#92400e', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  error:         { background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 14 },
  empty:         { textAlign: 'center', padding: '60px 24px', color: '#6b7280', fontSize: 15 },
  emptyIcon:     { fontSize: 40, marginBottom: 12 },
  list:          { display: 'flex', flexDirection: 'column', gap: 10 },
  card:          { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, cursor: 'pointer', transition: 'border-color 0.15s' },
  cardTop:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardTitle:     { fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 2 },
  cardMeta:      { fontSize: 12, color: '#6b7280' },
  cardProgress:  { display: 'flex', alignItems: 'center', gap: 12 },
  cardProgressText: { fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' },
  progressBar:   { flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: '100%', background: '#2563eb', borderRadius: 3, transition: 'width 0.3s' },
  badge:         { display: 'inline-block', padding: '3px 12px', borderRadius: 12, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' },
};
