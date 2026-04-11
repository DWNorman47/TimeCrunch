import React, { useState, useEffect } from 'react';
import api from '../api';
import { useT } from '../hooks/useT';
import { useToast } from '../contexts/ToastContext';
import { SkeletonList } from './Skeleton';

function fmt(dateStr) {
  return new Date(dateStr.substring(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function defaultPeriod() {
  const today = new Date();
  const day = today.getDay(); // 0=Sun
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - day);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const toISO = d => d.toLocaleDateString('en-CA');
  return { from: toISO(startOfWeek), to: toISO(endOfWeek) };
}

export default function ManagePayPeriods() {
  const t = useT();
  const toast = useToast();
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ from: defaultPeriod().from, to: defaultPeriod().to, label: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [unlocking, setUnlocking] = useState(null);

  useEffect(() => {
    api.get('/admin/pay-periods')
      .then(r => setPeriods(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const lock = async e => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const r = await api.post('/admin/pay-periods', {
        period_start: form.from, period_end: form.to, label: form.label || undefined,
      });
      setPeriods(prev => [r.data, ...prev]);
      const next = defaultPeriod();
      setForm({ from: next.from, to: next.to, label: '' });
      toast('Pay period locked', 'success');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to lock period');
    } finally { setSaving(false); }
  };

  const unlock = async id => {
    setUnlocking(id);
    try {
      await api.delete(`/admin/pay-periods/${id}`);
      setPeriods(prev => prev.filter(p => p.id !== id));
      toast('Pay period unlocked', 'success');
    } catch {
      toast('Failed to unlock pay period', 'error');
    } finally { setUnlocking(null); }
  };

  return (
    <div style={styles.card}>
      <h3 style={styles.title}>{t.payPeriodLock}</h3>
      <p style={styles.desc}>{t.payPeriodLockDesc}</p>

      <form onSubmit={lock} style={styles.form}>
        <div style={styles.formRow}>
          <div style={styles.field}>
            <label style={styles.label}>{t.from}</label>
            <input style={styles.input} type="date" value={form.from} onChange={e => setForm(f => ({ ...f, from: e.target.value }))} required />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>{t.to}</label>
            <input style={styles.input} type="date" value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} required />
          </div>
          <div style={{ ...styles.field, flex: 2 }}>
            <label style={styles.label}>{t.labelOptional}</label>
            <input style={styles.input} type="text" maxLength={100} value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder={t.periodLabelExample} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>&nbsp;</label>
            <button style={{ ...styles.lockBtn, ...(saving ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }} type="submit" disabled={saving}>
              {saving ? t.locking : t.lockPeriod}
            </button>
          </div>
        </div>
        {error && <p style={styles.error}>{error}</p>}
      </form>

      {loading ? <SkeletonList count={3} rows={1} /> : periods.length === 0 ? (
        <p style={styles.empty}>{t.noLockedPeriods}</p>
      ) : (
        <div style={styles.list}>
          {periods.map(p => (
            <div key={p.id} style={styles.row}>
              <div style={styles.lockIcon}>🔒</div>
              <div style={styles.periodInfo}>
                <div style={styles.periodLabel}>{p.label || `${fmt(p.period_start)} – ${fmt(p.period_end)}`}</div>
                {p.label && <div style={styles.periodDates}>{fmt(p.period_start)} – {fmt(p.period_end)}</div>}
                <div style={styles.periodMeta}>Locked by {p.locked_by_name} · {new Date(p.created_at).toLocaleDateString()}</div>
              </div>
              <button
                style={{ ...styles.unlockBtn, ...(unlocking === p.id ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }}
                onClick={() => unlock(p.id)}
                disabled={unlocking === p.id}
              >
                {unlocking === p.id ? t.saving : t.unlock}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  card: { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 24 },
  title: { fontSize: 17, fontWeight: 700, marginBottom: 4 },
  desc: { fontSize: 13, color: '#6b7280', marginBottom: 16 },
  form: { marginBottom: 20 },
  formRow: { display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 120 },
  label: { fontSize: 12, fontWeight: 600, color: '#555' },
  input: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 14 },
  lockBtn: { padding: '8px 16px', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' },
  error: { color: '#e53e3e', fontSize: 13, marginTop: 6 },
  empty: { color: '#9ca3af', fontSize: 13 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafafa' },
  lockIcon: { fontSize: 16 },
  periodInfo: { flex: 1 },
  periodLabel: { fontWeight: 600, fontSize: 14, color: '#111827' },
  periodDates: { fontSize: 12, color: '#6b7280' },
  periodMeta: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  unlockBtn: { background: 'none', border: '1px solid #fca5a5', color: '#ef4444', padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
};
