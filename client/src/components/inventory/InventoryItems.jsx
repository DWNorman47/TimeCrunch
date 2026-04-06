import React, { useState, useEffect } from 'react';
import api from '../../api';

const UNITS = ['each', 'box', 'bag', 'bundle', 'pallet', 'lb', 'kg', 'ft', 'm', 'sq ft', 'gal', 'L', 'roll', 'sheet', 'piece', 'other'];

function ItemForm({ item, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: item?.name || '',
    sku: item?.sku || '',
    description: item?.description || '',
    category: item?.category || '',
    unit: item?.unit || 'each',
    unit_cost: item?.unit_cost != null ? String(item.unit_cost) : '',
    reorder_point: item?.reorder_point != null ? String(item.reorder_point) : '0',
    reorder_qty: item?.reorder_qty != null ? String(item.reorder_qty) : '0',
    customUnit: '',
    useCustomUnit: item ? !UNITS.includes(item.unit) : false,
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
    if (!form.name.trim()) return setError('Name is required.');
    const unit = form.useCustomUnit ? form.customUnit.trim() : form.unit;
    if (!unit) return setError('Unit is required.');
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        unit,
        unit_cost: form.unit_cost !== '' ? parseFloat(form.unit_cost) : null,
        reorder_point: parseInt(form.reorder_point) || 0,
        reorder_qty: parseInt(form.reorder_qty) || 0,
      };
      if (item) await api.patch(`/inventory/items/${item.id}`, payload);
      else await api.post('/inventory/items', payload);
      onSave();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save item.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={f.form}>
      <h3 style={f.title}>{item ? 'Edit Item' : 'Add Item'}</h3>
      {error && <div style={f.error}>{error}</div>}
      <div style={f.row}>
        <div style={f.field}>
          <label style={f.label}>Name *</label>
          <input style={f.input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="2x4 Lumber, 3/4 Plywood…" required />
        </div>
        <div style={f.field}>
          <label style={f.label}>SKU</label>
          <input style={f.input} value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="Optional" />
        </div>
      </div>
      <div style={f.row}>
        <div style={f.field}>
          <label style={f.label}>Category</label>
          <input style={f.input} value={form.category} onChange={e => set('category', e.target.value)} placeholder="Lumber, Electrical, Concrete…" />
        </div>
        <div style={f.field}>
          <label style={f.label}>Unit *</label>
          <select style={f.input} value={form.useCustomUnit ? 'other' : form.unit} onChange={handleUnitChange}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          {form.useCustomUnit && (
            <input style={{ ...f.input, marginTop: 6 }} value={form.customUnit} onChange={e => set('customUnit', e.target.value)} placeholder="Enter unit…" />
          )}
        </div>
      </div>
      <div style={f.row}>
        <div style={f.field}>
          <label style={f.label}>Unit Cost ($)</label>
          <input style={f.input} type="number" min="0" step="0.01" value={form.unit_cost} onChange={e => set('unit_cost', e.target.value)} placeholder="0.00" />
        </div>
        <div style={f.field}>
          <label style={f.label}>Reorder Point</label>
          <input style={f.input} type="number" min="0" step="1" value={form.reorder_point} onChange={e => set('reorder_point', e.target.value)} />
        </div>
        <div style={f.field}>
          <label style={f.label}>Reorder Qty</label>
          <input style={f.input} type="number" min="0" step="1" value={form.reorder_qty} onChange={e => set('reorder_qty', e.target.value)} />
        </div>
      </div>
      <div style={f.field}>
        <label style={f.label}>Description</label>
        <textarea style={{ ...f.input, minHeight: 60, resize: 'vertical' }} value={form.description} onChange={e => set('description', e.target.value)} />
      </div>
      <div style={f.actions}>
        <button type="button" style={f.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" style={f.saveBtn} disabled={saving}>{saving ? 'Saving…' : item ? 'Save Changes' : 'Add Item'}</button>
      </div>
    </form>
  );
}

export default function InventoryItems({ onItemChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState([]);
  const [editingItem, setEditingItem] = useState(null); // null=none, false=new, obj=editing
  const [archiving, setArchiving] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ active: showInactive ? 'all' : 'true' });
      if (search) params.set('search', search);
      if (categoryFilter) params.set('category', categoryFilter);
      const [items, cats] = await Promise.all([
        api.get(`/inventory/items?${params}`),
        api.get('/inventory/items/categories'),
      ]);
      setItems(items.data);
      setCategories(cats.data);
    } catch (e) {
      setError('Failed to load items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [showInactive, categoryFilter]);

  const handleSearch = e => { e.preventDefault(); load(); };

  const handleSave = () => {
    setEditingItem(null);
    load();
    onItemChange?.();
  };

  const archive = async item => {
    if (!confirm(`Archive "${item.name}"? It will be hidden from new transactions.`)) return;
    setArchiving(item.id);
    try {
      await api.delete(`/inventory/items/${item.id}`);
      load();
      onItemChange?.();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to archive item.');
    } finally {
      setArchiving(null);
    }
  };

  const restore = async item => {
    try {
      await api.patch(`/inventory/items/${item.id}`, { active: true });
      load();
    } catch { alert('Failed to restore item.'); }
  };

  return (
    <div style={s.wrap}>
      {editingItem !== null && (
        <ItemForm
          item={editingItem || null}
          onSave={handleSave}
          onCancel={() => setEditingItem(null)}
        />
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
                placeholder="Search items…"
              />
              <button type="submit" style={s.searchBtn}>Search</button>
            </form>
            <select style={s.select} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label style={s.toggle}>
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
              Show archived
            </label>
            <button style={s.addBtn} onClick={() => setEditingItem(false)}>+ Add Item</button>
          </div>

          {error && <div style={s.error}>{error}</div>}

          {loading ? (
            <div style={s.empty}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>🗂</div>
              <p>No items yet. Add your first item to get started.</p>
            </div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr style={s.thead}>
                    <th style={s.th}>Name</th>
                    <th style={s.th}>SKU</th>
                    <th style={s.th}>Category</th>
                    <th style={s.th}>Unit</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Unit Cost</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Reorder At</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Reorder Qty</th>
                    <th style={s.th}>Status</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={item.id} style={{ ...(i % 2 === 0 ? s.rowEven : s.row), opacity: item.active ? 1 : 0.55 }}>
                      <td style={{ ...s.td, fontWeight: 600 }}>{item.name}</td>
                      <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12, color: '#6b7280' }}>{item.sku || '—'}</td>
                      <td style={s.td}>{item.category || '—'}</td>
                      <td style={{ ...s.td, color: '#6b7280' }}>{item.unit}</td>
                      <td style={{ ...s.td, textAlign: 'right' }}>{item.unit_cost != null ? `$${parseFloat(item.unit_cost).toFixed(2)}` : '—'}</td>
                      <td style={{ ...s.td, textAlign: 'right' }}>{item.reorder_point > 0 ? item.reorder_point : '—'}</td>
                      <td style={{ ...s.td, textAlign: 'right' }}>{item.reorder_qty > 0 ? item.reorder_qty : '—'}</td>
                      <td style={s.td}>
                        {item.active
                          ? <span style={{ ...s.badge, color: '#059669', background: '#d1fae5' }}>Active</span>
                          : <span style={{ ...s.badge, color: '#9ca3af', background: '#f3f4f6' }}>Archived</span>}
                      </td>
                      <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                        {item.active ? (
                          <>
                            <button style={s.iconBtn} onClick={() => setEditingItem(item)} title="Edit">✏️</button>
                            <button style={{ ...s.iconBtn, opacity: archiving === item.id ? 0.5 : 1 }} onClick={() => archive(item)} title="Archive">🗄️</button>
                          </>
                        ) : (
                          <button style={s.iconBtn} onClick={() => restore(item)} title="Restore">↩️</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
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
};
