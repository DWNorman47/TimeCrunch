import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';

function formatBin(area_name, rack_name, bay_name, compartment_name) {
  return [area_name, rack_name, bay_name, compartment_name]
    .filter(Boolean).join(' › ') || null;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const TYPE_LABELS = { receive: 'Receive', issue: 'Issue', transfer: 'Transfer', adjust: 'Adjust', count: 'Count', convert: 'Convert' };
const TYPE_COLOR  = { receive: '#059669', issue: '#dc2626', transfer: '#2563eb', adjust: '#d97706', count: '#7c3aed', convert: '#0891b2' };

// ── History Panel ─────────────────────────────────────────────────────────────

function HistoryPanel({ item, onClose }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    setLoading(true);
    api.get(`/inventory/transactions?item_id=${item.item_id}&limit=30`)
      .then(r => setRows(r.data))
      .catch(() => setError('Failed to load history'))
      .finally(() => setLoading(false));
  }, [item.item_id]);

  return (
    <div style={h.overlay} onClick={onClose}>
      <div style={h.panel} onClick={e => e.stopPropagation()}>
        <div style={h.header}>
          <div>
            <div style={h.title}>{item.item_name}</div>
            <div style={h.sub}>Recent stock movements (last 30)</div>
          </div>
          <button style={h.close} onClick={onClose}>✕</button>
        </div>
        {error && <div style={h.error}>{error}</div>}
        {loading ? (
          <div style={h.empty}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={h.empty}>No transactions found.</div>
        ) : (
          <div style={h.tableWrap}>
            <table style={h.table}>
              <thead>
                <tr style={h.thead}>
                  <th style={h.th}>Date</th>
                  <th style={h.th}>Type</th>
                  <th style={{ ...h.th, textAlign: 'right' }}>Qty</th>
                  <th style={h.th}>Location</th>
                  <th style={h.th}>By</th>
                  <th style={h.th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const qty = parseFloat(r.quantity);
                  const isOut = ['issue', 'transfer'].includes(r.type);
                  const sign = r.type === 'adjust' ? (qty >= 0 ? '+' : '') : (isOut ? '−' : '+');
                  const color = r.type === 'adjust' ? (qty >= 0 ? '#059669' : '#dc2626') : (isOut ? '#dc2626' : '#059669');
                  const location = r.to_location_name || r.from_location_name || '—';
                  return (
                    <tr key={r.id} style={i % 2 === 0 ? h.rowEven : h.row}>
                      <td style={{ ...h.td, fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>{formatDate(r.created_at)}</td>
                      <td style={h.td}>
                        <span style={{ ...h.badge, color: TYPE_COLOR[r.type] || '#374151', background: '#f3f4f6' }}>
                          {TYPE_LABELS[r.type] || r.type}
                        </span>
                      </td>
                      <td style={{ ...h.td, textAlign: 'right', fontWeight: 700, color }}>
                        {sign}{Math.abs(qty) % 1 === 0 ? Math.abs(qty).toFixed(0) : Math.abs(qty).toFixed(2)} {r.unit || ''}
                      </td>
                      <td style={{ ...h.td, fontSize: 12 }}>{location}</td>
                      <td style={{ ...h.td, fontSize: 12 }}>{r.performed_by_name || '—'}</td>
                      <td style={{ ...h.td, fontSize: 12, color: '#6b7280' }}>{r.notes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const h = {
  overlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  panel:     { background: '#fff', borderRadius: '12px 12px 0 0', width: '100%', maxWidth: 900, maxHeight: '70vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' },
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '18px 20px 14px', borderBottom: '1px solid #e5e7eb' },
  title:     { fontSize: 16, fontWeight: 700, color: '#111827' },
  sub:       { fontSize: 12, color: '#6b7280', marginTop: 2 },
  close:     { background: 'none', border: 'none', fontSize: 18, color: '#6b7280', cursor: 'pointer', padding: '2px 6px' },
  error:     { background: '#fee2e2', color: '#dc2626', padding: '10px 20px', fontSize: 14 },
  empty:     { padding: '40px 20px', textAlign: 'center', color: '#6b7280', fontSize: 14 },
  tableWrap: { overflowY: 'auto', flex: 1 },
  table:     { width: '100%', borderCollapse: 'collapse' },
  thead:     { background: '#f9fafb', position: 'sticky', top: 0 },
  th:        { padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', textAlign: 'left', borderBottom: '2px solid #e5e7eb' },
  row:       { borderBottom: '1px solid #f3f4f6' },
  rowEven:   { background: '#fafafa', borderBottom: '1px solid #f3f4f6' },
  td:        { padding: '8px 12px', fontSize: 13, color: '#374151' },
  badge:     { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 },
};

// ── Quick Adjust Modal ────────────────────────────────────────────────────────

function AdjustModal({ item, locations, onClose, onDone }) {
  const [qty, setQty]       = useState('');
  const [locId, setLocId]   = useState(item.location_id || '');
  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const submit = async () => {
    const n = parseFloat(qty);
    if (isNaN(n) || n === 0) { setError('Enter a non-zero adjustment quantity (+/−)'); return; }
    if (!locId) { setError('Select a location'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/inventory/transactions', {
        type: 'adjust',
        item_id: item.item_id,
        quantity: n,
        to_location_id: parseInt(locId),
        notes: notes.trim() || undefined,
      });
      onDone();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save adjustment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={a.overlay} onClick={onClose}>
      <div style={a.modal} onClick={e => e.stopPropagation()}>
        <div style={a.header}>
          <div style={a.title}>Quick Adjust — {item.item_name}</div>
          <button style={a.close} onClick={onClose}>✕</button>
        </div>
        <div style={a.body}>
          <div style={a.currentRow}>
            <span style={a.currentLabel}>Current stock</span>
            <span style={a.currentQty}>{parseFloat(item.quantity) % 1 === 0 ? parseFloat(item.quantity).toFixed(0) : parseFloat(item.quantity).toFixed(2)} {item.unit}</span>
          </div>
          {error && <div style={a.error}>{error}</div>}
          <label style={a.label}>Adjustment quantity (use − for decrease)</label>
          <input
            type="number"
            step="any"
            placeholder="e.g. -5 or +10"
            value={qty}
            onChange={e => setQty(e.target.value)}
            style={a.input}
            autoFocus
          />
          <label style={a.label}>Location</label>
          <select value={locId} onChange={e => setLocId(e.target.value)} style={a.input}>
            <option value="">Select location…</option>
            {locations.filter(l => l.active).map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <label style={a.label}>Notes (optional)</label>
          <input
            type="text"
            placeholder="Reason for adjustment"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={a.input}
          />
          <div style={a.actions}>
            <button style={a.cancel} onClick={onClose} disabled={saving}>Cancel</button>
            <button style={a.save} onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save Adjustment'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const a = {
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1010, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:       { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px 14px', borderBottom: '1px solid #e5e7eb' },
  title:       { fontSize: 15, fontWeight: 700, color: '#111827' },
  close:       { background: 'none', border: 'none', fontSize: 18, color: '#6b7280', cursor: 'pointer' },
  body:        { padding: 20, display: 'flex', flexDirection: 'column', gap: 10 },
  currentRow:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb', borderRadius: 8, padding: '10px 14px' },
  currentLabel:{ fontSize: 12, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' },
  currentQty:  { fontSize: 18, fontWeight: 800, color: '#111827' },
  error:       { background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '8px 12px', fontSize: 13 },
  label:       { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: -4 },
  input:       { padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, width: '100%', boxSizing: 'border-box' },
  actions:     { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 },
  cancel:      { padding: '9px 18px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer' },
  save:        { padding: '9px 18px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  hint:        { fontSize: 12, color: '#059669', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '4px 10px' },
};

// ── Quick Issue Modal (workers) ───────────────────────────────────────────────

function IssueModal({ item, projects, onClose, onDone }) {
  const [qty, setQty]             = useState('');
  const [uomId, setUomId]         = useState(item.uom_id ? String(item.uom_id) : '');
  const [itemUoms, setItemUoms]   = useState([]);
  const [projectId, setProjectId] = useState('');
  const [notes, setNotes]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const available = parseFloat(item.quantity);
  const stockUnit = item.unit_spec ? `${item.unit} (${item.unit_spec})` : item.unit;

  useEffect(() => {
    api.get(`/inventory/items/${item.item_id}/uoms`)
      .then(r => setItemUoms(r.data.filter(u => u.active)))
      .catch(() => {});
  }, [item.item_id]);

  const selectedUom = itemUoms.find(u => String(u.id) === uomId);
  const stockUom    = item.uom_id ? itemUoms.find(u => u.id === item.uom_id) : null;

  // Conversion hint: how many of the selected UOM equal the available stock
  const availableInSelected = (() => {
    if (!selectedUom || !stockUom) return null;
    const sf = parseFloat(stockUom.factor || 1);
    const tf = parseFloat(selectedUom.factor || 1);
    if (!tf || sf === tf) return null;
    const converted = (available * sf) / tf;
    return `${converted % 1 === 0 ? converted.toFixed(0) : converted.toFixed(2)} ${selectedUom.unit}`;
  })();

  const submit = async () => {
    const n = parseFloat(qty);
    if (isNaN(n) || n <= 0) { setError('Enter a positive quantity to issue'); return; }
    // Only enforce client-side limit when issuing in the same UOM as stock
    if ((!uomId || uomId === String(item.uom_id)) && n > available) {
      setError(`Cannot issue more than available (${available % 1 === 0 ? available.toFixed(0) : available.toFixed(2)} ${stockUnit})`);
      return;
    }
    setSaving(true); setError('');
    try {
      await api.post('/inventory/transactions', {
        type: 'issue',
        item_id: item.item_id,
        quantity: n,
        uom_id: uomId ? parseInt(uomId) : undefined,
        from_location_id: item.location_id,
        project_id: projectId ? parseInt(projectId) : undefined,
        notes: notes.trim() || undefined,
      });
      onDone();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to issue material');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={a.overlay} onClick={onClose}>
      <div style={a.modal} onClick={e => e.stopPropagation()}>
        <div style={a.header}>
          <div style={a.title}>Issue — {item.item_name}</div>
          <button style={a.close} onClick={onClose}>✕</button>
        </div>
        <div style={a.body}>
          <div style={a.currentRow}>
            <span style={a.currentLabel}>Available at {item.location_name}</span>
            <span style={a.currentQty}>{available % 1 === 0 ? available.toFixed(0) : available.toFixed(2)} {stockUnit}</span>
          </div>
          {error && <div style={a.error}>{error}</div>}
          <label style={a.label}>Quantity to issue *</label>
          <input
            type="number"
            step="any"
            min="0.001"
            placeholder="e.g. 5"
            value={qty}
            onChange={e => setQty(e.target.value)}
            style={a.input}
            autoFocus
          />
          {itemUoms.length > 1 && (
            <>
              <label style={a.label}>Unit</label>
              <select value={uomId} onChange={e => setUomId(e.target.value)} style={a.input}>
                <option value="">Default ({item.unit})</option>
                {itemUoms.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.unit}{u.unit_spec ? ` (${u.unit_spec})` : ''}{u.is_base ? ' — base' : ''}
                  </option>
                ))}
              </select>
              {availableInSelected && (
                <div style={a.hint}>≈ {availableInSelected} available in this unit</div>
              )}
            </>
          )}
          {projects && projects.length > 0 && (
            <>
              <label style={a.label}>Project (optional)</label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} style={a.input}>
                <option value="">No project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </>
          )}
          <label style={a.label}>Notes (optional)</label>
          <input
            type="text"
            placeholder="e.g. Job site use"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={a.input}
          />
          <div style={a.actions}>
            <button style={a.cancel} onClick={onClose} disabled={saving}>Cancel</button>
            <button style={{ ...a.save, background: '#d97706' }} onClick={submit} disabled={saving}>
              {saving ? 'Issuing…' : 'Issue Materials'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Stock Component ──────────────────────────────────────────────────────

export default function InventoryStock({ isAdmin, locations, projects, onStockChange, onReorderClick }) {
  const [stock, setStock]           = useState([]);
  const [lowItems, setLowItems]     = useState([]);
  const [locationFilter, setLocationFilter] = useState('');
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [historyItem, setHistoryItem] = useState(null);
  const [adjustItem, setAdjustItem]   = useState(null);
  const [issueItem, setIssueItem]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = locationFilter ? `?location_id=${locationFilter}` : '';
      const [s, l] = await Promise.all([
        api.get(`/inventory/stock${params}`),
        isAdmin ? api.get('/inventory/stock/low') : Promise.resolve({ data: [] }),
      ]);
      setStock(s.data);
      setLowItems(l.data);
    } catch (e) {
      setError('Failed to load stock');
    } finally {
      setLoading(false);
    }
  }, [locationFilter, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const stockStatus = (qty, reorderPoint) => {
    const q = parseFloat(qty);
    if (q <= 0) return { label: 'Out', color: '#dc2626', bg: '#fee2e2' };
    if (reorderPoint > 0 && q <= reorderPoint) return { label: 'Low', color: '#d97706', bg: '#fef3c7' };
    return { label: 'In Stock', color: '#059669', bg: '#d1fae5' };
  };

  const handleAdjustDone = () => {
    setAdjustItem(null);
    load();
    if (onStockChange) onStockChange();
  };

  const handleIssueDone = () => {
    setIssueItem(null);
    load();
    if (onStockChange) onStockChange();
  };

  return (
    <div style={s.wrap}>
      {/* Low stock alert banner */}
      {isAdmin && lowItems.length > 0 && (
        <div style={s.alertBanner}>
          <span>⚠️ {lowItems.length} item{lowItems.length !== 1 ? 's' : ''} at or below reorder point</span>
          {onReorderClick && (
            <button style={s.reorderBtn} onClick={onReorderClick}>
              Create Reorder PO
            </button>
          )}
        </div>
      )}

      {/* Filter bar */}
      <div style={s.filterBar}>
        <select style={s.select} value={locationFilter} onChange={e => setLocationFilter(e.target.value)}>
          <option value="">All Locations</option>
          {locations.filter(l => l.active).map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <button style={s.refreshBtn} onClick={load}>Refresh</button>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : stock.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyIcon}>📦</div>
          <p>No stock on hand{locationFilter ? ' at this location' : ''}.</p>
          <p style={s.emptyHint}>Receive items through the Transactions tab to add stock.</p>
        </div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>Item</th>
                <th style={s.th}>SKU</th>
                <th style={s.th}>Category</th>
                <th style={s.th}>Location</th>
                <th style={s.th}>Bin</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Qty</th>
                <th style={s.th}>Unit</th>
                {isAdmin && <th style={{ ...s.th, textAlign: 'right' }}>Unit Cost</th>}
                {isAdmin && <th style={{ ...s.th, textAlign: 'right' }}>Total Value</th>}
                <th style={s.th}>Status</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {stock.map((row, i) => {
                const status = stockStatus(row.quantity, row.reorder_point);
                const qty = parseFloat(row.quantity);
                const cost = parseFloat(row.unit_cost);
                return (
                  <tr
                    key={row.id}
                    style={{ ...(i % 2 === 0 ? s.rowEven : s.row), cursor: 'pointer' }}
                    onClick={() => setHistoryItem(row)}
                  >
                    <td style={{ ...s.td, fontWeight: 600 }}>{row.item_name}</td>
                    <td style={{ ...s.td, color: '#6b7280', fontFamily: 'monospace', fontSize: 12 }}>{row.sku || '—'}</td>
                    <td style={s.td}>{row.category || '—'}</td>
                    <td style={s.td}>{row.location_name}</td>
                    <td style={{ ...s.td, color: '#6b7280', fontSize: 12 }}>
                      {formatBin(row.area_name, row.rack_name, row.bay_name, row.compartment_name) || '—'}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: qty < 0 ? '#dc2626' : '#111827' }}>
                      {qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(2)}
                    </td>
                    <td style={{ ...s.td, color: '#6b7280' }}>
                      {row.unit}
                      {row.unit_spec && <span style={{ fontSize: 11, color: '#9ca3af' }}> ({row.unit_spec})</span>}
                    </td>
                    {isAdmin && (
                      <td style={{ ...s.td, textAlign: 'right', color: '#6b7280' }}>
                        {cost ? `$${cost.toFixed(2)}` : '—'}
                      </td>
                    )}
                    {isAdmin && (
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>
                        {cost && qty > 0 ? `$${(cost * qty).toFixed(2)}` : '—'}
                      </td>
                    )}
                    <td style={s.td}>
                      <span style={{ ...s.badge, color: status.color, background: status.bg }}>{status.label}</span>
                    </td>
                    <td style={{ ...s.td, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                      <button
                        style={s.histBtn}
                        title="View history"
                        onClick={() => setHistoryItem(row)}
                      >📋</button>
                      {isAdmin && (
                        <button
                          style={s.adjBtn}
                          title="Quick adjust"
                          onClick={() => setAdjustItem(row)}
                        >±</button>
                      )}
                      {!isAdmin && qty > 0 && (
                        <button
                          style={s.issueBtn}
                          title="Issue material"
                          onClick={() => setIssueItem(row)}
                        >Issue</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {historyItem && (
        <HistoryPanel item={historyItem} onClose={() => setHistoryItem(null)} />
      )}
      {adjustItem && (
        <AdjustModal
          item={adjustItem}
          locations={locations}
          onClose={() => setAdjustItem(null)}
          onDone={handleAdjustDone}
        />
      )}
      {issueItem && (
        <IssueModal
          item={issueItem}
          projects={projects || []}
          onClose={() => setIssueItem(null)}
          onDone={handleIssueDone}
        />
      )}
    </div>
  );
}

const s = {
  wrap:        { padding: 16 },
  alertBanner: { background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  reorderBtn:  { padding: '6px 14px', borderRadius: 7, border: 'none', background: '#92400e', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  filterBar:   { display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' },
  select:      { padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, background: '#fff', color: '#374151' },
  refreshBtn:  { padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' },
  error:       { background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 14 },
  empty:       { textAlign: 'center', padding: '60px 24px', color: '#6b7280', fontSize: 15 },
  emptyIcon:   { fontSize: 40, marginBottom: 12 },
  emptyHint:   { fontSize: 13, color: '#9ca3af', marginTop: 4 },
  tableWrap:   { overflowX: 'auto', borderRadius: 10, border: '1px solid #e5e7eb' },
  table:       { width: '100%', borderCollapse: 'collapse', minWidth: 600 },
  thead:       { background: '#f9fafb' },
  th:          { padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '2px solid #e5e7eb' },
  row:         { borderBottom: '1px solid #f3f4f6' },
  rowEven:     { background: '#fafafa', borderBottom: '1px solid #f3f4f6' },
  td:          { padding: '10px 12px', fontSize: 14, color: '#374151' },
  badge:       { display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 },
  histBtn:     { padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 13, cursor: 'pointer', marginRight: 4 },
  adjBtn:      { padding: '4px 10px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  issueBtn:    { padding: '4px 10px', borderRadius: 6, border: '1px solid #fcd34d', background: '#fef3c7', color: '#92400e', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
};
