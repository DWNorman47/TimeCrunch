import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';

const DEFAULT_UNITS = ['each', 'box', 'bag', 'bundle', 'pallet', 'lb', 'kg', 'ft', 'm', 'sq ft', 'gal', 'L', 'roll', 'sheet', 'piece', 'other'];

function SectionHeader({ children, count, warn }) {
  return (
    <div style={s.sectionHeader}>
      <span style={s.sectionTitle}>{children}</span>
      {count != null && (
        <span style={{ ...s.sectionBadge, ...(warn ? s.sectionBadgeWarn : s.sectionBadgeOk) }}>{count}</span>
      )}
    </div>
  );
}

export default function InventoryConversions({ onConversionChange }) {
  const [rows, setRows]       = useState([]);
  const [items, setItems]     = useState([]);
  const [units, setUnits]     = useState({ active: DEFAULT_UNITS, known: DEFAULT_UNITS });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  // Add form state
  const [addOpen, setAddOpen]         = useState(false);
  const [addItemId, setAddItemId]     = useState('');
  const [addUnit, setAddUnit]         = useState('each');
  const [addCustomUnit, setAddCustomUnit] = useState('');
  const [addSpec, setAddSpec]         = useState('');
  const [addFactor, setAddFactor]     = useState('');
  const [addSaving, setAddSaving]     = useState(false);
  const [addError, setAddError]       = useState('');

  // Inline edit state
  const [editingId, setEditingId]   = useState(null);
  const [editFactor, setEditFactor] = useState('');
  const [saving, setSaving]         = useState(false);
  const [saveErr, setSaveErr]       = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [conv, itemList, unitsRes] = await Promise.all([
        api.get('/inventory/uom-conversions'),
        api.get('/inventory/items?active=true'),
        api.get('/inventory/units'),
      ]);
      setRows(conv.data);
      setItems(itemList.data);
      setUnits(unitsRes.data);
    } catch { setError('Failed to load.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Add new conversion ───────────────────────────────────────────────────────

  const resetAdd = () => {
    setAddOpen(false); setAddItemId(''); setAddUnit('each');
    setAddCustomUnit(''); setAddSpec(''); setAddFactor(''); setAddError('');
  };

  const submitAdd = async () => {
    const unit = addUnit === 'other' ? addCustomUnit.trim() : addUnit;
    if (!addItemId) return setAddError('Select an item.');
    if (!unit) return setAddError('Enter a unit name.');
    const f = parseFloat(addFactor);
    if (!addFactor || isNaN(f) || f <= 0) return setAddError('Enter a positive factor (e.g. 30 for "1 box = 30 each").');
    setAddSaving(true); setAddError('');
    try {
      await api.post(`/inventory/items/${addItemId}/uoms`, {
        unit, unit_spec: addSpec.trim() || null, factor: f, is_base: false,
      });
      resetAdd();
      load();
      onConversionChange?.();
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to save.');
      setAddSaving(false);
    }
  };

  // ── Inline edit ─────────────────────────────────────────────────────────────

  const startEdit = (row) => {
    setEditingId(row.uom_id);
    setEditFactor(parseFloat(row.factor) === 1 ? '' : String(parseFloat(row.factor)));
    setSaveErr('');
  };

  const cancelEdit = () => { setEditingId(null); setSaveErr(''); };

  const saveEdit = async (row) => {
    const n = parseFloat(editFactor);
    if (!editFactor || isNaN(n) || n <= 0) { setSaveErr('Enter a positive number.'); return; }
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

  // ── Split into pending (factor=1) vs configured ──────────────────────────────
  const pending    = rows.filter(r => parseFloat(r.factor) === 1);
  const configured = rows.filter(r => parseFloat(r.factor) !== 1);

  const renderRow = (row, i, isPending) => {
    const isEditing = editingId === row.uom_id;
    const factorNum = parseFloat(row.factor);
    const uomLabel  = row.unit + (row.unit_spec ? ` (${row.unit_spec})` : '');
    const meaning   = factorNum !== 1
      ? `1 ${row.unit} = ${factorNum % 1 === 0 ? factorNum.toFixed(0) : factorNum} ${row.base_unit}`
      : null;

    return (
      <tr key={row.uom_id} style={i % 2 === 0 ? s.rowEven : s.row}>
        <td style={{ ...s.td, fontWeight: 600 }}>{row.item_name}</td>
        <td style={{ ...s.td, color: '#6b7280' }}>{row.base_unit}</td>
        <td style={{ ...s.td, fontWeight: 600 }}>{uomLabel}</td>
        <td style={{ ...s.td, textAlign: 'center' }}>
          {isEditing ? (
            <input
              type="number" min="0.0001" step="any"
              value={editFactor}
              onChange={e => setEditFactor(e.target.value)}
              style={s.factorInput}
              autoFocus
              placeholder="e.g. 30"
              onKeyDown={e => { if (e.key === 'Enter') saveEdit(row); if (e.key === 'Escape') cancelEdit(); }}
            />
          ) : isPending ? (
            <span style={s.pendingBadge}>Not set</span>
          ) : (
            <span style={s.factorBadge}>{factorNum % 1 === 0 ? factorNum.toFixed(0) : factorNum}</span>
          )}
        </td>
        <td style={{ ...s.td, color: '#6b7280', fontSize: 13 }}>
          {isEditing
            ? (parseFloat(editFactor) > 0
                ? `1 ${row.unit} = ${parseFloat(editFactor) % 1 === 0 ? parseFloat(editFactor).toFixed(0) : parseFloat(editFactor)} ${row.base_unit}`
                : '—')
            : (meaning || <span style={{ color: '#d97706' }}>Enter factor to enable conversions</span>)}
        </td>
        <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
          {isEditing ? (
            <>
              {saveErr && <span style={s.inlineErr}>{saveErr} </span>}
              <button style={s.saveBtn} onClick={() => saveEdit(row)} disabled={saving}>{saving ? '…' : 'Save'}</button>
              <button style={s.cancelBtn} onClick={cancelEdit}>Cancel</button>
            </>
          ) : (
            <button style={{ ...s.editBtn, ...(isPending ? s.editBtnPending : {}) }} onClick={() => startEdit(row)}>
              {isPending ? 'Set Factor' : '✏️'}
            </button>
          )}
        </td>
      </tr>
    );
  };

  const tableHead = (
    <thead>
      <tr style={s.thead}>
        <th style={s.th}>Item</th>
        <th style={s.th}>Base Unit</th>
        <th style={s.th}>Alt Unit</th>
        <th style={{ ...s.th, textAlign: 'center' }}>Factor</th>
        <th style={s.th}>Meaning</th>
        <th style={s.th}></th>
      </tr>
    </thead>
  );

  const selectedItem = items.find(i => String(i.id) === String(addItemId));

  return (
    <div style={s.wrap}>

      {/* ── Add Conversion ──────────────────────────────────────────────────── */}
      <div style={s.addSection}>
        {!addOpen ? (
          <button style={s.addBtn} onClick={() => setAddOpen(true)}>+ Add Conversion</button>
        ) : (
          <div style={s.addForm}>
            <div style={s.addTitle}>Add UOM Conversion</div>
            {addError && <div style={s.addError}>{addError}</div>}
            <div style={s.addRow}>
              <div style={s.addField}>
                <label style={s.addLabel}>Item *</label>
                <select style={s.addInput} value={addItemId} onChange={e => setAddItemId(e.target.value)}>
                  <option value="">Select item…</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name}{i.sku ? ` (${i.sku})` : ''}</option>)}
                </select>
                {selectedItem && <div style={s.baseUomNote}>Base unit: <strong>{selectedItem.unit}</strong></div>}
              </div>
              <div style={s.addField}>
                <label style={s.addLabel}>Alternate Unit *</label>
                <select style={s.addInput} value={addUnit} onChange={e => setAddUnit(e.target.value)}>
                  {units.active.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                {addUnit === 'other' && (
                  <input style={{ ...s.addInput, marginTop: 4 }} value={addCustomUnit}
                    onChange={e => setAddCustomUnit(e.target.value)} placeholder="Unit name…" />
                )}
              </div>
              <div style={s.addField}>
                <label style={s.addLabel}>Spec <span style={s.optional}>(optional)</span></label>
                <input style={s.addInput} value={addSpec} onChange={e => setAddSpec(e.target.value)} placeholder="e.g. 30 ct" />
              </div>
              <div style={s.addField}>
                <label style={s.addLabel}>
                  Factor * <span style={s.optional}>
                    {selectedItem ? `how many ${selectedItem.unit} per 1 ${addUnit === 'other' ? (addCustomUnit || 'unit') : addUnit}` : ''}
                  </span>
                </label>
                <input style={s.addInput} type="number" min="0.0001" step="any"
                  value={addFactor} onChange={e => setAddFactor(e.target.value)} placeholder="e.g. 30" />
              </div>
            </div>
            <div style={s.addActions}>
              <button style={s.cancelBtn} onClick={resetAdd} disabled={addSaving}>Cancel</button>
              <button style={s.saveBtn} onClick={submitAdd} disabled={addSaving}>
                {addSaving ? 'Saving…' : 'Save Conversion'}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <div style={s.errorMsg}>{error}</div>}
      {loading && <div style={s.empty}>Loading…</div>}

      {!loading && !error && (
        <>
          {/* ── Needs Setup ───────────────────────────────────────────────── */}
          {pending.length > 0 && (
            <div style={s.section}>
              <SectionHeader count={pending.length} warn>Needs Setup</SectionHeader>
              <p style={s.sectionDesc}>
                These units were added without a conversion factor. Workers may have used them already.
                Set the correct factor so the system can convert quantities accurately.
              </p>
              <div style={s.tableWrap}>
                <table style={s.table}>
                  {tableHead}
                  <tbody>{pending.map((row, i) => renderRow(row, i, true))}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Configured ────────────────────────────────────────────────── */}
          {configured.length > 0 && (
            <div style={s.section}>
              <SectionHeader count={configured.length}>Configured</SectionHeader>
              <div style={s.tableWrap}>
                <table style={s.table}>
                  {tableHead}
                  <tbody>{configured.map((row, i) => renderRow(row, i, false))}</tbody>
                </table>
              </div>
            </div>
          )}

          {rows.length === 0 && (
            <div style={s.emptyState}>
              <div style={s.emptyIcon}>🔄</div>
              <p style={s.emptyTitle}>No conversions defined yet</p>
              <p style={s.emptySub}>
                Use <strong>+ Add Conversion</strong> above to define pack sizes,
                or edit items directly in the <strong>Items</strong> tab.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const s = {
  wrap:           { padding: 16 },
  addSection:     { marginBottom: 20 },
  addBtn:         { padding: '9px 18px', borderRadius: 8, border: 'none', background: '#92400e', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  addForm:        { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 },
  addTitle:       { fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 14 },
  addError:       { background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13 },
  addRow:         { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 },
  addField:       { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160 },
  addLabel:       { fontSize: 12, fontWeight: 600, color: '#374151' },
  optional:       { fontWeight: 400, color: '#9ca3af', fontSize: 11 },
  addInput:       { padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, color: '#111827', background: '#fff', width: '100%', boxSizing: 'border-box' },
  baseUomNote:    { fontSize: 12, color: '#6b7280', marginTop: 4 },
  addActions:     { display: 'flex', gap: 10, justifyContent: 'flex-end' },
  section:        { marginBottom: 28 },
  sectionHeader:  { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  sectionTitle:   { fontSize: 14, fontWeight: 700, color: '#374151' },
  sectionBadge:   { display: 'inline-block', padding: '1px 9px', borderRadius: 10, fontSize: 12, fontWeight: 700 },
  sectionBadgeWarn: { background: '#fef3c7', color: '#b45309' },
  sectionBadgeOk:   { background: '#d1fae5', color: '#059669' },
  sectionDesc:    { fontSize: 13, color: '#6b7280', marginBottom: 12, lineHeight: 1.5 },
  error:          { background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 },
  errorMsg:       { background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 16px', margin: '0 0 16px', fontSize: 14 },
  empty:          { textAlign: 'center', padding: '60px 24px', color: '#6b7280', fontSize: 15 },
  emptyState:     { textAlign: 'center', padding: '48px 24px', color: '#6b7280' },
  emptyIcon:      { fontSize: 40, marginBottom: 12 },
  emptyTitle:     { fontSize: 16, fontWeight: 700, color: '#374151', margin: '0 0 8px' },
  emptySub:       { fontSize: 13, color: '#9ca3af', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 },
  tableWrap:      { overflowX: 'auto', borderRadius: 10, border: '1px solid #e5e7eb' },
  table:          { width: '100%', borderCollapse: 'collapse', minWidth: 580 },
  thead:          { background: '#f9fafb' },
  th:             { padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', borderBottom: '2px solid #e5e7eb' },
  row:            { borderBottom: '1px solid #f3f4f6' },
  rowEven:        { background: '#fafafa', borderBottom: '1px solid #f3f4f6' },
  td:             { padding: '10px 12px', fontSize: 14, color: '#374151' },
  factorBadge:    { display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8' },
  pendingBadge:   { display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: '#fef3c7', color: '#b45309' },
  factorInput:    { width: 80, padding: '5px 8px', borderRadius: 6, border: '2px solid #3b82f6', fontSize: 14, fontWeight: 700, textAlign: 'center' },
  editBtn:        { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px' },
  editBtnPending: { padding: '5px 12px', borderRadius: 7, border: 'none', background: '#d97706', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  saveBtn:        { padding: '7px 14px', borderRadius: 7, border: 'none', background: '#059669', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginRight: 4 },
  cancelBtn:      { padding: '7px 12px', borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151' },
  inlineErr:      { fontSize: 12, color: '#dc2626', marginRight: 6 },
};
