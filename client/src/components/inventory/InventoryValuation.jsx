import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';
import { useT } from '../../hooks/useT';
import { useAuth } from '../../contexts/AuthContext';
import { langToLocale } from '../../utils';
import { SkeletonList } from '../Skeleton';

const VAL_PAGE = 200;

export default function InventoryValuation({ locations }) {
  const t = useT();
  const { user } = useAuth();
  const locale = langToLocale(user?.language);
  const [data, setData] = useState(null);
  const [valTotal, setValTotal] = useState(0);
  const [valOffset, setValOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [showZero, setShowZero] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(''); setValOffset(0);
    try {
      const params = new URLSearchParams({ limit: VAL_PAGE, offset: 0 });
      if (locationFilter) params.set('location_id', locationFilter);
      const r = await api.get(`/inventory/valuation?${params}`);
      setData(r.data);
      setValTotal(r.data.total);
    } catch {
      setError(t.invValFailedLoad);
    } finally {
      setLoading(false);
    }
  }, [locationFilter]);

  const loadMoreVal = async () => {
    const nextOffset = valOffset + VAL_PAGE;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: VAL_PAGE, offset: nextOffset });
      if (locationFilter) params.set('location_id', locationFilter);
      const r = await api.get(`/inventory/valuation?${params}`);
      setData(prev => ({
        ...r.data,
        items: [...(prev?.items || []), ...r.data.items],
      }));
      setValOffset(nextOffset);
    } catch { /* non-fatal */ }
    finally { setLoadingMore(false); }
  };

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
    const header = [t.invValColItem, t.colSku, t.colCategory, t.colUnit, t.invValColOnHand, t.colUnitCost, t.invValColTotalValue].join(',');
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
    return v.toLocaleString(locale, { style: 'currency', currency: 'USD' });
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
          <option value="">{t.invCycAllLocations}</option>
          {activeLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <label style={s.toggle}>
          <input type="checkbox" checked={showZero} onChange={e => setShowZero(e.target.checked)} />
          {t.invValIncludeZero}
        </label>
        <button style={{ ...s.csvBtn, ...(!data || visibleItems.length === 0 ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }} onClick={downloadCSV} disabled={!data || visibleItems.length === 0}>
          {t.invValDownloadCSV}
        </button>
      </div>

      {error && <div style={s.error}>{error}</div>}

      {loading ? (
        <SkeletonList count={4} rows={2} />
      ) : !data || visibleItems.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyIcon}>💰</div>
          <p>{showZero ? t.invValNoItems : t.invValNoStock}</p>
        </div>
      ) : (
        <>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr style={s.thead}>
                  <th style={s.th}>{t.invValColItem}</th>
                  <th style={s.th}>{t.colSku}</th>
                  <th style={s.th}>{t.colCategory}</th>
                  <th style={s.th}>{t.colUnit}</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>{t.invValColOnHand}</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>{t.colUnitCost}</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>{t.invValColTotalValue}</th>
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
                      {item.unit_cost != null ? fmt(item.unit_cost) : <em>{t.invValNotSet}</em>}
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
                    {t.invValTotalRow} — {visibleItems.length} {visibleItems.length !== 1 ? t.invValItems : t.invValItem}
                  </td>
                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 800, fontSize: 15, color: '#111827' }}>
                    {fmt(data.grand_total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {(data?.items?.length || 0) < valTotal && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <button style={{ ...s.csvBtn, ...(loadingMore ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }} onClick={loadMoreVal} disabled={loadingMore}>
                {loadingMore ? t.loading : t.loadMore}
              </button>
              <span style={{ marginLeft: 10, fontSize: 13, color: '#6b7280' }}>
                {data?.items?.length || 0} / {valTotal}
              </span>
            </div>
          )}

          {/* Per-location breakdown (when no location filter) */}
          {!locationFilter && visibleItems.some(item => item.locations?.length > 0) && (
            <details style={s.details}>
              <summary style={s.detailsSummary}>{t.invValLocationBreakdown}</summary>
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr style={s.thead}>
                      <th style={s.th}>{t.invValColItem}</th>
                      <th style={s.th}>{t.invValColLocation}</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>{t.invValColQty}</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>{t.invValColValue}</th>
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
