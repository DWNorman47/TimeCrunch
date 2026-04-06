import React, { useState, useEffect, useRef } from 'react';
import api from '../../api';
import BinLabelModal from './BinLabelModal';

// ── Level config ──────────────────────────────────────────────────────────────
// Each level knows its API path, its parent's key name, and which parent level feeds it.

const LEVELS = [
  {
    key: 'locations',
    label: 'Locations',
    apiPath: '/inventory/locations',
    parentKey: null,
    parentLevel: null,
    parentLabel: null,
    typeOptions: ['warehouse', 'job_site', 'truck', 'other'],
  },
  {
    key: 'areas',
    label: 'Areas',
    apiPath: '/inventory/setup/areas',
    parentKey: 'location_id',
    parentLevel: 'locations',
    parentLabel: 'Location',
  },
  {
    key: 'racks',
    label: 'Racks',
    apiPath: '/inventory/setup/racks',
    parentKey: 'area_id',
    parentLevel: 'areas',
    parentLabel: 'Area',
  },
  {
    key: 'bays',
    label: 'Bays',
    apiPath: '/inventory/setup/bays',
    parentKey: 'rack_id',
    parentLevel: 'racks',
    parentLabel: 'Rack',
  },
  {
    key: 'compartments',
    label: 'Compartments',
    apiPath: '/inventory/setup/compartments',
    parentKey: 'bay_id',
    parentLevel: 'bays',
    parentLabel: 'Bay',
  },
];

// ── Photo Thumbnail component ─────────────────────────────────────────────────

