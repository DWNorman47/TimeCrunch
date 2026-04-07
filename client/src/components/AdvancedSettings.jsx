import React, { useState, useEffect } from 'react';
import api from '../api';

const DEFAULT_CATEGORIES = ['Fuel', 'Tools & Equipment', 'Supplies', 'Meals', 'Travel', 'Lodging', 'Parking', 'Other'];

function CategorySection({ cfg, onSave, saving }) {
  const [suppressed, setSuppressed] = useState(cfg.suppressed || []);
  const [custom, setCustom]         = useState(cfg.custom || []);
  const [newCat, setNewCat]         = useState('');
  const [dirty, setDirty]           = useState(false);

  useEffect(() => {
    setSuppressed(cfg.suppressed || []);
    setCustom(cfg.custom || []);
    setDirty(false);
  }, [cfg]);

  const toggleDefault = cat => {
    setSuppressed(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
    setDirty(true);
  };

  const addCustom = () => {
    const trimmed = newCat.trim();
    if (!trimmed || custom.includes(trimmed) || DEFAULT_CATEGORIES.includes(trimmed)) return;
    setCustom(prev => [...prev, trimmed]);
    setNewCat('');
    setDirty(true);
  };

  const removeCustom = cat => {
    setCustom(prev => prev.filter(c => c !== cat));
    setDirty(true);
  };

  return (
    <div style={s.catSection}>
      <div style={s.catLabel}>Default Categories</div>
      <div style={s.catList}>
        {DEFAULT_CATEGORIES.map(cat => {
          const active = !suppressed.includes(cat);
          return (
            <div key={cat} style={s.catRow}>
              <span style={{ ...s.catName, color: active ? '#111827' : '#9ca3af', textDecoration: active ? 'none' : 'line-through' }}>
                {cat}
              </span>
              <button
                style={{ ...s.toggleBtn, background: active ? '#d1fae5' : '#f3f4f6', color: active ? '#065f46' : '#6b7280' }}
                onClick={() => toggleDefault(cat)}
              >
                {active ? 'Active' : 'Hidden'}
              </button>
            </div>
          );
        })}
      </div>

      {custom.length > 0 && (
        <>
          <div style={{ ...s.catLabel, marginTop: 12 }}>Custom Categories</div>
          <div style={s.catList}>
            {custom.map(cat => (
              <div key={cat} style={s.catRow}>
                <span style={s.catName}>{cat}</span>
                <button style={s.removeBtn} onClick={() => removeCustom(cat)}>Remove</button>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={s.addRow}>
        <input
          style={s.addInput}
          type="text"
          placeholder="Add custom category…"
          value={newCat}
          onChange={e => setNewCat(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCustom()}
          maxLength={60}
        />
        <button style={s.addBtn} onClick={addCustom} disabled={!newCat.trim()}>Add</button>
      </div>

      {dirty && (
        <button
          style={s.saveBtn}
          onClick={() => onSave({ suppressed, custom })}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      )}
    </div>
  );
}

function CollapsibleCategory({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={s.innerSection}>
      <button style={s.innerToggle} onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        <span style={s.chevron}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={s.innerBody}>{children}</div>}
    </div>
  );
}

export default function AdvancedSettings() {
  const [open, setOpen]           = useState(false);
  const [config, setConfig]       = useState(null);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

  useEffect(() => {
    if (open && !config) {
      api.get('/admin/advanced-settings')
        .then(r => setConfig(r.data))
        .catch(() => setError('Failed to load advanced settings'));
    }
  }, [open, config]);

  const makeSaver = key => async ({ suppressed, custom }) => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const r = await api.patch(`/admin/advanced-settings/${key}`, { suppressed, custom });
      setConfig(r.data);
      setSuccess('Saved.');
      setTimeout(() => setSuccess(''), 2000);
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.wrap}>
      <button style={s.mainToggle} onClick={() => setOpen(o => !o)}>
        <span style={s.mainToggleLabel}>Advanced Settings</span>
        <span style={s.chevron}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={s.body}>
          {error && <div style={s.errorMsg}>{error}</div>}
          {success && <div style={s.successMsg}>{success}</div>}
          {!config ? (
            <div style={s.loading}>Loading…</div>
          ) : (
            <>
              <CollapsibleCategory title="Reimbursement Categories">
                <CategorySection
                  cfg={config.reimbursement_categories}
                  onSave={makeSaver('reimbursement_categories')}
                  saving={saving}
                />
              </CollapsibleCategory>
              <CollapsibleCategory title="Item Units">
                <CategorySection
                  cfg={config.item_units}
                  onSave={makeSaver('item_units')}
                  saving={saving}
                />
              </CollapsibleCategory>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  wrap:          { marginTop: 32, borderTop: '1px solid #e5e7eb', paddingTop: 16 },
  mainToggle:    { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', textAlign: 'left' },
  mainToggleLabel: { fontSize: 15, fontWeight: 700, color: '#374151' },
  chevron:       { fontSize: 12, color: '#9ca3af' },
  body:          { marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  loading:       { fontSize: 14, color: '#9ca3af' },
  innerSection:  { border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' },
  innerToggle:   { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb', border: 'none', cursor: 'pointer', padding: '10px 14px', textAlign: 'left', fontSize: 14, fontWeight: 600, color: '#374151' },
  innerBody:     { padding: '14px 16px' },
  catSection:    { display: 'flex', flexDirection: 'column', gap: 6 },
  catLabel:      { fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
  catList:       { display: 'flex', flexDirection: 'column', gap: 4 },
  catRow:        { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', background: '#f9fafb', borderRadius: 6 },
  catName:       { fontSize: 14, color: '#111827' },
  toggleBtn:     { fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' },
  removeBtn:     { fontSize: 11, fontWeight: 600, background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' },
  addRow:        { display: 'flex', gap: 8, marginTop: 8 },
  addInput:      { flex: 1, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14 },
  addBtn:        { padding: '7px 16px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  saveBtn:       { marginTop: 10, padding: '8px 20px', background: '#059669', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start' },
  errorMsg:      { color: '#dc2626', fontSize: 13 },
  successMsg:    { color: '#059669', fontSize: 13, fontWeight: 600 },
};
