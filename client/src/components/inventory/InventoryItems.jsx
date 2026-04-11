import React, { useState, useEffect, useRef } from 'react';
import api from '../../api';
import ItemLabelModal from './ItemLabelModal';
import { useT } from '../../hooks/useT';

const DEFAULT_UNITS = ['each', 'box', 'bag', 'bundle', 'pallet', 'lb', 'kg', 'ft', 'm', 'sq ft', 'gal', 'L', 'roll', 'sheet', 'piece', 'other'];

function ItemForm({ item, onSave, onCancel, activeUnits = DEFAULT_UNITS, knownUnits = DEFAULT_UNITS }) {
  const t = useT();
  const skuRef = useRef(null);
  const [skuScanning, setSkuScanning] = useState(false);

  const activateSKUScan = () => {
    setSkuScanning(true);
    skuRef.current?.focus();
    skuRef.current?.select();
  };

  const [form, setForm] = useState({
    name: item?.name || '',
    sku: item?.sku || '',
    description: item?.description || '',
    category: item?.category || '',
    unit: item?.unit || 'each',
    unit_spec: item?.unit_spec || '',
    unit_cost: item?.unit_cost != null ? String(item.unit_cost) : '',
    reorder_point: item?.reorder_point != null ? String(item.reorder_point) : '0',
    reorder_qty: item?.reorder_qty != null ? String(item.reorder_qty) : '0',
    customUnit: '',
    useCustomUnit: item ? !knownUnits.includes(item.unit) : false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleUnitChange = e => {
    if (e.target.value === 'other') { set('useCustomUnit', true); set('unit', ''); }
    else { set('useCustomUnit', false); set('unit', e.target.value); }
  };

  const submit = async e => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError(t.itemNameRequired);
    const unit = form.useCustomUnit ? form.customUnit.trim() : form.unit;
    if (!unit) return setError(t.itemUnitRequired);
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        unit,
        unit_spec: form.unit_spec.trim() || null,
        unit_cost: form.unit_cost !== '' ? parseFloat(form.unit_cost) : null,
        reorder_point: parseInt(form.reorder_point) || 0,
        reorder_qty: parseInt(form.reorder_qty) || 0,
      };
      if (item) await api.patch(`/inventory/items/${item.id}`, payload);
      else await api.post('/inventory/items', payload);
      onSave();
    } catch (err) {
      setError(err.response?.data?.error || t.failedSaveItem);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={f.form}>
      <h3 style={f.title}>{item ? t.editItem : t.addItem}</h3>
      {error && <div style={f.error}>{error}</div>}
      <div style={f.row}>
        <div style={f.field}>
          <label style={f.label}>{t.itemNameLabel}</label>
          <input style={f.input} maxLength={255} value={form.name} onChange={e => set('name', e.target.value)} placeholder="2x4 Lumber, 3/4 Plywood…" required />
        </div>
        <div style={f.field}>
          <label style={f.label}>{t.itemSkuLabel}</label>
          <div style={f.skuWrap}>
            <input
              ref={skuRef}
              style={{ ...f.input, ...(skuScanning ? f.skuScanning : {}) }}
              maxLength={100}
              value={form.sku}
              onChange={e => set('sku', e.target.value)}
              placeholder={skuScanning ? t.scanBarcodeNow : t.optional}
              onFocus={() => setSkuScanning(true)}
              onBlur={() => setSkuScanning(false)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); skuRef.current?.blur(); } }}
            />
            <button
              type="button"
              style={{ ...f.scanBtn, ...(skuScanning ? f.scanBtnActive : {}) }}
              onClick={activateSKUScan}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16">
                <path d="M3 5h2M3 9h2M3 15h2M3 19h2M19 5h2M19 9h2M19 15h2M19 19h2" />
                <rect x="7" y="3" width="2" height="18" rx="0.5" fill="currentColor" stroke="none" />
                <rect x="11" y="3" width="1" height="18" rx="0.5" fill="currentColor" stroke="none" />
                <rect x="14" y="3" width="3" height="18" rx="0.5" fill="currentColor" stroke="none" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div style={f.row}>
        <div style={f.field}>
          <label style={f.label}>{t.itemCategoryLabel}</label>
          <input style={f.input} maxLength={100} value={form.category} onChange={e => set('category', e.target.value)} placeholder="Lumber, Electrical, Concrete…" />
        </div>
        <div style={f.field}>
          <label style={f.label}>{t.itemUnitLabel}</label>
          <select style={f.input} value={form.useCustomUnit ? 'other' : form.unit} onChange={handleUnitChange}>
            {activeUnits.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          {form.useCustomUnit && (
            <input style={{ ...f.input, marginTop: 6 }} value={form.customUnit} onChange={e => set('customUnit', e.target.value)} placeholder={t.enterUnit} />
          )}
        </div>
        <div style={f.field}>
          <label style={f.label}>{t.itemUnitSpecLabel} <span style={{ fontWeight: 400, color: '#9ca3af' }}>(e.g. "50 ct", "10×50")</span></label>
          <input style={f.input} value={form.unit_spec} onChange={e => set('unit_spec', e.target.value)} placeholder={t.optional} />
        </div>
      </div>
      <div style={f.row}>
        <div style={f.field}>
          <label style={f.label}>{t.itemUnitCostLabel}</label>
          <input style={f.input} type="number" min="0" step="0.01" value={form.unit_cost} onChange={e => set('unit_cost', e.target.value)} placeholder="0.00" />
        </div>
        <div style={f.field}>
          <label style={f.label}>{t.itemReorderPoint}</label>
          <input style={f.input} type="number" min="0" step="1" value={form.reorder_point} onChange={e => set('reorder_point', e.target.value)} />
        </div>
        <div style={f.field}>
          <label style={f.label}>{t.itemReorderQty}</label>
          <input style={f.input} type="number" min="0" step="1" value={form.reorder_qty} onChange={e => set('reorder_qty', e.target.value)} />
        </div>
      </div>
      <div style={f.field}>
        <label style={f.label}>{t.itemDescriptionLabel}</label>
        <textarea style={{ ...f.input, minHeight: 60, resize: 'vertical' }} maxLength={1000} value={form.description} onChange={e => set('description', e.target.value)} />
      </div>
      <div style={f.actions}>
        <button type="button" style={f.cancelBtn} onClick={onCancel}>{t.cancel}</button>
        <button type="submit" style={{ ...f.saveBtn, ...(saving ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }} disabled={saving}>{saving ? t.saving : item ? t.saveChanges : t.addItem}</button>
      </div>
    </form>
  );
}