function PhotoGrid({ photos, onRemove, onAdd, readOnly }) {
  const inputRef = useRef(null);

  const handleFileChange = e => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => onAdd(ev.target.result);
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  return (
    <div style={pg.wrap}>
      {photos.map((url, i) => (
        <div key={i} style={pg.thumb}>
          <img
            src={url}
            alt=""
            style={pg.img}
            onClick={() => window.open(url, '_blank')}
          />
          {!readOnly && (
            <button style={pg.removeBtn} onClick={() => onRemove(i)} title="Remove photo">×</button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button style={pg.addBtn} onClick={() => inputRef.current?.click()} title="Add photo">
          <span style={pg.addIcon}>+</span>
          <span style={pg.addLabel}>Photo</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
}

const pg = {
  wrap:      { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  thumb:     { position: 'relative', width: 80, height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' },
  img:       { width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' },
  removeBtn: { position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 14, lineHeight: '18px', textAlign: 'center', cursor: 'pointer', padding: 0 },
  addBtn:    { width: 80, height: 80, borderRadius: 8, border: '2px dashed #d1d5db', background: '#f9fafb', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 },
  addIcon:   { fontSize: 20, color: '#9ca3af', lineHeight: 1 },
  addLabel:  { fontSize: 11, color: '#9ca3af', fontWeight: 600 },
};

// ── Entity Edit Form ──────────────────────────────────────────────────────────

function EntityForm({ level, item, parentId, parentOptions, onSave, onCancel }) {
  const isLocation = level.key === 'locations';

  const [form, setForm] = useState({
    name:       item?.name       || '',
    notes:      item?.notes      || '',
    address:    item?.address    || '',
    type:       item?.type       || 'warehouse',
    project_id: item?.project_id || '',
    [level.parentKey]: parentId || item?.[level.parentKey] || '',
  });
  const [photos, setPhotos] = useState(item?.photo_urls || []);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async e => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Name is required.');
    if (level.parentKey && !form[level.parentKey]) return setError(`${level.parentLabel} is required.`);
    setSaving(true);
    try {
      const payload = {
        name:       form.name.trim(),
        notes:      form.notes.trim() || null,
        photo_urls: photos,
        ...(isLocation ? { type: form.type, project_id: form.project_id || null, address: form.address.trim() || null } : {}),
        ...(!isLocation && item == null ? { [level.parentKey]: parseInt(form[level.parentKey]) } : {}),
      };
      if (item) {
        await api.patch(`${level.apiPath}/${item.id}`, payload);
      } else {
        await api.post(level.apiPath, payload);
      }
      onSave();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const addPhoto   = url  => setPhotos(p => [...p, url]);
  const removePhoto = idx => setPhotos(p => p.filter((_, i) => i !== idx));

  return (
    <form onSubmit={submit} style={ef.form}>
      <h3 style={ef.title}>{item ? `Edit ${level.label.slice(0,-1)||level.label}` : `Add ${level.label.slice(0,-1)||level.label}`}</h3>
      {error && <div style={ef.error}>{error}</div>}

      {/* Parent selector (only for new items on non-location levels) */}
      {!isLocation && !item && (
        <div style={ef.field}>
          <label style={ef.label}>{level.parentLabel} *</label>
          <select
            style={ef.input}
            value={form[level.parentKey]}
            onChange={e => set(level.parentKey, e.target.value)}
            required
          >
            <option value="">Select {level.parentLabel}…</option>
            {parentOptions.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div style={ef.field}>
        <label style={ef.label}>Name *</label>
        <input
          style={ef.input}
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder={`e.g. ${level.key === 'locations' ? 'Main Warehouse' : level.key === 'areas' ? 'Zone A' : level.key === 'racks' ? 'Rack 3' : level.key === 'bays' ? 'Bay 2' : 'C1'}`}
          required
        />
      </div>

      {isLocation && (
        <>
          <div style={ef.field}>
            <label style={ef.label}>Type</label>
            <select style={ef.input} value={form.type} onChange={e => set('type', e.target.value)}>
              {level.typeOptions.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div style={ef.field}>
            <label style={ef.label}>Address <span style={ef.labelHint}>(optional)</span></label>
            <textarea
              style={{ ...ef.input, minHeight: 56, resize: 'vertical' }}
              value={form.address}
              onChange={e => set('address', e.target.value)}
              placeholder="123 Main St, City, State 12345"
            />
          </div>
        </>
      )}

      <div style={ef.field}>
        <label style={ef.label}>Notes</label>
        <textarea
          style={{ ...ef.input, minHeight: 56, resize: 'vertical' }}
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Optional description or map reference…"
        />
      </div>

      <div style={ef.field}>
        <label style={ef.label}>Photos <span style={ef.labelHint}>(maps, photos of the spot)</span></label>
        <PhotoGrid photos={photos} onAdd={addPhoto} onRemove={removePhoto} />
      </div>

      <div style={ef.actions}>
        <button type="button" style={ef.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" style={ef.saveBtn} disabled={saving}>
          {saving ? 'Saving…' : item ? 'Save Changes' : `Add ${level.label.slice(0,-1)||level.label}`}
        </button>
      </div>
    </form>
  );
}

const ef = {
  form:      { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 16 },
  title:     { fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 20 },
  error:     { background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14 },
  field:     { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 },
  label:     { fontSize: 12, fontWeight: 600, color: '#374151' },
  labelHint: { fontWeight: 400, color: '#9ca3af' },
  input:     { padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, color: '#111827', background: '#fff', width: '100%', boxSizing: 'border-box' },
  actions:   { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 },
  cancelBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#374151' },
  saveBtn:   { padding: '8px 18px', borderRadius: 8, border: 'none', background: '#92400e', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
};

// ── Main Setup Component ───────────────────────────────────────────────────────

export default function InventorySetup({ projects }) {
  const [levelKey,  setLevelKey]  = useState('locations');
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [editing,   setEditing]   = useState(null); // null=list, false=new, obj=edit
  const [printItem, setPrintItem] = useState(null); // item to print label for

  // Parent cascade: store selected IDs for each level so child levels can filter
  const [parentSels, setParentSels] = useState({
    location_id: '',
    area_id:     '',
    rack_id:     '',
    bay_id:      '',
  });
  // Options for each parent dropdown
  const [parentOpts, setParentOpts] = useState({
    locations: [],
    areas:     [],
    racks:     [],
    bays:      [],
  });

  const level = LEVELS.find(l => l.key === levelKey);

  // Load parent options when a parent selection changes
  useEffect(() => {
    const load = async () => {
      // Always keep locations fresh
      const locs = await api.get('/inventory/locations?active=all').catch(() => ({ data: [] }));
      setParentOpts(p => ({ ...p, locations: locs.data }));
    };
    load();
  }, []);

  useEffect(() => {
    if (!parentSels.location_id) {
      setParentOpts(p => ({ ...p, areas: [] }));
      setParentSels(s => ({ ...s, area_id: '', rack_id: '', bay_id: '' }));
      return;
    }
    api.get(`/inventory/setup/areas?active=all&location_id=${parentSels.location_id}`)
      .then(r => setParentOpts(p => ({ ...p, areas: r.data })))
      .catch(() => {});
    setParentSels(s => ({ ...s, area_id: '', rack_id: '', bay_id: '' }));
  }, [parentSels.location_id]);

  useEffect(() => {
    if (!parentSels.area_id) {
      setParentOpts(p => ({ ...p, racks: [] }));
      setParentSels(s => ({ ...s, rack_id: '', bay_id: '' }));
      return;
    }
    api.get(`/inventory/setup/racks?active=all&area_id=${parentSels.area_id}`)
      .then(r => setParentOpts(p => ({ ...p, racks: r.data })))
      .catch(() => {});
    setParentSels(s => ({ ...s, rack_id: '', bay_id: '' }));
  }, [parentSels.area_id]);

  useEffect(() => {
    if (!parentSels.rack_id) {
      setParentOpts(p => ({ ...p, bays: [] }));
      setParentSels(s => ({ ...s, bay_id: '' }));
      return;
    }
    api.get(`/inventory/setup/bays?active=all&rack_id=${parentSels.rack_id}`)
      .then(r => setParentOpts(p => ({ ...p, bays: r.data })))
      .catch(() => {});
    setParentSels(s => ({ ...s, bay_id: '' }));
  }, [parentSels.rack_id]);

  // Load items for current level
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      let url = `${level.apiPath}?active=all`;
      if (level.parentKey) {
        const parentId = parentSels[level.parentKey];
        if (parentId) url += `&${level.parentKey}=${parentId}`;
      }
      const r = await api.get(url);
      setItems(r.data);
    } catch {
      setError('Failed to load.');
    } finally {
      setLoading(false);
    }
  };

  // Reload when level or relevant parent selection changes
  useEffect(() => {
    setEditing(null);
    load();
  }, [levelKey, parentSels.location_id, parentSels.area_id, parentSels.rack_id, parentSels.bay_id]);

  const handleSave = () => {
    setEditing(null);
    load();
  };

  const archive = async item => {
    if (!confirm(`Archive "${item.name}"?`)) return;
    try {
      await api.delete(`${level.apiPath}/${item.id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to archive.');
    }
  };

  const restore = async item => {
    try {
      await api.patch(`${level.apiPath}/${item.id}`, { active: true });
      load();
    } catch { alert('Failed to restore.'); }
  };

  // Which parent option list feeds the "Add new" form's parent selector
  const parentOptionsForForm = () => {
    if (!level.parentLevel) return [];
    return parentOpts[level.parentLevel] || [];
  };

  // Pre-selected parent ID for "Add new" form
  const preselectedParentId = level.parentKey ? parentSels[level.parentKey] : null;

  // Parent filter selects to show above the list
  const parentFilters = () => {
    const filters = [];
    if (['areas','racks','bays','compartments'].includes(levelKey)) {
      filters.push({ label: 'Location', key: 'location_id', options: parentOpts.locations });
    }
    if (['racks','bays','compartments'].includes(levelKey)) {
      filters.push({ label: 'Area', key: 'area_id', options: parentOpts.areas });
    }
    if (['bays','compartments'].includes(levelKey)) {
      filters.push({ label: 'Rack', key: 'rack_id', options: parentOpts.racks });
    }
    if (levelKey === 'compartments') {
      filters.push({ label: 'Bay', key: 'bay_id', options: parentOpts.bays });
    }
    return filters;
  };

  return (
    <div style={s.wrap}>
      {/* Level tabs */}
      <div style={s.levelTabs}>
        {LEVELS.map(l => (
          <button
            key={l.key}
            style={{ ...s.levelTab, ...(l.key === levelKey ? s.levelTabActive : {}) }}
            onClick={() => setLevelKey(l.key)}
          >
            {l.label}
          </button>
        ))}
      </div>

      {/* Parent cascade filters */}
      {parentFilters().length > 0 && (
        <div style={s.filters}>
          {parentFilters().map(f => (
            <div key={f.key} style={s.filterGroup}>
              <label style={s.filterLabel}>{f.label}</label>
              <select
                style={s.filterSelect}
                value={parentSels[f.key]}
                onChange={e => setParentSels(p => ({ ...p, [f.key]: e.target.value }))}
              >
                <option value="">All {f.label}s</option>
                {f.options.map(o => <option key={o.id} value={o.id}>{o.name}{!o.active ? ' (archived)' : ''}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {/* Edit / Add form */}
      {editing !== null && (
        <EntityForm
          level={level}
          item={editing || null}
          parentId={preselectedParentId}
          parentOptions={parentOptionsForForm()}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          projects={projects}
        />
      )}

      {/* List */}
      {editing === null && (
        <>
          <div style={s.toolbar}>
            <span style={s.count}>{items.length} {level.label.toLowerCase()}</span>
            <button style={s.addBtn} onClick={() => setEditing(false)}>
              + Add {level.label.slice(0, -1) || level.label}
            </button>
          </div>

          {error && <div style={s.error}>{error}</div>}

          {loading ? (
            <div style={s.empty}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={s.empty}>
              <div style={s.emptyIcon}>📍</div>
              <p>No {level.label.toLowerCase()} yet.</p>
            </div>
          ) : (
            <div style={s.list}>
              {items.map(item => (
                <div key={item.id} style={{ ...s.card, opacity: item.active ? 1 : 0.55 }}>
                  <div style={s.cardMain}>
                    <div style={s.cardInfo}>
                      <div style={s.cardName}>{item.name}</div>
                      {item.parent_name && (
                        <div style={s.cardParent}>in {item.parent_name}</div>
                      )}
                      {item.address && <div style={s.cardAddress}>{item.address}</div>}
                      {item.notes && <div style={s.cardNotes}>{item.notes}</div>}
                    </div>
                    <div style={s.cardRight}>
                      {item.photo_urls?.length > 0 && (
                        <div style={s.photoRow}>
                          {item.photo_urls.slice(0, 3).map((url, i) => (
                            <img
                              key={i}
                              src={url}
                              alt=""
                              style={s.thumbSmall}
                              onClick={() => window.open(url, '_blank')}
                            />
                          ))}
                          {item.photo_urls.length > 3 && (
                            <span style={s.morePhotos}>+{item.photo_urls.length - 3}</span>
                          )}
                        </div>
                      )}
                      <div style={s.cardActions}>
                        {!item.active
                          ? <span style={{ ...s.badge, color: '#9ca3af', background: '#f3f4f6' }}>Archived</span>
                          : <span style={{ ...s.badge, color: '#059669', background: '#d1fae5' }}>Active</span>
                        }
                        {item.active ? (
                          <>
                            {level.key !== 'locations' && (
                              <button style={s.iconBtn} onClick={() => setPrintItem(item)} title="Print QR Label">🏷</button>
                            )}
                            <button style={s.iconBtn} onClick={() => setEditing(item)} title="Edit">✏️</button>
                            <button style={s.iconBtn} onClick={() => archive(item)} title="Archive">🗄️</button>
                          </>
                        ) : (
                          <button style={s.iconBtn} onClick={() => restore(item)} title="Restore">↩️</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {printItem && (
        <BinLabelModal
          item={printItem}
          binType={level.key.slice(0, -1)} // 'areas' → 'area'
          onClose={() => setPrintItem(null)}
        />
      )}
    </div>
  );
}

const s = {
  wrap:          { padding: 16 },
  levelTabs:     { display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' },
  levelTab:      { padding: '7px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 13, fontWeight: 600, color: '#6b7280', cursor: 'pointer' },
  levelTabActive:{ background: '#92400e', color: '#fff', borderColor: '#92400e' },
  filters:       { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px' },
  filterGroup:   { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 150 },
  filterLabel:   { fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' },
  filterSelect:  { padding: '6px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', color: '#374151' },
  toolbar:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  count:         { fontSize: 13, color: '#6b7280' },
  addBtn:        { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#92400e', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  error:         { background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '10px 16px', marginBottom: 12, fontSize: 14 },
  empty:         { textAlign: 'center', padding: '48px 24px', color: '#6b7280', fontSize: 15 },
  emptyIcon:     { fontSize: 36, marginBottom: 10 },
  list:          { display: 'flex', flexDirection: 'column', gap: 8 },
  card:          { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' },
  cardMain:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  cardInfo:      { flex: 1, minWidth: 0 },
  cardName:      { fontSize: 15, fontWeight: 700, color: '#111827' },
  cardParent:    { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  cardAddress:   { fontSize: 12, color: '#6b7280', marginTop: 3, fontStyle: 'italic' },
  cardNotes:     { fontSize: 13, color: '#6b7280', marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  cardRight:     { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 },
  photoRow:      { display: 'flex', gap: 4, alignItems: 'center' },
  thumbSmall:    { width: 40, height: 40, borderRadius: 6, objectFit: 'cover', cursor: 'pointer', border: '1px solid #e5e7eb' },
  morePhotos:    { fontSize: 12, color: '#6b7280', fontWeight: 600 },
  cardActions:   { display: 'flex', alignItems: 'center', gap: 4 },
  badge:         { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 },
  iconBtn:       { background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: '2px 3px' },
};
