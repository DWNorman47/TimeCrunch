import React, { useState, useEffect } from 'react';
import api from '../api';

function daysLeft(dateStr) {
  if (!dateStr) return 0;
  return Math.max(0, Math.ceil((new Date(dateStr) - new Date()) / 86400000));
}

function StatusBadge({ status, trialEndsAt, plan }) {
  if (status === 'active') {
    const label = plan === 'business' ? 'Business' : plan === 'starter' ? 'Starter' : 'Free';
    return <span style={{ ...badge, background: '#d1fae5', color: '#065f46' }}>● Active — {label}</span>;
  }
  if (status === 'trial') {
    const d = daysLeft(trialEndsAt);
    const color = d <= 3 ? '#fef2f2' : '#fef3c7';
    const text = d <= 3 ? '#991b1b' : '#92400e';
    return <span style={{ ...badge, background: color, color: text }}>Trial — {d} day{d !== 1 ? 's' : ''} left</span>;
  }
  if (status === 'past_due') return <span style={{ ...badge, background: '#fef2f2', color: '#991b1b' }}>⚠ Payment past due</span>;
  if (status === 'canceled') return <span style={{ ...badge, background: '#f3f4f6', color: '#374151' }}>Canceled</span>;
  return null;
}

const badge = { padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700 };

function PlanCard({ name, priceEl, subline, features, color, highlight, tag, onSelect, btnLabel, disabled, current }) {
  return (
    <div style={{ ...s.planCard, ...(highlight ? s.planCardHighlight : {}), ...(current ? s.planCardCurrent : {}), borderColor: current ? '#059669' : highlight ? color : '#e5e7eb' }}>
      {tag && <div style={{ ...s.planTag, background: color }}>{tag}</div>}
      <div style={s.planName}>{name}</div>
      <div style={{ ...s.planPrice, color }}>{priceEl}</div>
      {subline && <div style={s.planSubline}>{subline}</div>}
      <ul style={s.featureList}>
        {features.map(f => (
          <li key={f.text} style={s.featureItem}>
            <span style={{ color: f.lock ? '#d1d5db' : '#059669', marginRight: 6 }}>{f.lock ? '🔒' : '✓'}</span>
            <span style={{ color: f.lock ? '#9ca3af' : '#374151' }}>{f.text}</span>
          </li>
        ))}
      </ul>
      <button style={{ ...s.planBtn, background: current ? '#059669' : color, opacity: disabled ? 0.6 : 1 }}
        onClick={onSelect} disabled={disabled}>
        {btnLabel}
      </button>
    </div>
  );
}

