import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';

/**
 * Shows all non-base UOM conversions across all items.
 * Allows inline factor editing via PATCH /inventory/items/:id/uoms/:uomId.
 */
export default function InventoryConversions({ onConversionChange }) {
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [editingId, setEditingId] = useState(null); // uom_id being edited
  const [editFactor, setEditFactor] = useState('');
  const [saving, setSaving]     = useState(false);
  const [saveErr, setSaveErr]   = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await api.get('/inventory/uom-conversions');
      setRows(r.data);
    } catch { setError('Failed to load conversions.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (row) => {
    setEditingId(row.uom_id);
    setEditFactor(String(parseFloat(row.factor)));
    setSaveErr('');
  };

  const cancelEdit = () => { setEditingId(null); setSaveErr(''); };

  const saveEdit = async (row) => {
    const n = parseFloat(editFactor);
    if (isNaN(n) || n <= 0) { setSaveErr('Enter a positive number.'); return; }
    setSaving(true); setSaveErr('');
    try {
      await api.patch(`/inventory/items/${row.item_id}/uoms/${row.uom_id}`, { factor: n });
      setEditingId(null);
      load();
      onConversionChange?.();
    } catch (err) {
      setSaveErr(err.response?.data?.error || 'Failed to save.');
    } finally { setSaving(false); }
  };

  // Group by item
  const grouped = rows.reduce((acc, row) => {
    const key = row.item_id;
    if (!acc[key]) acc[key] = { item_id: row.item_id, item_name: row.item_name, base_unit: row.base_unit, uoms: [] };
    acc[key].uoms.push(row);
    return acc;
  }, {});
  const groups = Object.values(grouped);

  if (loading) return <div style={s.empty}>Loading…</div>;
  if (error) return <div style={s.errorMsg}>{error}</div>;

  return (
    <div style={s.wrap}>
      {groups.length === 0 ? (
        <div style={s.emptyState}>
          <div style={s.emptyIcon}>🔄</div>
          <p style={s.emptyTitle}>No conversions defined yet</p>
          <p style={s.emptySub}>
            Open an item in the <strong>Items</strong> tab, then use the Units of Measure panel
            to add pack sizes with conversion factors. They will appear here.
          </p>
        </div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>Item</th>
                <th style={s.th}>Base Unit</th>
                <th style={s.th}>Alternate Unit</th>
                <th style={s.th}>Spec</th>
                <th style={{ ...s.th, textAlign: 'center' }}>Factor</th>
                <th style={s.th}>Meaning</th>
                <th style={s.th}>Status</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {groups.map(group =>
                group.uoms.map((row, idx) => {
                  const isEditing = editingId === row.uom_id;
                  const factorNum = parseFloat(row.factor);
                  const noConversion = factorNum === 1;
                  const uomLabel = row.unit + (row.unit_spec ? ` (${row.unit_spec})` : '');
                  const meaning = factorNum !== 1
                    ? `1 ${row.unit} = ${factorNum % 1 === 0 ? factorNum.toFixed(0) : factorNum} ${row.base_unit}`
                    : '— not set';
                  return (
                    <tr key={row.uom_id} style={idx % 2 === 0 ? s.rowEven : s.row}>
                      <td style={{ ...s.td, fontWeight: idx === 0 ? 700 : 400, color: idx === 0 ? '#111827' : '#9ca3af' }}>
                        {idx === 0 ? group.item_name : ''}
                      </td>
                      <td style={{ ...s.td, color: '#6b7280' }}>{row.base_unit}</td>
                      <td style={{ ...s.td, fontWeight: 600 }}>{uomLabel}</td>
                      <td style={{ ...s.td, color: '#6b7280', fontSize: 12 }}>{row.unit_spec || '—'}</td>
                      <td style={{ ...s.td, textAlign: 'center' }}>
                        {isEditing ? (
                          <input
                            type="number"
                            min="0.0001"
                            step="any"
                            value={editFactor}
                            onChange={e => setEditFactor(e.target.value)}
                            style={s.factorInput}
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(row); if (e.key === 'Escape') cancelEdit(); }}
                          />
                        ) : (
                          <span style={{ ...s.factorBadge, ...(noConversion ? s.factorBadgeWarn : {}) }}>
                            {noConversion ? '?' : factorNum % 1 === 0 ? factorNum.toFixed(0) : factorNum}
                          </span>
                        )}
                      </td>
                      <td style={{ ...s.td, color: noConversion ? '#d97706' : '#6b7280', fontSize: 13 }}>
                        {isEditing
                          ? (parseFloat(editFactor) > 0
                              ? `1 ${row.unit} = ${parseFloat(editFactor) % 1 === 0 ? parseFloat(editFactor).toFixed(0) : parseFloat(editFactor)} ${row.base_unit}`
                              : '—')
                          : meaning}
                      </td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, ...(row.active ? s.badgeActive : s.badgeInactive) }}>
                          {row.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <>
                            {saveErr && <span style={s.inlineErr}>{saveErr}</span>}
                            <button style={s.saveBtn} onClick={() => saveEdit(row)} disabled={saving}>
                              {saving ? '…' : 'Save'}
                            </button>
                            <button style={s.cancelBtn} onClick={cancelEdit}>Cancel</button>
                          </>
                        ) : (
                          <button style={s.editBtn} onClick={() => startEdit(row)} title="Edit factor">✏️</button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const s = {
  wrap:          { padding: 16 },
  empty:         { textAlign: 'center', padding: '60px 24px', color: '#6b7280', fontSize: 15 },
  errorMsg:      { background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 16px', margin: 16, fontSize: 14 },
  emptyState:    { textAlign: 'center', padding: '60px 24px', color: '#6b7280' },
  emptyIcon:     { fontSize: 40, marginBottom: 12 },
  emptyTitle:    { fontSize: 16, fontWeight: 700, color: '#374151', margin: '0 0 8px' },
  emptySub:      { fontSize: 13, color: '#9ca3af', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 },
  tableWrap:     { overflowX: 'auto', borderRadius: 10, border: '1px solid #e5e7eb' },
  table:         { width: '100%', borderCollapse: 'collapse', minWidth: 640 },
  thead:         { background: '#f9fafb' },
  th:            { padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', borderBottom: '2px solid #e5e7eb' },
  row:           { borderBottom: '1px solid #f3f4f6' },
  rowEven:       { background: '#fafafa', borderBottom: '1px solid #f3f4f6' },
  td:            { padding: '10px 12px', fontSize: 14, color: '#374151' },
  factorBadge:   { display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8' },
  factorBadgeWarn: { background: '#fef3c7', color: '#b45309' },
  factorInput:   { width: 70, padding: '5px 8px', borderRadius: 6, border: '2px solid #3b82f6', fontSize: 14, fontWeight: 700, textAlign: 'center' },
  badge:         { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 },
  badgeActive:   { background: '#d1fae5', color: '#059669' },
  badgeInactive: { background: '#f3f4f6', color: '#9ca3af' },
  editBtn:       { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px' },
  saveBtn:       { padding: '4px 12px', borderRadius: 6, border: 'none', background: '#059669', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginRight: 4 },
  cancelBtn:     { padding: '4px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 13, cursor: 'pointer' },
  inlineErr:     { fontSize: 12, color: '#dc2626', marginRight: 6 },
};