// ── UOM Management Panel ──────────────────────────────────────────────────────
function ItemUOMPanel({ item }) {
  const t = useT();
  const [uoms, setUOMs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newForm, setNewForm] = useState({ unit: 'each', unit_spec: '', factor: '1', is_base: false });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingRemoveUomId, setPendingRemoveUomId] = useState(null);
  const [removeUomError, setRemoveUomError] = useState('');

  const load = () => {
    api.get(`/inventory/items/${item.id}/uoms`)
      .then(r => setUOMs(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  React.useEffect(() => { load(); }, [item.id]);

  const setN = (k, v) => setNewForm(f => ({ ...f, [k]: v }));
  const setE = (k, v) => setEditForm(f => ({ ...f, [k]: v }));

  const add = async () => {
    setError(''); setSaving(true);
    try {
      const rows = await api.post(`/inventory/items/${item.id}/uoms`, {
        unit: newForm.unit.trim(), unit_spec: newForm.unit_spec.trim() || null,
        factor: parseFloat(newForm.factor), is_base: newForm.is_base,
      });
      setUOMs(rows.data);
      setAddOpen(false);
      setNewForm({ unit: 'each', unit_spec: '', factor: '1', is_base: false });
    } catch (err) { setError(err.response?.data?.error || t.failedAddUOM); }
    finally { setSaving(false); }
  };

  const save = async (uomId) => {
    setError(''); setSaving(true);
    try {
      const rows = await api.patch(`/inventory/items/${item.id}/uoms/${uomId}`, {
        unit: editForm.unit, unit_spec: editForm.unit_spec || null,
        factor: parseFloat(editForm.factor), is_base: editForm.is_base,
      });
      setUOMs(rows.data); setEditingId(null);
    } catch (err) { setError(err.response?.data?.error || t.failedSaveUOM); }
    finally { setSaving(false); }
  };

  const remove = async (uomId) => {
    setPendingRemoveUomId(null);
    setRemoveUomError('');
    try {
      const rows = await api.delete(`/inventory/items/${item.id}/uoms/${uomId}`);
      setUOMs(rows.data);
    } catch (err) { setRemoveUomError(err.response?.data?.error || t.failedRemoveUOM); }
  };

  return (
    <div style={u.wrap}>
      <div style={u.header}>
        <div>
          <div style={u.title}>{t.unitsOfMeasure}</div>
          <div style={u.hint}>{t.uomHint}</div>
        </div>
        <button style={u.addBtn} onClick={() => setAddOpen(a => !a)}>
          {addOpen ? t.cancel : t.addUOM}
        </button>
      </div>

      {error && <div style={u.error}>{error}</div>}
      {removeUomError && <div style={u.error}>{removeUomError}</div>}

      {addOpen && (
        <div style={u.addForm}>
          <div style={u.formRow}>
            <div style={u.field}>
              <label style={u.label}>{t.uomUnit}</label>
              <input style={u.input} value={newForm.unit} onChange={e => setN('unit', e.target.value)} placeholder="box, bag, each…" />
            </div>
            <div style={u.field}>
              <label style={u.label}>{t.uomSpec}</label>
              <input style={u.input} value={newForm.unit_spec} onChange={e => setN('unit_spec', e.target.value)} placeholder="50 ct, 10×50…" />
            </div>
            <div style={u.field}>
              <label style={u.label}>{t.uomFactor}</label>
              <input style={u.input} type="number" min="0.0001" step="any" value={newForm.factor} onChange={e => setN('factor', e.target.value)} />
            </div>
            <div style={u.field}>
              <label style={u.label}>{t.uomBase}</label>
              <input type="checkbox" checked={newForm.is_base} onChange={e => setN('is_base', e.target.checked)} style={{ marginTop: 10 }} />
            </div>
            <button style={{ ...u.saveBtn, ...(saving ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }} onClick={add} disabled={saving}>{t.save}</button>
          </div>
          <p style={u.factorNote}>{t.uomFactorNote}</p>
        </div>
      )}

      {loading ? (
        <div style={u.empty}>{t.advSettingsLoading}</div>
      ) : uoms.length === 0 ? (
        <div style={u.empty}>{t.uomEmpty}</div>
      ) : (
        <table style={u.table}>
          <thead>
            <tr>
              <th style={u.th}>{t.uomUnit}</th>
              <th style={u.th}>{t.uomSpec}</th>
              <th style={{ ...u.th, textAlign: 'right' }}>{t.uomFactor}</th>
              <th style={u.th}>{t.uomBase}</th>
              <th style={u.th}></th>
            </tr>
          </thead>
          <tbody>
            {uoms.map(row => (
              <tr key={row.id} style={{ opacity: row.active ? 1 : 0.5 }}>
                {editingId === row.id ? (
                  <>
                    <td style={u.td}><input style={u.input} value={editForm.unit} onChange={e => setE('unit', e.target.value)} /></td>
                    <td style={u.td}><input style={u.input} value={editForm.unit_spec || ''} onChange={e => setE('unit_spec', e.target.value)} placeholder={t.optional} /></td>
                    <td style={u.td}><input style={{ ...u.input, width: 70, textAlign: 'right' }} type="number" min="0.0001" step="any" value={editForm.factor} onChange={e => setE('factor', e.target.value)} /></td>
                    <td style={u.td}><input type="checkbox" checked={!!editForm.is_base} onChange={e => setE('is_base', e.target.checked)} /></td>
                    <td style={{ ...u.td, whiteSpace: 'nowrap' }}>
                      <button style={{ ...u.saveBtn, ...(saving ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }} onClick={() => save(row.id)} disabled={saving}>{t.save}</button>
                      <button style={u.cancelBtn} onClick={() => setEditingId(null)}>{t.cancel}</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ ...u.td, fontWeight: 600 }}>{row.unit}</td>
                    <td style={{ ...u.td, color: '#6b7280' }}>{row.unit_spec || '—'}</td>
                    <td style={{ ...u.td, textAlign: 'right' }}>{parseFloat(row.factor)}</td>
                    <td style={u.td}>{row.is_base ? <span style={u.baseBadge}>{t.uomBaseBadge}</span> : ''}</td>
                    <td style={{ ...u.td, whiteSpace: 'nowrap' }}>
                      <button style={u.iconBtn} aria-label="Edit unit" onClick={() => { setEditingId(row.id); setEditForm({ unit: row.unit, unit_spec: row.unit_spec || '', factor: String(row.factor), is_base: row.is_base }); }}>✏️</button>
                      {!row.is_base && (pendingRemoveUomId === row.id ? (
                        <>
                          <button style={u.confirmRemoveBtn} onClick={() => remove(row.id)}>{t.confirm}</button>
                          <button style={u.iconBtn} aria-label="Cancel remove" onClick={() => setPendingRemoveUomId(null)}>✕</button>
                        </>
                      ) : (
                        <button style={u.iconBtn} aria-label="Remove unit" onClick={() => setPendingRemoveUomId(row.id)}>🗑️</button>
                      ))}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const u = {
  wrap:       { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginTop: 16 },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  title:      { fontSize: 14, fontWeight: 700, color: '#374151' },
  hint:       { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  addBtn:     { padding: '6px 14px', borderRadius: 7, border: 'none', background: '#92400e', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  error:      { background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13 },
  addForm:    { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12 },
  formRow:    { display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' },
  field:      { display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 80 },
  label:      { fontSize: 11, fontWeight: 600, color: '#6b7280' },
  input:      { padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, width: '100%', boxSizing: 'border-box' },
  factorNote: { fontSize: 11, color: '#9ca3af', marginTop: 8, marginBottom: 0 },
  saveBtn:    { padding: '6px 12px', borderRadius: 6, border: 'none', background: '#059669', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-end' },
  cancelBtn:  { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 13, cursor: 'pointer', marginLeft: 4 },
  empty:      { fontSize: 13, color: '#9ca3af', padding: '8px 0' },
  table:      { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:         { padding: '6px 8px', fontWeight: 700, color: '#6b7280', fontSize: 11, textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid #e5e7eb' },
  td:         { padding: '8px 8px', color: '#374151', borderBottom: '1px solid #f3f4f6' },
  iconBtn:    { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 3px' },
  confirmRemoveBtn: { background: '#ef4444', color: '#fff', border: 'none', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  baseBadge:  { display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8' },
};

const PAGE_SIZE = 100;

export default function InventoryItems({ onItemChange }) {
  const t = useT();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState({ active: DEFAULT_UNITS, known: DEFAULT_UNITS });
  const [editingItem, setEditingItem] = useState(null); // null=none, false=new, obj=editing
  const [archiving, setArchiving] = useState(null);
  const [pendingArchiveItemId, setPendingArchiveItemId] = useState(null);
  const [archiveError, setArchiveError] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [labelItem, setLabelItem] = useState(null);

  const load = async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ active: showInactive ? 'all' : 'true', limit: PAGE_SIZE, offset: p * PAGE_SIZE });
      if (search) params.set('search', search);
      if (categoryFilter) params.set('category', categoryFilter);
      const [itemsRes, cats, unitsRes] = await Promise.all([
        api.get(`/inventory/items?${params}`),
        api.get('/inventory/items/categories'),
        api.get('/inventory/units'),
      ]);
      setItems(itemsRes.data.items);
      setTotal(itemsRes.data.total);
      setCategories(cats.data);
      setUnits(unitsRes.data);
    } catch (e) {
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(0); load(0); }, [showInactive, categoryFilter]);

  const handleSearch = e => { e.preventDefault(); setPage(0); load(0); };

  const handleSave = () => {
    setEditingItem(null);
    load();
    onItemChange?.();
  };

  const archive = async item => {
    setPendingArchiveItemId(null);
    setArchiveError('');
    setArchiving(item.id);
    try {
      await api.delete(`/inventory/items/${item.id}`);
      load();
      onItemChange?.();
    } catch (err) {
      setArchiveError(err.response?.data?.error || t.failedArchiveItem);
    } finally {
      setArchiving(null);
    }
  };

  const restore = async item => {
    setRestoreError('');
    try {
      await api.patch(`/inventory/items/${item.id}`, { active: true });
      load();
    } catch { setRestoreError(t.failedRestoreItem); }
  };

  return (
    <div style={s.wrap}>
      {editingItem !== null && (
        <div style={s.wrap}>
          <ItemForm
            item={editingItem || null}
            onSave={handleSave}
            onCancel={() => setEditingItem(null)}
            activeUnits={units.active}
            knownUnits={units.known}
          />
          {editingItem && <ItemUOMPanel item={editingItem} />}
        </div>
      )}

      {editingItem === null && (
        <>
          {/* Toolbar */}
          <div style={s.toolbar}>
            <form onSubmit={handleSearch} style={s.searchRow}>
              <input
                style={s.searchInput}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t.searchItemsPlaceholder}
              />
              <button type="submit" style={s.searchBtn}>{t.search}</button>
            </form>
            <select style={s.select} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="">{t.allCategories}</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label style={s.toggle}>
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
              {t.showArchived}
            </label>
            <button style={s.addBtn} onClick={() => setEditingItem(false)}>{t.addItemBtn}</button>
          </div>

          {error && <div style={s.error}>{error}</div>}

          {loading ? (
            <div style={s.empty}>{t.advSettingsLoading}</div>
          ) : items.length === 0 ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>🗂</div>
              <p>{t.itemsEmpty}</p>
            </div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr style={s.thead}>
                    <th style={s.th}>{t.colName}</th>
                    <th style={s.th}>{t.colSku}</th>
                    <th style={s.th}>{t.colCategory}</th>
                    <th style={s.th}>{t.colUnit}</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>{t.colUnitCost}</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>{t.colReorderAt}</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>{t.colReorderQty}</th>
                    <th style={s.th}>{t.colStatus}</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={item.id} style={{ ...(i % 2 === 0 ? s.rowEven : s.row), opacity: item.active ? 1 : 0.55 }}>
                      <td style={{ ...s.td, fontWeight: 600 }}>{item.name}</td>
                      <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>{item.sku || '—'}</td>
                      <td style={s.td}>{item.category || '—'}</td>
                      <td style={{ ...s.td, color: '#6b7280' }}>
                        {item.unit}{item.unit_spec ? <span style={{ color: '#9ca3af', fontSize: 12 }}> ({item.unit_spec})</span> : ''}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right' }}>{item.unit_cost != null ? `$${parseFloat(item.unit_cost).toFixed(2)}` : '—'}</td>
                      <td style={{ ...s.td, textAlign: 'right' }}>{item.reorder_point > 0 ? item.reorder_point : '—'}</td>
                      <td style={{ ...s.td, textAlign: 'right' }}>{item.reorder_qty > 0 ? item.reorder_qty : '—'}</td>
                      <td style={s.td}>
                        {item.active
                          ? <span style={{ ...s.badge, color: '#059669', background: '#d1fae5' }}>{t.itemActiveStatus}</span>
                          : <span style={{ ...s.badge, color: '#9ca3af', background: '#f3f4f6' }}>{t.itemArchivedStatus}</span>}
                      </td>
                      <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                        {item.active ? (
                          <>
                            <button style={s.iconBtn} onClick={() => setLabelItem(item)} aria-label="Print label">🏷️</button>
                            <button style={s.iconBtn} onClick={() => setEditingItem(item)} aria-label="Edit item">✏️</button>
                            {pendingArchiveItemId === item.id ? (
                              <>
                                <button style={s.confirmArchiveBtn} onClick={() => archive(item)} disabled={archiving === item.id}>{t.confirm}</button>
                                <button style={s.iconBtn} aria-label="Cancel archive" onClick={() => setPendingArchiveItemId(null)}>✕</button>
                              </>
                            ) : (
                              <button style={{ ...s.iconBtn, opacity: archiving === item.id ? 0.5 : 1 }} onClick={() => setPendingArchiveItemId(item.id)} title="Archive">🗄️</button>
                            )}
                          </>
                        ) : (
                          <button style={s.iconBtn} onClick={() => restore(item)} title="Restore">↩️</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {total > PAGE_SIZE && (
                <div style={s.pagination}>
                  <span style={s.pageInfo}>
                    {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                  </span>
                  <button style={s.pageBtn} disabled={page === 0} onClick={() => { const p = page - 1; setPage(p); load(p); }}>← Prev</button>
                  <button style={s.pageBtn} disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => { const p = page + 1; setPage(p); load(p); }}>Next →</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {archiveError && <p style={s.inlineError}>{archiveError}</p>}
      {restoreError && <p style={s.inlineError}>{restoreError}</p>}
      {labelItem && (
        <ItemLabelModal item={labelItem} onClose={() => setLabelItem(null)} />
      )}
    </div>
  );
}

const f = {
  form:      { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, margin: 16 },
  title:     { fontSize: 17, fontWeight: 700, color: '#111827', marginBottom: 20 },
  error:     { background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14 },
  row:       { display: 'flex', gap: 12, flexWrap: 'wrap' },
  field:     { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160, marginBottom: 14 },
  label:     { fontSize: 12, fontWeight: 600, color: '#374151' },
  input:     { padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, color: '#111827', background: '#fff', width: '100%', boxSizing: 'border-box' },
  skuWrap:     { display: 'flex', gap: 6, alignItems: 'center' },
  skuScanning: { borderColor: '#f59e0b', boxShadow: '0 0 0 2px #fde68a', outline: 'none' },
  scanBtn:     { flexShrink: 0, padding: '7px 9px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  scanBtnActive: { borderColor: '#f59e0b', background: '#fffbeb', color: '#d97706' },
  actions:   { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 },
  cancelBtn: { padding: '9px 18px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#374151' },
  saveBtn:   { padding: '9px 20px', borderRadius: 8, border: 'none', background: '#92400e', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
};

const s = {
  wrap:        { padding: 16 },
  toolbar:     { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 },
  searchRow:   { display: 'flex', gap: 0, flex: 1, minWidth: 200 },
  searchInput: { flex: 1, padding: '8px 12px', borderRadius: '8px 0 0 8px', border: '1px solid #d1d5db', borderRight: 'none', fontSize: 14 },
  searchBtn:   { padding: '8px 14px', borderRadius: '0 8px 8px 0', border: '1px solid #d1d5db', background: '#f9fafb', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  select:      { padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, background: '#fff', color: '#374151' },
  toggle:      { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280', cursor: 'pointer', whiteSpace: 'nowrap' },
  addBtn:      { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#92400e', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
  error:       { background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 14 },
  empty:       { textAlign: 'center', padding: '60px 24px', color: '#6b7280', fontSize: 15 },
  emptyIcon:   { fontSize: 40, marginBottom: 12 },
  tableWrap:   { overflowX: 'auto', borderRadius: 10, border: '1px solid #e5e7eb' },
  table:       { width: '100%', borderCollapse: 'collapse', minWidth: 640 },
  thead:       { background: '#f9fafb' },
  th:          { padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '2px solid #e5e7eb' },
  row:         { borderBottom: '1px solid #f3f4f6' },
  rowEven:     { background: '#fafafa', borderBottom: '1px solid #f3f4f6' },
  td:          { padding: '10px 12px', fontSize: 14, color: '#374151' },
  badge:       { display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 },
  iconBtn:     { background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '2px 4px', marginLeft: 2 },
  confirmArchiveBtn: { background: '#f59e0b', color: '#fff', border: 'none', padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  inlineError: { fontSize: 12, color: '#ef4444', padding: '4px 14px', margin: 0 },
  pagination:  { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid #e5e7eb', background: '#f9fafb' },
  pageInfo:    { fontSize: 13, color: '#6b7280', marginRight: 'auto' },
  pageBtn:     { padding: '5px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500 },
};
