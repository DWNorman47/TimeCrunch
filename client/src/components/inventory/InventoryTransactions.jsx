import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';

const TYPE_LABELS = { receive: 'Receive', issue: 'Issue', transfer: 'Transfer', adjust: 'Adjust', convert: 'Convert' };
const TYPE_COLORS = {
  receive:  { color: '#059669', bg: '#d1fae5' },
  issue:    { color: '#d97706', bg: '#fef3c7' },
  transfer: { color: '#2563eb', bg: '#dbeafe' },
  adjust:   { color: '#6b7280', bg: '#f3f4f6' },
  convert:  { color: '#8b5cf6', bg: '#ede9fe' },
};

function TransactionForm({ isAdmin, locations, projects, onSave, onCancel }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    type: isAdmin ? 'receive' : 'issue',
    item_id: '',
    quantity: '',
    uom_id: '',
    to_uom_id: '',
    to_quantity: '',
    from_location_id: '',
    to_location_id: '',
    area_id:        '',
    rack_id:        '',
    bay_id:         '',
    compartment_id: '',
    project_id: '',
    notes: '',
    reference_no: '',
    unit_cost: '',
  });
  const [itemUoms, setItemUoms] = useState([]);
  // Cascading bin options for the destination location
  const [binOpts, setBinOpts] = useState({ areas: [], racks: [], bays: [], compartments: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  useEffect(() => {
    api.get('/inventory/items?active=true').then(r => setItems(r.data)).catch(() => {});
  }, []);

  // Load UOMs when item changes
  useEffect(() => {
    setItemUoms([]);
    set('uom_id', ''); set('to_uom_id', ''); set('to_quantity', '');
    if (!form.item_id) return;
    api.get(`/inventory/items/${form.item_id}/uoms`)
      .then(r => setItemUoms(r.data.filter(u => u.active)))
      .catch(() => {});
  }, [form.item_id]);

  // Cascade bin options when destination location changes
  useEffect(() => {
    const locId = form.to_location_id;
    set('area_id', ''); set('rack_id', ''); set('bay_id', ''); set('compartment_id', '');
    setBinOpts({ areas: [], racks: [], bays: [], compartments: [] });
    if (!locId) return;
    api.get(`/inventory/setup/areas?location_id=${locId}&active=true`)
      .then(r => setBinOpts(b => ({ ...b, areas: r.data })))
      .catch(() => {});
  }, [form.to_location_id]);

  useEffect(() => {
    set('rack_id', ''); set('bay_id', ''); set('compartment_id', '');
    setBinOpts(b => ({ ...b, racks: [], bays: [], compartments: [] }));
    if (!form.area_id) return;
    api.get(`/inventory/setup/racks?area_id=${form.area_id}&active=true`)
      .then(r => setBinOpts(b => ({ ...b, racks: r.data })))
      .catch(() => {});
  }, [form.area_id]);

  useEffect(() => {
    set('bay_id', ''); set('compartment_id', '');
    setBinOpts(b => ({ ...b, bays: [], compartments: [] }));
    if (!form.rack_id) return;
    api.get(`/inventory/setup/bays?rack_id=${form.rack_id}&active=true`)
      .then(r => setBinOpts(b => ({ ...b, bays: r.data })))
      .catch(() => {});
  }, [form.rack_id]);

  useEffect(() => {
    set('compartment_id', '');
    setBinOpts(b => ({ ...b, compartments: [] }));
    if (!form.bay_id) return;
    api.get(`/inventory/setup/compartments?bay_id=${form.bay_id}&active=true`)
      .then(r => setBinOpts(b => ({ ...b, compartments: r.data })))
      .catch(() => {});
  }, [form.bay_id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const activeLocations = locations.filter(l => l.active);

  const submit = async e => {
    e.preventDefault();
    setError(''); setWarning('');
    if (!form.item_id) return setError('Select an item.');
    const qty = parseFloat(form.quantity);
    if (!form.quantity || isNaN(qty) || qty === 0) return setError('Enter a non-zero quantity.');
    setSaving(true);
    try {
      const payload = {
        type: form.type,
        item_id: parseInt(form.item_id),
        quantity: qty,
        from_location_id: form.from_location_id ? parseInt(form.from_location_id) : undefined,
        to_location_id: form.to_location_id ? parseInt(form.to_location_id) : undefined,
        uom_id:         form.uom_id    ? parseInt(form.uom_id)    : undefined,
        to_uom_id:      form.to_uom_id ? parseInt(form.to_uom_id) : undefined,
        to_quantity:    form.to_quantity ? parseFloat(form.to_quantity) : undefined,
        area_id:        form.area_id        ? parseInt(form.area_id)        : undefined,
        rack_id:        form.rack_id        ? parseInt(form.rack_id)        : undefined,
        bay_id:         form.bay_id         ? parseInt(form.bay_id)         : undefined,
        compartment_id: form.compartment_id ? parseInt(form.compartment_id) : undefined,
        project_id: form.project_id ? parseInt(form.project_id) : undefined,
        notes: form.notes || undefined,
        reference_no: form.reference_no || undefined,
        unit_cost: form.unit_cost !== '' ? parseFloat(form.unit_cost) : undefined,
      };
      const r = await api.post('/inventory/transactions', payload);
      if (r.data.warning === 'stock_negative') {
        setWarning('Stock went negative at this location. Check your on-hand quantities.');
      }
      onSave();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save transaction.');
    } finally {
      setSaving(false);
    }
  };

  const showFrom  = ['issue', 'transfer', 'convert'].includes(form.type);
  const showTo    = ['receive', 'transfer'].includes(form.type);
  const showToAdj = form.type === 'adjust';
  const isConvert = form.type === 'convert';

  // Auto-suggest to_quantity when both UOMs have factors
  const suggestedToQty = (() => {
    if (!isConvert || !form.quantity || !form.to_uom_id) return null;
    const src = form.uom_id ? itemUoms.find(u => String(u.id) === form.uom_id) : null;
    const tgt = itemUoms.find(u => String(u.id) === form.to_uom_id);
    if (!tgt) return null;
    const srcFactor = src ? parseFloat(src.factor) : 1;
    const tgtFactor = parseFloat(tgt.factor);
    if (!tgtFactor) return null;
    return ((parseFloat(form.quantity) * srcFactor) / tgtFactor).toFixed(4).replace(/\.?0+$/, '');
  })();

  return (
    <form onSubmit={submit} style={f.form}>
      <h3 style={f.title}>Log Movement</h3>
      {error   && <div style={f.error}>{error}</div>}
      {warning && <div style={f.warning}>{warning}</div>}

      {isAdmin && (
        <div style={f.field}>
          <label style={f.label}>Type</label>
          <select style={f.input} value={form.type} onChange={e => set('type', e.target.value)}>
            <option value="receive">Receive — add stock from supplier/delivery</option>
            <option value="issue">Issue — consume or send to job site</option>
            <option value="transfer">Transfer — move between locations</option>
            <option value="adjust">Adjust — manual correction</option>
            <option value="convert">Convert — break into a different unit/pack size</option>
          </select>
        </div>
      )}

      <div style={f.row}>
        <div style={f.field}>
          <label style={f.label}>Item *</label>
          <select style={f.input} value={form.item_id} onChange={e => {
            const item = items.find(i => String(i.id) === e.target.value);
            set('item_id', e.target.value);
            if (item?.unit_cost) set('unit_cost', String(item.unit_cost));
          }}>
            <option value="">Select item…</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.name}{i.sku ? ` (${i.sku})` : ''}</option>)}
          </select>
        </div>
        {itemUoms.length > 0 && (
          <div style={f.field}>
            <label style={f.label}>{isConvert ? 'Convert From' : 'UOM'}</label>
            <select style={f.input} value={form.uom_id} onChange={e => set('uom_id', e.target.value)}>
              <option value="">Default unit</option>
              {itemUoms.map(u => (
                <option key={u.id} value={u.id}>
                  {u.unit}{u.unit_spec ? ` (${u.unit_spec})` : ''}{u.is_base ? ' — base' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <div style={f.field}>
          <label style={f.label}>
            Quantity *
            {form.type === 'adjust' && <span style={f.hint}> (+ to add, − to remove)</span>}
            {isConvert && <span style={f.hint}> (qty to convert)</span>}
          </label>
          <input
            style={f.input} type="number" step="any"
            value={form.quantity} onChange={e => set('quantity', e.target.value)}
            placeholder={form.type === 'adjust' ? '±qty' : 'qty'}
          />
        </div>
      </div>

      {isConvert && (
        <div style={f.row}>
          <div style={f.field}>
            <label style={f.label}>Convert To UOM *</label>
            <select style={f.input} value={form.to_uom_id} onChange={e => set('to_uom_id', e.target.value)}>
              <option value="">Select target UOM…</option>
              {itemUoms.filter(u => String(u.id) !== form.uom_id).map(u => (
                <option key={u.id} value={u.id}>
                  {u.unit}{u.unit_spec ? ` (${u.unit_spec})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div style={f.field}>
            <label style={f.label}>
              Resulting Qty *
              {suggestedToQty && <span style={f.hint}> — suggested: {suggestedToQty}</span>}
            </label>
            <input
              style={f.input} type="number" step="any" min="0"
              value={form.to_quantity}
              onChange={e => set('to_quantity', e.target.value)}
              placeholder={suggestedToQty || 'qty in target UOM'}
            />
          </div>
        </div>
      )}

      {showFrom && (
        <div style={f.field}>
          <label style={f.label}>From Location *</label>
          <select style={f.input} value={form.from_location_id} onChange={e => set('from_location_id', e.target.value)}>
            <option value="">Select location…</option>
            {activeLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      {(showTo || showToAdj) && (
        <>
          <div style={f.field}>
            <label style={f.label}>{showToAdj ? 'Location *' : 'To Location *'}</label>
            <select style={f.input} value={form.to_location_id} onChange={e => set('to_location_id', e.target.value)}>
              <option value="">Select location…</option>
              {activeLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {binOpts.areas.length > 0 && (
            <div style={f.binRow}>
              <div style={f.binField}>
                <label style={f.label}>Area</label>
                <select style={f.input} value={form.area_id} onChange={e => set('area_id', e.target.value)}>
                  <option value="">None</option>
                  {binOpts.areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              {form.area_id && binOpts.racks.length > 0 && (
                <div style={f.binField}>
                  <label style={f.label}>Rack</label>
                  <select style={f.input} value={form.rack_id} onChange={e => set('rack_id', e.target.value)}>
                    <option value="">None</option>
                    {binOpts.racks.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              )}
              {form.rack_id && binOpts.bays.length > 0 && (
                <div style={f.binField}>
                  <label style={f.label}>Bay</label>
                  <select style={f.input} value={form.bay_id} onChange={e => set('bay_id', e.target.value)}>
                    <option value="">None</option>
                    {binOpts.bays.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              {form.bay_id && binOpts.compartments.length > 0 && (
                <div style={f.binField}>
                  <label style={f.label}>Compartment</label>
                  <select style={f.input} value={form.compartment_id} onChange={e => set('compartment_id', e.target.value)}>
                    <option value="">None</option>
                    {binOpts.compartments.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {(form.type === 'issue' || form.type === 'receive') && (
        <div style={f.field}>
          <label style={f.label}>Project</label>
          <select style={f.input} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
            <option value="">None</option>
            {projects.filter(p => p.active !== false).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      {isAdmin && (
        <div style={f.row}>
          <div style={f.field}>
            <label style={f.label}>Unit Cost ($)</label>
            <input style={f.input} type="number" min="0" step="0.01" value={form.unit_cost} onChange={e => set('unit_cost', e.target.value)} placeholder="From catalog" />
          </div>
          <div style={f.field}>
            <label style={f.label}>Reference / PO #</label>
            <input style={f.input} value={form.reference_no} onChange={e => set('reference_no', e.target.value)} placeholder="Optional" />
          </div>
        </div>
      )}

      <div style={f.field}>
        <label style={f.label}>Notes</label>
        <textarea style={{ ...f.input, minHeight: 60, resize: 'vertical' }} value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>

      <div style={f.actions}>
        <button type="button" style={f.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" style={f.saveBtn} disabled={saving}>{saving ? 'Saving…' : 'Log Transaction'}</button>
      </div>
    </form>
  );
}

export default function InventoryTransactions({ isAdmin, locations, projects, onTransaction }) {
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({ type: '', location_id: '', from: '', to: '' });
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const load = useCallback(async (off = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset: off });
      if (filters.type) params.set('type', filters.type);
      if (filters.location_id) params.set('location_id', filters.location_id);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const r = await api.get(`/inventory/transactions?${params}`);
      setTransactions(r.data.transactions);
      setTotal(r.data.total);
      setOffset(off);
    } catch {
      setError('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(0); }, [load]);

  const handleSave = () => {
    setShowForm(false);
    load(0);
    onTransaction?.();
  };

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const activeLocations = locations.filter(l => l.active);

  return (
    <div style={s.wrap}>
      {showForm ? (
        <TransactionForm
          isAdmin={isAdmin}
          locations={locations}
          projects={projects}
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <>
          <div style={s.toolbar}>
            {isAdmin && (
              <select style={s.select} value={filters.type} onChange={e => setFilter('type', e.target.value)}>
                <option value="">All Types</option>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            )}
            <select style={s.select} value={filters.location_id} onChange={e => setFilter('location_id', e.target.value)}>
              <option value="">All Locations</option>
              {activeLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <input style={s.dateInput} type="date" value={filters.from} onChange={e => setFilter('from', e.target.value)} title="From date" />
            <input style={s.dateInput} type="date" value={filters.to} onChange={e => setFilter('to', e.target.value)} title="To date" />
            <button
              style={s.addBtn}
              onClick={() => setShowForm(true)}
            >
              {isAdmin ? '+ Log Movement' : '+ Issue Materials'}
            </button>
          </div>

          {error && <div style={s.error}>{error}</div>}

          {loading ? (
            <div style={s.empty}>Loading…</div>
          ) : transactions.length === 0 ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>↔️</div>
              <p>No transactions yet.</p>
            </div>
          ) : (
            <>
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr style={s.thead}>
                      <th style={s.th}>Date</th>
                      <th style={s.th}>Type</th>
                      <th style={s.th}>Item</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Qty</th>
                      <th style={s.th}>From</th>
                      <th style={s.th}>To</th>
                      <th style={s.th}>Project</th>
                      {isAdmin && <th style={s.th}>By</th>}
                      <th style={s.th}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t, i) => {
                      const tc = TYPE_COLORS[t.type] || TYPE_COLORS.adjust;
                      return (
                        <tr key={t.id} style={i % 2 === 0 ? s.rowEven : s.row}>
                          <td style={{ ...s.td, whiteSpace: 'nowrap', color: '#6b7280', fontSize: 12 }}>
                            {new Date(t.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td style={s.td}>
                            <span style={{ ...s.badge, color: tc.color, background: tc.bg }}>{TYPE_LABELS[t.type]}</span>
                          </td>
                          <td style={{ ...s.td, fontWeight: 600 }}>{t.item_name}</td>
                          <td style={{ ...s.td, textAlign: 'right', fontWeight: 700 }}>
                            {parseFloat(t.quantity) % 1 === 0 ? parseInt(t.quantity) : parseFloat(t.quantity).toFixed(2)} {t.unit}
                          </td>
                          <td style={{ ...s.td, color: '#6b7280', fontSize: 13 }}>{t.from_location_name || '—'}</td>
                          <td style={{ ...s.td, color: '#6b7280', fontSize: 13 }}>{t.to_location_name || '—'}</td>
                          <td style={{ ...s.td, fontSize: 13 }}>{t.project_name || '—'}</td>
                          {isAdmin && <td style={{ ...s.td, fontSize: 13 }}>{t.performed_by_name}</td>}
                          <td style={{ ...s.td, color: '#6b7280', fontSize: 13, maxWidth: 200 }}>{t.notes || (t.reference_no ? `Ref: ${t.reference_no}` : '—')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {total > transactions.length + offset && (
                <div style={s.loadMore}>
                  <button style={s.loadMoreBtn} onClick={() => load(offset + LIMIT)}>Load More</button>
                </div>
              )}
              <p style={s.count}>Showing {Math.min(transactions.length, total)} of {total} transactions</p>
            </>
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
  warning:   { background: '#fef3c7', color: '#92400e', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14 },
  row:       { display: 'flex', gap: 12, flexWrap: 'wrap' },
  field:     { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160, marginBottom: 14 },
  label:     { fontSize: 12, fontWeight: 600, color: '#374151' },
  hint:      { fontSize: 11, color: '#9ca3af', fontWeight: 400 },
  input:     { padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, color: '#111827', background: '#fff', width: '100%', boxSizing: 'border-box' },
  binRow:    { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
  binField:  { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 100 },
  actions:   { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 },
  cancelBtn: { padding: '9px 18px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#374151' },
  saveBtn:   { padding: '9px 20px', borderRadius: 8, border: 'none', background: '#92400e', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
};

const s = {
  wrap:        { padding: 16 },
  toolbar:     { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 },
  select:      { padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, background: '#fff', color: '#374151' },
  dateInput:   { padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, color: '#374151', background: '#fff' },
  addBtn:      { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#92400e', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginLeft: 'auto', whiteSpace: 'nowrap' },
  error:       { background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 14 },
  empty:       { textAlign: 'center', padding: '60px 24px', color: '#6b7280', fontSize: 15 },
  emptyIcon:   { fontSize: 40, marginBottom: 12 },
  tableWrap:   { overflowX: 'auto', borderRadius: 10, border: '1px solid #e5e7eb' },
  table:       { width: '100%', borderCollapse: 'collapse', minWidth: 700 },
  thead:       { background: '#f9fafb' },
  th:          { padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '2px solid #e5e7eb' },
  row:         { borderBottom: '1px solid #f3f4f6' },
  rowEven:     { background: '#fafafa', borderBottom: '1px solid #f3f4f6' },
  td:          { padding: '10px 12px', fontSize: 14, color: '#374151' },
  badge:       { display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 },
  loadMore:    { textAlign: 'center', padding: '16px 0' },
  loadMoreBtn: { padding: '8px 20px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  count:       { textAlign: 'center', fontSize: 13, color: '#9ca3af', marginTop: 8 },
};
