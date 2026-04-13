import React, { useState, useEffect } from 'react';
import api from '../api';
import { useT } from '../hooks/useT';
import { silentError } from '../errorReporter';

/**
 * Self-contained editor for the mileage reimbursement rate.
 * Owns its own fetch and save to /admin/advanced-settings/mileage_rate.
 * Used in Company > Settings > Reimbursements section.
 */
export default function MileageRateEditor() {
  const t = useT();
  const [cfg, setCfg] = useState(null);
  const [rate, setRate] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api.get('/admin/advanced-settings')
      .then(r => {
        const m = r.data?.mileage_rate;
        setCfg(m);
        setRate(String(m?.rate ?? 0.67));
      })
      .catch(err => { setError(t.advSettingsLoadFailed || 'Failed to load'); silentError('mileage rate load')(err); });
  }, []);

  const save = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const r = await api.patch('/admin/advanced-settings/mileage_rate', { rate });
      setCfg(r.data?.mileage_rate || { rate: parseFloat(rate) });
      setDirty(false);
      setSuccess(t.advSettingsSaved || 'Saved');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(t.advSettingsFailed || 'Save failed');
      silentError('mileage rate save')(err);
    } finally {
      setSaving(false);
    }
  };

  if (!cfg && !error) return <div style={styles.loading}>{t.advSettingsLoading || 'Loading…'}</div>;

  return (
    <div>
      <div style={styles.label}>{t.mileageRateSection || 'Mileage reimbursement rate'}</div>
      <div style={styles.row}>
        <span style={styles.prefix}>$</span>
        <input
          style={styles.input}
          type="number"
          min="0"
          max="10"
          step="0.001"
          value={rate}
          onChange={e => { setRate(e.target.value); setDirty(true); }}
        />
        <span style={styles.suffix}>{t.mileageRateHint || '/ mile'}</span>
      </div>
      {error && <div role="alert" style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>{success}</div>}
      {dirty && (
        <button
          type="button"
          style={{ ...styles.saveBtn, ...(saving ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }}
          onClick={save}
          disabled={saving}
        >
          {saving ? (t.saving || 'Saving…') : (t.saveRate || 'Save')}
        </button>
      )}
    </div>
  );
}

const styles = {
  label: { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 },
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  prefix: { fontSize: 14, color: '#374151', fontWeight: 600 },
  suffix: { fontSize: 13, color: '#6b7280' },
  input: { width: 110, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14 },
  saveBtn: { marginTop: 12, padding: '8px 18px', background: '#059669', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  loading: { fontSize: 14, color: '#6b7280' },
  error: { background: '#fee2e2', color: '#dc2626', borderRadius: 7, padding: '8px 12px', fontSize: 13, marginTop: 10 },
  success: { color: '#059669', fontSize: 13, fontWeight: 600, marginTop: 8 },
};
