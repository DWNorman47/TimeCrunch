import React, { useState } from 'react';
import api from '../../api';
import { useT } from '../../hooks/useT';

/**
 * Shown when a non-base UOM with factor=1 is selected, prompting the admin
 * to define the conversion rate before continuing.
 *
 * Props:
 *   itemId    — inventory_items.id
 *   uom       — { id, unit, unit_spec, factor, is_base }
 *   baseUnit  — display string for the base unit (e.g. "each")
 *   onSaved   — (updatedUomList) => void   called after successful PATCH
 *   onDismiss — () => void                 called when user skips
 */
export default function UomConversionModal({ itemId, uom, baseUnit, onSaved, onDismiss }) {
  const t = useT();
  const [factor, setFactor] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const uomLabel = uom.unit + (uom.unit_spec ? ` (${uom.unit_spec})` : '');

  const save = async () => {
    const n = parseFloat(factor);
    if (!factor || isNaN(n) || n <= 0) { setError(t.uomConvEnterPositive); return; }
    setSaving(true); setError('');
    try {
      const r = await api.patch(`/inventory/items/${itemId}/uoms/${uom.id}`, { factor: n });
      onSaved(r.data); // server returns updated full UOM list
    } catch (err) {
      setError(err.response?.data?.error || t.uomConvFailed);
      setSaving(false);
    }
  };

  return (
    <div style={m.overlay} onClick={onDismiss}>
      <div style={m.modal} onClick={e => e.stopPropagation()}>
        <div style={m.header}>
          <div style={m.title}>{t.uomConvTitle}</div>
          <button style={m.close} aria-label="Close" onClick={onDismiss}>✕</button>
        </div>
        <div style={m.body}>
          <p style={m.desc}>
            {t.uomConvDescPre} <strong>{uomLabel}</strong>.{' '}
            {t.uomConvDescHow} <strong>{baseUnit}</strong> {t.uomConvDescAreIn} <strong>{uomLabel}</strong>?
          </p>
          <p style={m.sub}>{t.uomConvExample}</p>
          {error && <div style={m.error}>{error}</div>}
          <div style={m.inputRow}>
            <span style={m.eq}>1&nbsp;{uomLabel}&nbsp;=</span>
            <input
              type="number"
              min="0.0001"
              step="any"
              placeholder={t.uomConvFactorPlaceholder}
              value={factor}
              onChange={e => setFactor(e.target.value)}
              style={m.input}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') save(); }}
            />
            <span style={m.eq}>&nbsp;{baseUnit}</span>
          </div>
          <div style={m.actions}>
            <button style={m.skipBtn} onClick={onDismiss}>{t.uomConvSkip}</button>
            <button style={{ ...m.saveBtn, ...(saving ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }} onClick={save} disabled={saving}>
              {saving ? t.saving : t.uomConvSave}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const m = {
  overlay:  { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:    { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' },
  header:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px 14px', borderBottom: '1px solid #e5e7eb' },
  title:    { fontSize: 15, fontWeight: 700, color: '#111827' },
  close:    { background: 'none', border: 'none', fontSize: 18, color: '#6b7280', cursor: 'pointer' },
  body:     { padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 },
  desc:     { fontSize: 14, color: '#374151', margin: 0, lineHeight: 1.5 },
  sub:      { fontSize: 12, color: '#9ca3af', margin: 0 },
  error:    { background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '8px 12px', fontSize: 13 },
  inputRow: { display: 'flex', alignItems: 'center', gap: 8 },
  eq:       { fontSize: 14, color: '#374151', whiteSpace: 'nowrap', fontWeight: 600 },
  input:    { flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 15, fontWeight: 700, textAlign: 'center' },
  actions:  { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 },
  skipBtn:  { padding: '9px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#6b7280' },
  saveBtn:  { padding: '9px 18px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
};