export default function BillingPanel() {
  const [status, setStatus] = useState(null);
  const [plans, setPlans] = useState(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(null);
  const [annual, setAnnual] = useState(false);
  const [workerCount, setWorkerCount] = useState(10);
  const [addProAddon, setAddProAddon] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/stripe/status'), api.get('/stripe/plans')])
      .then(([s, p]) => { setStatus(s.data); setPlans(p.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const checkout = async (priceId, opts = {}) => {
    if (!priceId) return alert('Stripe not fully configured. Set STRIPE_PRICE_* environment variables.');
    setRedirecting(priceId);
    try {
      const r = await api.post('/stripe/checkout', {
        price_id: priceId,
        ...opts,
        ...(addProAddon && plans?.pro_addon ? {
          add_pro_addon: true,
          pro_addon_price_id: annual ? plans.pro_addon.annual_price_id : plans.pro_addon.monthly_price_id,
        } : {}),
      });
      window.location.href = r.data.url;
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to start checkout');
      setRedirecting(null);
    }
  };

  const portal = async () => {
    setRedirecting('portal');
    try {
      const r = await api.post('/stripe/portal');
      window.location.href = r.data.url;
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to open billing portal');
      setRedirecting(null);
    }
  };

  if (loading) return <div style={s.card}><p style={{ color: '#888' }}>Loading billing info...</p></div>;

  const sub = status?.subscription_status;
  const currentPlan = status?.plan || 'free';
  const hasProAddon = status?.pro_addon;
  const isActive = sub === 'active';
  const isTrial = sub === 'trial';
  const trialExpired = isTrial && daysLeft(status?.trial_ends_at) === 0;
  const trialNote = isTrial && daysLeft(status?.trial_ends_at) > 0;
  const showPlans = !isActive || sub === 'canceled';

  const businessMonthly = plans ? plans.business.base_monthly + workerCount * plans.business.per_worker_monthly : null;
  const businessAnnualBase = plans ? plans.business.base_annual : null;
  const proAddonMonthly = plans ? plans.pro_addon.monthly : null;

  return (
    <div style={s.card}>
      <div style={s.topRow}>
        <div>
          <h3 style={s.title}>Billing & Subscription</h3>
          {isActive && <p style={s.sub}>Manage your plan and payment details below.</p>}
        </div>
        <StatusBadge status={sub} trialEndsAt={status?.trial_ends_at} plan={currentPlan} />
      </div>

      {sub === 'past_due' && (
        <div style={s.alert}>
          ⚠ Your last payment failed. Update your payment method to avoid losing access.
          <button style={s.alertBtn} onClick={portal} disabled={redirecting === 'portal'}>
            {redirecting === 'portal' ? 'Redirecting...' : 'Update payment'}
          </button>
        </div>
      )}

      {trialExpired && (
        <div style={{ ...s.alert, background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>
          Your trial has expired. Choose a plan below to continue.
        </div>
      )}

      {isTrial && !trialExpired && (
        <div style={s.trialBanner}>
          You're on a free trial with full access to all features. Subscribe before your trial ends to keep uninterrupted access — remaining trial days carry over at no extra charge.
        </div>
      )}

      {isActive && (
        <div style={s.activeSection}>
          <p style={s.activeText}>
            Your <strong>{currentPlan === 'business' ? 'Business' : 'Starter'}</strong> plan is active
            {hasProAddon ? ' with the Pro add-on (Certified Payroll & QuickBooks)' : ''}.
          </p>
          <button style={s.portalBtn} onClick={portal} disabled={redirecting === 'portal'}>
            {redirecting === 'portal' ? 'Redirecting...' : 'Manage Subscription'}
          </button>
        </div>
      )}

      {showPlans && (
        <>
          {/* Annual toggle */}
          <div style={s.toggleRow}>
            <span style={{ fontSize: 14, color: annual ? '#9ca3af' : '#111827', fontWeight: annual ? 400 : 600 }}>Monthly</span>
            <button style={{ ...s.toggle, background: annual ? '#1a56db' : '#e5e7eb' }} onClick={() => setAnnual(a => !a)}>
              <span style={{ ...s.toggleKnob, transform: annual ? 'translateX(20px)' : 'translateX(2px)' }} />
            </button>
            <span style={{ fontSize: 14, color: annual ? '#111827' : '#9ca3af', fontWeight: annual ? 600 : 400 }}>
              Annual <span style={{ background: '#d1fae5', color: '#065f46', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>Save 17%</span>
            </span>
          </div>

          <div style={s.plans}>
            {/* Free */}
            <PlanCard
              name="Free"
              priceEl={<span><span style={{ fontSize: 28, fontWeight: 800 }}>$0</span></span>}
              subline="Up to 3 workers"
              color="#6b7280"
              current={currentPlan === 'free' && isActive}
              features={[
                { text: 'Clock in/out & time tracking' },
                { text: 'Admin approval workflow' },
                { text: 'Basic analytics' },
                { text: 'Scheduling (current week only)' },
                { text: 'Timesheet PDF (latest week only)' },
                { text: '90-day history' },
                { text: 'GPS geofencing', lock: true },
                { text: 'CSV payroll export', lock: true },
                { text: 'Full history', lock: true },
              ]}
              btnLabel={currentPlan === 'free' && isActive ? 'Current Plan' : 'Continue Free'}
              disabled={true}
            />

            {/* Starter */}
            <PlanCard
              name="Starter"
              priceEl={
                annual
                  ? <><span style={{ fontSize: 28, fontWeight: 800 }}>${plans ? Math.round(plans.starter.annual / 12) : 16}</span><span style={{ fontSize: 14, color: '#6b7280' }}>/mo</span></>
                  : <><span style={{ fontSize: 28, fontWeight: 800 }}>${plans?.starter.monthly ?? 19}</span><span style={{ fontSize: 14, color: '#6b7280' }}>/mo</span></>
              }
              subline={annual ? `$${plans?.starter.annual ?? 190}/yr — 2 months free` : 'Up to 10 workers'}
              color="#2563eb"
              current={currentPlan === 'starter' && isActive}
              tag={!annual ? null : null}
              features={[
                { text: 'Everything in Free' },
                { text: 'Up to 10 workers' },
                { text: 'GPS geofencing' },
                { text: 'CSV & payroll exports' },
                { text: 'Overtime report' },
                { text: 'Full history — no limit' },
                { text: 'Scheduled shifts' },
                { text: 'Worker timesheet PDF (any range)' },
                { text: 'Broadcast announcements', lock: true },
                { text: 'Field reports, safety, punchlist', lock: true },
              ]}
              btnLabel={currentPlan === 'starter' && isActive ? 'Current Plan' : `Subscribe — ${annual ? `$${plans?.starter.annual ?? 190}/yr` : `$${plans?.starter.monthly ?? 19}/mo`}`}
              disabled={!!redirecting || (currentPlan === 'starter' && isActive)}
              onSelect={() => checkout(annual ? plans?.starter.annual_price_id : plans?.starter.monthly_price_id)}
            />

            {/* Business */}
            <PlanCard
              name="Business"
              highlight
              tag="Most Popular"
              priceEl={
                <><span style={{ fontSize: 28, fontWeight: 800 }}>${plans?.business.base_monthly ?? 25}</span><span style={{ fontSize: 14, color: '#6b7280' }}>/mo + $1/worker</span></>
              }
              subline={
                <span>
                  {workerCount} workers = <strong style={{ color: '#7c3aed' }}>${plans ? plans.business.base_monthly + workerCount : 25 + workerCount}/mo</strong>
                  {annual && <span style={{ color: '#059669', fontSize: 12 }}> (${plans ? plans.business.base_annual : 250}/yr base)</span>}
                </span>
              }
              color="#7c3aed"
              current={currentPlan === 'business' && isActive}
              features={[
                { text: 'Everything in Starter' },
                { text: 'Unlimited workers' },
                { text: 'Broadcast announcements' },
                { text: 'Field reports & daily reports' },
                { text: 'Safety talks / toolbox talks' },
                { text: 'Punchlist management' },
                { text: 'Advanced analytics & trends' },
                { text: 'Inactive worker alerts' },
                { text: 'Certified payroll (WH-347)', lock: !addProAddon },
                { text: 'QuickBooks Online sync', lock: !addProAddon },
              ]}
              btnLabel={currentPlan === 'business' && isActive ? 'Current Plan' : `Subscribe — $${plans ? plans.business.base_monthly + workerCount : 25 + workerCount}/mo`}
              disabled={!!redirecting || (currentPlan === 'business' && isActive)}
              onSelect={() => checkout(
                annual ? plans?.business.base_annual_price_id : plans?.business.base_monthly_price_id,
                annual
                  ? { worker_price_id: plans?.business.worker_annual_price_id, worker_count: workerCount }
                  : { worker_price_id: plans?.business.worker_monthly_price_id, worker_count: workerCount }
              )}
            />
          </div>

          {/* Worker count slider for Business */}
          <div style={s.sliderWrap}>
            <label style={s.sliderLabel}>Workers on Business plan: <strong>{workerCount}</strong></label>
            <input type="range" min={4} max={200} value={workerCount} onChange={e => setWorkerCount(Number(e.target.value))} style={{ width: '100%', accentColor: '#7c3aed' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af' }}>
              <span>4</span><span>200+</span>
            </div>
          </div>

          {/* Pro Add-on */}
          <div style={s.addonCard}>
            <div style={s.addonLeft}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={addProAddon} onChange={e => setAddProAddon(e.target.checked)} style={{ accentColor: '#d97706', width: 16, height: 16 }} />
                <span style={s.addonTitle}>+ Pro Add-on &nbsp;<span style={{ fontSize: 18, fontWeight: 800, color: '#d97706' }}>${plans?.pro_addon.monthly ?? 45}</span><span style={{ fontSize: 13, color: '#9ca3af' }}>/mo</span></span>
              </label>
              <div style={s.addonFeatures}>
                <div style={s.addonFeature}>
                  <span style={{ color: '#d97706', fontWeight: 700 }}>Certified Payroll (WH-347)</span>
                  <span style={s.addonDesc}> — Required for Davis-Bacon & prevailing wage government contracts. Generates weekly reports as a print-ready PDF.</span>
                </div>
                <div style={s.addonFeature}>
                  <span style={{ color: '#d97706', fontWeight: 700 }}>QuickBooks Online Sync</span>
                  <span style={s.addonDesc}> — Push hours and payroll data directly to QuickBooks. No manual entry, no double-keying.</span>
                </div>
              </div>
            </div>
          </div>

          {trialNote && (
            <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', marginTop: 8, fontStyle: 'italic' }}>
              Remaining trial days carry over — you won't be charged until your trial ends.
            </p>
          )}
        </>
      )}
    </div>
  );
}

const s = {
  card: { background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 24 },
  topRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 },
  title: { fontSize: 17, fontWeight: 700, margin: 0, marginBottom: 2 },
  sub: { fontSize: 13, color: '#6b7280', margin: 0 },
  alert: { background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  alertBtn: { background: '#1a56db', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  trialBanner: { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#1e40af', lineHeight: 1.5 },
  activeSection: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '16px 20px', marginBottom: 16 },
  activeText: { fontSize: 14, color: '#374151', marginBottom: 12 },
  portalBtn: { background: '#1a56db', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  toggleRow: { display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 20 },
  toggle: { width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', padding: 0, flexShrink: 0 },
  toggleKnob: { position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', display: 'block' },
  plans: { display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 },
  planCard: { flex: 1, minWidth: 200, border: '2px solid #e5e7eb', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' },
  planCardHighlight: { boxShadow: '0 4px 20px rgba(124,58,237,0.12)' },
  planCardCurrent: {},
  planTag: { position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 12px', borderRadius: 20, whiteSpace: 'nowrap' },
  planName: { fontSize: 16, fontWeight: 700, color: '#111827' },
  planPrice: { display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' },
  planSubline: { fontSize: 12, color: '#6b7280', marginTop: -6 },
  featureList: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 5, flex: 1 },
  featureItem: { fontSize: 12, color: '#374151', display: 'flex', alignItems: 'flex-start' },
  planBtn: { width: '100%', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 4, transition: 'opacity 0.15s' },
  sliderWrap: { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px', marginBottom: 14 },
  sliderLabel: { fontSize: 13, color: '#374151', display: 'block', marginBottom: 8 },
  addonCard: { border: '2px solid #fde68a', borderRadius: 10, padding: '14px 16px', background: '#fffbeb' },
  addonLeft: { display: 'flex', flexDirection: 'column', gap: 10 },
  addonTitle: { fontSize: 15, fontWeight: 700, color: '#92400e' },
  addonFeatures: { display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 26 },
  addonFeature: { fontSize: 12, color: '#374151', lineHeight: 1.5 },
  addonDesc: { color: '#6b7280' },
};
