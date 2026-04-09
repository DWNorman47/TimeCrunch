import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';
import UomConversionModal from './UomConversionModal';
import { useT } from '../../hooks/useT';
const TYPE_COLORS = {
  receive:  { color: '#059669', bg: '#d1fae5' },
  issue:    { color: '#d97706', bg: '#fef3c7' },
  transfer: { color: '#2563eb', bg: '#dbeafe' },
  adjust:   { color: '#6b7280', bg: '#f3f4f6' },
  convert:  { color: '#8b5cf6', bg: '#ede9fe' },
};

function TransactionForm({ isAdmin, locations, projects, onSave, onCancel, onConversionSaved }) {
  const t = useT();
  const TYPE_LABELS = {
    receive:  t.invTxTypeReceive,
    issue:    t.invTxTypeIssue,
    transfer: t.invTxTypeTransfer,
    adjust:   t.invTxTypeAdjust,
    convert:  t.invTxTypeConvert,
  };
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [locationStock, setLocationStock] = useState(null); // { quantity, unit, uom_id } at from_location
  const [conversionPrompt, setConversionPrompt] = useState(null); // { uom, baseUnit, field }
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
    supplier_id: '',
    lot_number: '',
  });
  const [itemUoms, setItemUoms] = useState([]);
  // Cascading bin options for the destination location
  const [binOpts, setBinOpts] = useState({ areas: [], racks: [], bays: [], compartments: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  useEffect(() => {
    api.get('/inventory/items?active=true').then(r => setItems(r.data)).catch(() => {});
    if (isAdmin) api.get('/inventory/suppliers').then(r => setSuppliers(r.data)).catch(() => {});
  }, [isAdmin]);

  // Load UOMs when item changes
  useEffect(() => {
    setItemUoms([]);
    set('uom_id', ''); set('to_uom_id', ''); set('to_quantity', '');
    setLocationStock(null);
    if (!form.item_id) return;
    api.get(`/inventory/items/${form.item_id}/uoms`)
      .then(r => setItemUoms(r.data.filter(u => u.active)))
      .catch(() => {});
  }, [form.item_id]);

  // Prompt for conversion factor when admin selects a non-base UOM with factor=1
  const checkConversionNeeded = (uomId, field) => {
    if (!isAdmin || !uomId || !form.item_id) return;
    const uom = itemUoms.find(u => String(u.id) === String(uomId));
    if (uom && !uom.is_base && parseFloat(uom.factor) === 1) {
      const baseUom  = itemUoms.find(u => u.is_base);
      const baseUnit = baseUom
        ? `${baseUom.unit}${baseUom.unit_spec ? ` (${baseUom.unit_spec})` : ''}`
        : items.find(i => String(i.id) === form.item_id)?.unit || 'base unit';
      setConversionPrompt({ uom, baseUnit, field });
    }
  };

  useEffect(() => { checkConversionNeeded(form.uom_id, 'uom_id'); }, [form.uom_id]);
  useEffect(() => { checkConversionNeeded(form.to_uom_id, 'to_uom_id'); }, [form.to_uom_id]);

  // Load current stock at from_location when item + location both set (for issue/transfer)
  useEffect(() => {
    setLocationStock(null);
    const locId = form.from_location_id;
    if (!form.item_id || !locId || !['issue', 'transfer', 'convert'].includes(form.type)) return;
    api.get(`/inventory/stock?location_id=${locId}`)
      .then(r => {
        const row = (r.data.stock || r.data).find(s => String(s.item_id) === String(form.item_id));
        setLocationStock(row || null);
      })
      .catch(() => {});
  }, [form.item_id, form.from_location_id, form.type]);

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
    if (!form.item_id) return setError(t.invTxSelectItemErr);
    const qty = parseFloat(form.quantity);
    if (!form.quantity || isNaN(qty) || qty === 0) return setError(t.invTxNonZeroErr);
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
        supplier_id: form.supplier_id ? parseInt(form.supplier_id) : undefined,
        lot_number: form.lot_number || undefined,
      };
      const r = await api.post('/inventory/transactions', payload);
      if (r.data.warning === 'stock_negative') {
        setWarning(t.invTxStockNegativeWarn);
      }
      onSave();
    } catch (err) {
      setError(err.response?.data?.error || t.invTxFailedSave);
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
      <h3 style={f.title}>{t.invTxLogMovement}</h3>
      {error   && <div style={f.error}>{error}</div>}
      {warning && <div style={f.warning}>{warning}</div>}

      {isAdmin && (
        <div style={f.field}>
          <label style={f.label}>{t.invTxTypeLabel}</label>
          <select style={f.input} value={form.type} onChange={e => set('type', e.target.value)}>
            <option value="receive">{t.invTxTypeReceiveDesc}</option>
            <option value="issue">{t.invTxTypeIssueDesc}</option>
            <option value="transfer">{t.invTxTypeTransferDesc}</option>
            <option value="adjust">{t.invTxTypeAdjustDesc}</option>
            <option value="convert">{t.invTxTypeConvertDesc}</option>
          </select>
        </div>
      )}

      <div style={f.row}>
        <div style={f.field}>
          <label style={f.label}>{t.invTxColItem} *</label>
          <select style={f.input} value={form.item_id} onChange={e => {
            const item = items.find(i => String(i.id) === e.target.value);
            set('item_id', e.target.value);
            if (item?.unit_cost) set('unit_cost', String(item.unit_cost));
          }}>
            <option value="">{t.invTxSelectItem}</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.name}{i.sku ? ` (${i.sku})` : ''}</option>)}
          </select>
        </div>
        {itemUoms.length > 0 && (
          <div style={f.field}>
            <label style={f.label}>{isConvert ? t.invTxConvertFrom : t.invTxUomLabel}</label>
            <select style={f.input} value={form.uom_id} onChange={e => set('uom_id', e.target.value)}>
              <option value="">{t.invTxDefaultUnit}</option>
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
            {t.quantity} *
            {form.type === 'adjust' && <span style={f.hint}> {t.invTxAdjHint}</span>}
            {isConvert && <span style={f.hint}> {t.invTxConvertHint}</span>}
          </label>
          <input
            style={f.input} type="number" step="any"
            min={form.type === 'adjust' ? undefined : 0}
            value={form.quantity} onChange={e => set('quantity', e.target.value)}
            placeholder={form.type === 'adjust' ? '±qty' : 'qty'}
          />
        </div>
      </div>

      {isConvert && (
        <div style={f.row}>
          <div style={f.field}>
            <label style={f.label}>{t.invTxConvertToUom}</label>
            <select style={f.input} value={form.to_uom_id} onChange={e => set('to_uom_id', e.target.value)}>
              <option value="">{t.invTxSelectTargetUom}</option>
              {itemUoms.filter(u => String(u.id) !== form.uom_id).map(u => (
                <option key={u.id} value={u.id}>
                  {u.unit}{u.unit_spec ? ` (${u.unit_spec})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div style={f.field}>
            <label style={f.label}>
              {t.invTxResultingQty}
              {suggestedToQty && <span style={f.hint}> — {t.invTxSuggested} {suggestedToQty}</span>}
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
          <label style={f.label}>{t.invTxFromLoc}</label>
          <select style={f.input} value={form.from_location_id} onChange={e => set('from_location_id', e.target.value)}>
            <option value="">{t.invCycSelectLocation}</option>
            {activeLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {locationStock && (() => {
            const qty = parseFloat(locationStock.quantity);
            const stockUnit = locationStock.uom_unit
              ? `${locationStock.uom_unit}${locationStock.uom_spec ? ` (${locationStock.uom_spec})` : ''}`
              : locationStock.unit;
            return (
              <div style={f.stockHint}>
                {t.invTxOnHand} <strong>{qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(2)} {stockUnit}</strong>
                {locationStock.uom_unit && locationStock.unit !== locationStock.uom_unit && (
                  <span style={{ color: '#6b7280' }}> {t.invTxSysConverts}</span>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {(showTo || showToAdj) && (
        <>
          <div style={f.field}>
            <label style={f.label}>{showToAdj ? t.invTxLocOnly : t.invTxToLoc}</label>
            <select style={f.input} value={form.to_location_id} onChange={e => set('to_location_id', e.target.value)}>
              <option value="">{t.invCycSelectLocation}</option>
              {activeLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {binOpts.areas.length > 0 && (
            <div style={f.binRow}>
              <div style={f.binField}>
                <label style={f.label}>{t.binLabelArea}</label>
                <select style={f.input} value={form.area_id} onChange={e => set('area_id', e.target.value)}>
                  <option value="">{t.none}</option>
                  {binOpts.areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              {form.area_id && binOpts.racks.length > 0 && (
                <div style={f.binField}>
                  <label style={f.label}>{t.binLabelRack}</label>
                  <select style={f.input} value={form.rack_id} onChange={e => set('rack_id', e.target.value)}>
                    <option value="">{t.none}</option>
                    {binOpts.racks.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              )}
              {form.rack_id && binOpts.bays.length > 0 && (
                <div style={f.binField}>
                  <label style={f.label}>{t.binLabelBay}</label>
                  <select style={f.input} value={form.bay_id} onChange={e => set('bay_id', e.target.value)}>
                    <option value="">{t.none}</option>
                    {binOpts.bays.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              {form.bay_id && binOpts.compartments.length > 0 && (
                <div style={f.binField}>
                  <label style={f.label}>{t.binLabelCompartment}</label>
                  <select style={f.input} value={form.compartment_id} onChange={e => set('compartment_id', e.target.value)}>
                    <option value="">{t.none}</option>
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
          <label style={f.label}>{t.project}</label>
          <select style={f.input} value={form.project_id} onChange={e => set('project_id', e.target.value)}>
            <option value="">{t.none}</option>
            {projects.filter(p => p.active !== false).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      {isAdmin && (
        <>
          <div style={f.row}>
            <div style={f.field}>
              <label style={f.label}>{t.invTxUnitCost}</label>
              <input style={f.input} type="number" min="0" step="0.01" value={form.unit_cost} onChange={e => set('unit_cost', e.target.value)} placeholder={t.optional} />
            </div>
            <div style={f.field}>
              <label style={f.label}>{t.invTxRefPO}</label>
              <input style={f.input} maxLength={100} value={form.reference_no} onChange={e => set('reference_no', e.target.value)} placeholder={t.optional} />
            </div>
          </div>
          <div style={f.row}>
            {form.type === 'receive' && suppliers.length > 0 && (
              <div style={f.field}>
                <label style={f.label}>{t.invPOSupplier}</label>
                <select style={f.input} value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
                  <option value="">{t.none}</option>
                  {suppliers.map(sup => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
                </select>
              </div>
            )}
            {(form.type === 'receive' || form.type === 'adjust') && (
              <div style={f.field}>
                <label style={f.label}>{t.invTxLotBatch}</label>
                <input style={f.input} value={form.lot_number} onChange={e => set('lot_number', e.target.value)} placeholder={t.optional} />
              </div>
            )}
          </div>
        </>
      )}

      <div style={f.field}>
        <label style={f.label}>{t.notes}</label>
        <textarea style={{ ...f.input, minHeight: 60, resize: 'vertical' }} maxLength={1000} value={form.notes} onChange={e => set('notes', e.target.value)} />
      </div>

      <div style={f.actions}>
        <button type="button" style={f.cancelBtn} onClick={onCancel}>{t.cancel}</button>
        <button type="submit" style={f.saveBtn} disabled={saving}>{saving ? t.saving : t.invTxLogTx}</button>
      </div>

      {conversionPrompt && (
        <UomConversionModal
          itemId={form.item_id}
          uom={conversionPrompt.uom}
          baseUnit={conversionPrompt.baseUnit}
          onSaved={updatedList => {
            setItemUoms(updatedList.filter(u => u.active));
            setConversionPrompt(null);
            onConversionSaved?.();
          }}
          onDismiss={() => setConversionPrompt(null)}
        />
      )}
    </form>
  );
}

export default function InventoryTransactions({ isAdmin, locations, projects, onTransaction, onConversionSaved }) {
  const t = useT();
  const TYPE_LABELS = {
    receive:  t.invTxTypeReceive,
    issue:    t.invTxTypeIssue,
    transfer: t.invTxTypeTransfer,
    adjust:   t.invTxTypeAdjust,
    convert:  t.invTxTypeConvert,
  };
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({ type: '', location_id: '', from: '', to: '', supplier_id: '', lot_number: '' });
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    if (isAdmin) api.get('/inventory/suppliers').then(r => setSuppliers(r.data)).catch(() => {});
  }, [isAdmin]);
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
      if (filters.supplier_id) params.set('supplier_id', filters.supplier_id);
      if (filters.lot_number) params.set('lot_number', filters.lot_number);
      const r = await api.get(`/inventory/transactions?${params}`);
      setTransactions(r.data.transactions);
      setTotal(r.data.total);
      setOffset(off);
    } catch {
      setError(t.invTxFailedLoad);
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
          onConversionSaved={onConversionSaved}
        />
      ) : (
        <>
          <div style={s.toolbar}>
            {isAdmin && (
              <select style={s.select} value={filters.type} onChange={e => setFilter('type', e.target.value)}>
                <option value="">{t.invTxAllTypes}</option>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            )}
            <select style={s.select} value={filters.location_id} onChange={e => setFilter('location_id', e.target.value)}>
              <option value="">{t.invCycAllLocations}</option>
              {activeLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <div style={s.dateWrap}>
              <span style={s.dateLabel}>{t.invTxColFrom}</span>
              <input style={s.dateInput} type="date" value={filters.from} onChange={e => setFilter('from', e.target.value)} />
            </div>
            <div style={s.dateWrap}>
              <span style={s.dateLabel}>{t.invTxColTo}</span>
              <input style={s.dateInput} type="date" value={filters.to} onChange={e => setFilter('to', e.target.value)} />
            </div>
            {(filters.from || filters.to) && (
              <button style={s.clearDates} onClick={() => setFilters(f => ({ ...f, from: '', to: '' }))} title="Clear date range">{t.invTxClearDates}</button>
            )}
            {isAdmin && suppliers.length > 0 && (
              <select style={s.select} value={filters.supplier_id} onChange={e => setFilter('supplier_id', e.target.value)}>
                <option value="">{t.invTxAllSuppliers}</option>
                {suppliers.map(sup => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
              </select>
            )}
            {isAdmin && (
              <input
                style={{ ...s.dateInput, minWidth: 120 }}
                type="text"
                placeholder={t.invTxLotFilter}
                value={filters.lot_number}
                onChange={e => setFilter('lot_number', e.target.value)}
              />
            )}
            <button
              style={s.addBtn}
              onClick={() => setShowForm(true)}
            >
              {isAdmin ? t.invTxLogMovementBtn : t.invTxIssueMaterialsBtn}
            </button>
          </div>

          {error && <div style={s.error}>{error}</div>}

          {loading ? (
            <div style={s.empty}>{t.loading}</div>
          ) : transactions.length === 0 ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>↔️</div>
              <p>{t.invTxNoTx}</p>
            </div>
          ) : (
            <>
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr style={s.thead}>
                      <th style={s.th}>{t.invTxColDate}</th>
                      <th style={s.th}>{t.invTxColType}</th>
                      <th style={s.th}>{t.invTxColItem}</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>{t.invTxColQty}</th>
                      <th style={s.th}>{t.invTxColFrom}</th>
                      <th style={s.th}>{t.invTxColTo}</th>
                      <th style={s.th}>{t.project}</th>
                      {isAdmin && <th style={s.th}>{t.invTxColSupplier}</th>}
                      {isAdmin && <th style={s.th}>{t.invTxColLot}</th>}
                      {isAdmin && <th style={s.th}>{t.invTxColBy}</th>}
                      <th style={s.th}>{t.notes}</th>
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
                          {isAdmin && <td style={{ ...s.td, fontSize: 13, color: '#6b7280' }}>{t.supplier_name || '—'}</td>}
                          {isAdmin && <td style={{ ...s.td, fontSize: 12, fontFamily: 'monospace', color: t.lot_number ? '#374151' : '#9ca3af' }}>{t.lot_number || '—'}</td>}
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
                  <button style={s.loadMoreBtn} onClick={() => load(offset + LIMIT)}>{t.invTxLoadMore}</button>
                </div>
              )}
              <p style={s.count}>{t.invTxShowing.replace('{n}', Math.min(transactions.length, total)).replace('{total}', total)}</p>
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
  stockHint: { marginTop: 5, fontSize: 12, color: '#374151', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '5px 10px' },
};

const s = {
  wrap:        { padding: 16 },
  toolbar:     { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 },
  select:      { padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, background: '#fff', color: '#374151' },
  dateWrap:    { display: 'flex', alignItems: 'center', gap: 5 },
  dateLabel:   { fontSize: 12, fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap' },
  dateInput:   { padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, color: '#374151', background: '#fff' },
  clearDates:  { padding: '7px 11px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' },
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
