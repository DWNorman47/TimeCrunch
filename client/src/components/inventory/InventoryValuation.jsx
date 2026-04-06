import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';

export default function InventoryValuation({ locations }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [showZero, setShowZero] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (locationFilter) params.set('location_id', locationFilter);
      const r = await api.get(`/inventory/valuation?${params}`);
      setData(r.data);
    } catch {
      setError('Failed to load valuation data.');
    } finally {
      setLoading(false);
    }
  }, [locationFilter]);

  useEffect(() => { load(); }, [load]);

  const downloadCSV = () => {
    if (!data) return;
    const rows = visibleItems.map(item => [
      `"${item.name.replace(/"/g, '""')}"`,
      item.sku || '',
      item.category || '',
      item.unit,
      parseFloat(item.total_qty).toFixed(2),
      item.unit_cost != null ? parseFloat(item.unit_cost).toFixed(2) : '',
      parseFloat(item.total_value).toFixed(2),
    ].join(','));
    const header = ['Item', 'SKU', 'Category', 'Unit', 'On Hand', 'Unit Cost', 'Total Value'].join(',');
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-valuation-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeLocations = locations.filter(l => l.active);
  const visibleItems = data
    ? data.items.filter(item => showZero || parseFloat(item.total_qty) !== 0)
    : [];

  const fmt = (n) => {
    const v = parseFloat(n || 0);
    return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  };

  const fmtQty = (n) => {
    const v = parseFloat(n || 0);
    return v % 1 === 0 ? v.toFixed(0) : v.toFixed(2);
  };

  return (
    <div style={s.wrap}>
      {/* Toolbar */}
      <div style={s.toolbar}>
        <select style={s.select} value={locationFilter} onChange={e => setLocationFilter(e.target.value)}>
          <option value="">All Locations</option>
          {activeLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <label style={s.toggle}>
          <input type="checkbox" checked={showZero} onChange={e => setShowZero(e.target.checked)} />
          Include zero stock
        </label>
        <button style={s.csvBtn} onClick={downloadCSV} disabled={!data || visibleItems.length === 0}>
          Download CSV
        </button>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {loading ? (
        <div style={s.empty}>Loading…</div>
      ) : !data || visibleItems.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyIcon}>💰</div>
          <p>{showZero ? 'No items found.' : 'No items with stock on hand. Enable "Include zero stock" to see all items.'}</p>
        </div>
      ) : (
        <>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr style={s.thead}>
                  <th style={s.th}>Item</th>
                  <th style={s.th}>SKU</th>
                  <th style={s.th}>Category</th>
                  <th style={s.th}>Unit</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>On Hand</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Total Value</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item, i) => (
                  <tr key={item.id} style={i % 2 === 0 ? s.rowEven : s.row}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{item.name}</td>
                    <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>{item.sku || '—'}</td>
                    <td style={s.td}>{item.category || '—'}</td>
                    <td style={{ ...s.td, color: '#6b7280' }}>{item.unit}</td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: parseFloat(item.total_qty) < 0 ? 700 : 400,
                      color: parseFloat(item.total_qty) < 0 ? '#dc2626' : '#374151' }}>
                      {fmtQty(item.total_qty)}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', color: item.unit_cost == null ? '#9ca3af' : '#374151' }}>
                      {item.unit_cost != null ? fmt(item.unit_cost) : <em>not set</em>}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 700,
                      color: parseFloat(item.total_value) > 0 ? '#111827' : '#9ca3af' }}>
                      {fmt(item.total_value)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={s.totalRow}>
                  <td colSpan={6} style={{ ...s.td, fontWeight: 700, fontSize: 14 }}>
                    Total — {visibleItems.length} item{visibleItems.length !== 1 ? 's' : ''}
                  </td>
                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 800, fontSize: 15, color: '#111827' }}>
                    {fmt(data.grand_total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Per-location breakdown (when no location filter) */}
          {!locationFilter && visibleItems.some(item => item.locations?.length > 0) && (
            <details style={s.details}>
              <summary style={s.detailsSummary}>Location breakdown</summary>
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr style={s.thead}>
                      <th style={s.th}>Item</th>
                      <th style={s.th}>Location</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Qty</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.flatMap((item, ii) =>
                      (item.locations || []).map((loc, li) => (
                        <tr key={`${item.id}-${loc.location_id}`} style={(ii + li) % 2 === 0 ? s.rowEven : s.row}>
                          <td style={{ ...s.td, fontWeight: 600 }}>{li === 0 ? item.name : ''}</td>
                          <td style={{ ...s.td, color: '#6b7280' }}>{loc.location_name}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{fmtQty(loc.quantity)} {item.unit}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>
                            {item.unit_cost != null ? fmt(parseFloat(loc.quantity) * parseFloat(item.unit_cost)) : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

const s = {
  wrap:        { padding: 16 },
  toolbar:     { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 },
  select:      { padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, background: '#fff', color: '#374151' },
  toggle:      { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280', cursor: 'pointer', whiteSpace: 'nowrap' },
  csvBtn:      { padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto', whiteSpace: 'nowrap' },
  error:       { background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 14 },
  empty:       { textAlign: 'center', padding: '60px 24px', color: '#6b7280', fontSize: 15 },
  emptyIcon:   { fontSize: 40, marginBottom: 12 },
  tableWrap:   { overflowX: 'auto', borderRadius: 10, border: '1px solid #e5e7eb' },
  table:       { width: '100%', borderCollapse: 'collapse', minWidth: 560 },
  thead:       { background: '#f9fafb' },
  th:          { padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '2px solid #e5e7eb' },
  row:         { borderBottom: '1px solid #f3f4f6' },
  rowEven:     { background: '#fafafa', borderBottom: '1px solid #f3f4f6' },
  td:          { padding: '10px 12px', fontSize: 14, color: '#374151' },
  totalRow:    { background: '#f0fdf4', borderTop: '2px solid #d1fae5' },
  details:     { marginTop: 24 },
  detailsSummary: { fontSize: 13, fontWeight: 700, color: '#374151', cursor: 'pointer', marginBottom: 12, padding: '8px 0' },
};
