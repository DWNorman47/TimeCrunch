import React, { useState, useEffect } from 'react';
import api from '../../api';

function formatBin(area, rack, bay, compartment) {
  return [
    area        && `Area ${area}`,
    rack        && `Rack ${rack}`,
    bay         && `Bay ${bay}`,
    compartment && `Cpt ${compartment}`,
  ].filter(Boolean).join(' · ') || null;
}

export default function InventoryStock({ isAdmin, locations, onStockChange }) {
  const [stock, setStock] = useState([]);
  const [lowItems, setLowItems] = useState([]);
  const [locationFilter, setLocationFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
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
  };

  useEffect(() => { load(); }, [locationFilter]);

  const stockStatus = (qty, reorderPoint) => {
    const q = parseFloat(qty);
    if (q <= 0) return { label: 'Out', color: '#dc2626', bg: '#fee2e2' };
    if (reorderPoint > 0 && q <= reorderPoint) return { label: 'Low', color: '#d97706', bg: '#fef3c7' };
    return { label: 'In Stock', color: '#059669', bg: '#d1fae5' };
  };

  return (
    <div style={s.wrap}>
      {/* Low stock alert banner */}
      {isAdmin && lowItems.length > 0 && (
        <div style={s.alertBanner}>
          ⚠️ {lowItems.length} item{lowItems.length !== 1 ? 's' : ''} at or below reorder point
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
              </tr>
            </thead>
            <tbody>
              {stock.map((row, i) => {
                const status = stockStatus(row.quantity, row.reorder_point);
                const qty = parseFloat(row.quantity);
                const cost = parseFloat(row.unit_cost);
                return (
                  <tr key={row.id} style={i % 2 === 0 ? s.rowEven : s.row}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{row.item_name}</td>
                    <td style={{ ...s.td, color: '#6b7280', fontFamily: 'monospace', fontSize: 12 }}>{row.sku || '—'}</td>
                    <td style={s.td}>{row.category || '—'}</td>
                    <td style={s.td}>{row.location_name}</td>
                    <td style={{ ...s.td, color: '#6b7280', fontSize: 12 }}>
                      {formatBin(row.area, row.rack, row.bay, row.compartment) || '—'}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: qty < 0 ? '#dc2626' : '#111827' }}>
                      {qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(2)}
                    </td>
                    <td style={{ ...s.td, color: '#6b7280' }}>{row.unit}</td>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const s = {
  wrap:        { padding: 16 },
  alertBanner: { background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 14, fontWeight: 600 },
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
};
