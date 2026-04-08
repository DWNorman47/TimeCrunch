import React, { useState, useEffect } from 'react';
import api from '../api';
import { useT } from '../hooks/useT';

function daysLeft(dateStr) {
  if (!dateStr) return 0;
  return Math.max(0, Math.ceil((new Date(dateStr) - new Date()) / 86400000));
}

function StatusBadge({ status, trialEndsAt, plan, t }) {
  if (status === 'active') {
    const label = plan === 'business' ? t.planBusiness : plan === 'starter' ? t.planStarter : t.planFree;
    return <span style={{ ...badge, background: '#d1fae5', color: '#065f46' }}>● Active — {label}</span>;
  }
  if (status === 'trial') {
    const d = daysLeft(trialEndsAt);
    const color = d <= 3 ? '#fef2f2' : '#fef3c7';
    const text = d <= 3 ? '#991b1b' : '#92400e';
    return <span style={{ ...badge, background: color, color: text }}>Trial — {d} {d !== 1 ? t.daysLabel : t.dayLabel} left</span>;
  }
  if (status === 'past_due') return <span style={{ ...badge, background: '#fef2f2', color: '#991b1b' }}>⚠ Payment past due</span>;
  if (status === 'canceled') return <span style={{ ...badge, background: '#f3f4f6', color: '#374151' }}>Canceled</span>;
  if (status === 'trial_expired') return <span style={{ ...badge, background: '#fef2f2', color: '#991b1b' }}>Trial ended</span>;
  return null;
}

const badge = { padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700 };

function PlanCard({ name, priceEl, subline, features, color, highlight, tag, onSelect, btnLabel, disabled, current, selected }) {
  return (
    <div style={{
      ...s.planCard,
      borderColor: current ? '#059669' : selected ? color : highlight ? color : '#e5e7eb',
      boxShadow: selected ? `0 0 0 3px ${color}22` : highlight ? '0 4px 20px rgba(124,58,237,0.12)' : undefined,
    }}>
      {tag && !selected && <div style={{ ...s.planTag, background: color }}>{tag}</div>}
      {selected && <div style={{ ...s.selectedTag, background: color }}>✓ Selected</div>}
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
      <button
        style={{ ...s.planBtn, background: selected ? color : current ? '#059669' : color, opacity: disabled ? 0.6 : 1 }}
        onClick={onSelect}
        disabled={disabled}
      >
        {btnLabel}
      </button>
    </div>
  );
}

export default function BillingPanel() {
  const t = useT();
  const [status, setStatus] = useState(null);
  const [plans, setPlans] = useState(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(null);
  const [billingError, setBillingError] = useState('');
  const [annual, setAnnual] = useState(false);
  const [workerCount, setWorkerCount] = useState(15);
  const [addQbo, setAddQbo] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [workerInputMode, setWorkerInputMode] = useState('slider');
  const [workerDraft, setWorkerDraft] = useState('');

  useEffect(() => {
    Promise.all([api.get('/stripe/status'), api.get('/stripe/plans')])
      .then(([s, p]) => { setStatus(s.data); setPlans(p.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const checkout = async (priceId, opts = {}) => {
    if (!priceId) { setBillingError(t.stripeNotConfigured); return; }
    setBillingError('');
    setRedirecting(priceId);
    try {
      const r = await api.post('/stripe/checkout', {
        price_id: priceId,
        ...opts,
        ...(addQbo && plans?.qbo ? {
          add_qbo: true,
          qbo_price_id: annual ? plans.qbo.annual_price_id : plans.qbo.monthly_price_id,
        } : {}),
      });
      window.location.href = r.data.url;
    } catch (err) {
      setBillingError(err.response?.data?.error || t.checkoutFailed);
      setRedirecting(null);
    }
  };

  const portal = async () => {
    setBillingError('');
    setRedirecting('portal');
    try {
      const r = await api.post('/stripe/portal');
      window.location.href = r.data.url;
    } catch (err) {
      setBillingError(err.response?.data?.error || t.portalFailed);
      setRedirecting(null);
    }
  };

  const subscribeSelectedPlan = () => {
    if (!selectedPlan || selectedPlan === 'free') return;
    if (selectedPlan === 'starter') {
      checkout(annual ? plans?.starter.annual_price_id : plans?.starter.monthly_price_id);
    } else if (selectedPlan === 'business') {
      checkout(
        annual ? plans?.business.base_annual_price_id : plans?.business.base_monthly_price_id,
        annual
          ? { worker_price_id: plans?.business.worker_annual_price_id, worker_count: workerCount }
          : { worker_price_id: plans?.business.worker_monthly_price_id, worker_count: workerCount }
      );
    }
  };

  if (loading) return <div style={s.card}><p style={{ color: '#888' }}>{t.loading}</p></div>;

  const sub = status?.subscription_status;
  const currentPlan = status?.plan || 'free';
  const hasQbo = status?.addon_qbo;
  const isActive = sub === 'active';
  const isTrial = sub === 'trial';
  const isTrialExpired = sub === 'trial_expired';
  const trialDays = daysLeft(status?.trial_ends_at);

  const INCLUDED_WORKERS = 15;
  const businessOverage = Math.max(0, workerCount - INCLUDED_WORKERS);

  const BASE_MONTHLY = plans?.business.base_monthly ?? 35;
  const PER_WORKER_MONTHLY = plans?.business.per_worker_monthly ?? 2;
  const businessMonthly = BASE_MONTHLY + businessOverage * PER_WORKER_MONTHLY;

  const BASE_ANNUAL = plans?.business.base_annual ?? 350;
  const PER_WORKER_ANNUAL = plans?.business.per_worker_annual ?? 20;
  const businessAnnualTotal = BASE_ANNUAL + businessOverage * PER_WORKER_ANNUAL;
  const businessAnnualPerMonth = Math.round(businessAnnualTotal / 12);

  const showPlans = isTrial || isTrialExpired || sub === 'canceled' || !isActive;

  return (
    <div style={s.card}>
      <div style={s.topRow}>
        <div>
          <h3 style={s.title}>{t.billingTitle}</h3>
        </div>
        <StatusBadge status={sub} trialEndsAt={status?.trial_ends_at} plan={currentPlan} t={t} />
      </div>

      {billingError && <p style={s.billingError}>{billingError}</p>}

      {sub === 'past_due' && (
        <div style={s.alert}>
          ⚠ Your last payment failed. Update your payment method to avoid losing access.
          <button style={s.alertBtn} onClick={portal} disabled={redirecting === 'portal'}>
            {redirecting === 'portal' ? 'Redirecting...' : 'Update payment'}
          </button>
        </div>
      )}

      {isTrialExpired && (
        <div style={{ ...s.alert, background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>
          Your free trial has ended. Your data is safe — subscribe below to restore full access.
        </div>
      )}

      {isTrial && (
        <div style={s.trialBanner}>
          <strong>You have full Business-level access during your trial.</strong>
          {' '}Choose the plan that fits your team below — your selection won't change what you can do now.
          {trialDays > 0 && (
            <span style={{ display: 'block', marginTop: 6, fontSize: 12, color: '#1e40af' }}>
              {trialDays} day{trialDays !== 1 ? 's' : ''} remaining — remaining trial days carry over when you subscribe.
            </span>
          )}
        </div>
      )}

      {isActive && (
        <div style={s.activeSection}>
          <p style={s.activeText}>
            Your <strong>{currentPlan === 'business' ? t.planBusiness : t.planStarter}</strong> plan is active
            {hasQbo ? ` with ${t.addonQBO}` : ''}.
          </p>
          <button style={s.portalBtn} onClick={portal} disabled={redirecting === 'portal'}>
            {redirecting === 'portal' ? 'Redirecting...' : t.manageSub}
          </button>
        </div>
      )}

      {showPlans && (
        <>
          <div style={s.toggleRow}>
            <span style={{ fontSize: 14, color: annual ? '#9ca3af' : '#111827', fontWeight: annual ? 400 : 600 }}>{t.planMonthly}</span>
            <button style={{ ...s.toggle, background: annual ? '#1a56db' : '#d1d5db' }} onClick={() => setAnnual(a => !a)}>
              <span style={{ ...s.toggleKnob, transform: annual ? 'translateX(46px)' : 'translateX(0)' }} />
            </button>
            <span style={{ fontSize: 14, color: annual ? '#111827' : '#9ca3af', fontWeight: annual ? 600 : 400 }}>
              {t.planAnnual} <span style={{ background: '#d1fae5', color: '#065f46', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{t.planSave}</span>
            </span>
          </div>

          <div style={s.plans}>
            <PlanCard
              name={t.planFree}
              priceEl={<span><span style={{ fontSize: 28, fontWeight: 800 }}>$0</span></span>}
              subline="Up to 3 workers"
              color="#6b7280"
              current={currentPlan === 'free' && isActive}
              selected={selectedPlan === 'free'}
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
              btnLabel={currentPlan === 'free' && isActive ? t.currentPlan : isTrial ? `Choose ${t.planFree}` : `Continue ${t.planFree}`}
              disabled={currentPlan === 'free' && isActive}
              onSelect={() => isTrial ? setSelectedPlan('free') : null}
            />

            <PlanCard
              name={t.planStarter}
              priceEl={
                annual
                  ? <><span style={{ fontSize: 28, fontWeight: 800 }}>${plans ? Math.round(plans.starter.annual / 12) : 17}</span><span style={{ fontSize: 14, color: '#6b7280' }}>/mo</span></>
                  : <><span style={{ fontSize: 28, fontWeight: 800 }}>${plans?.starter.monthly ?? 20}</span><span style={{ fontSize: 14, color: '#6b7280' }}>/mo</span></>
              }
              subline={annual ? `$${plans?.starter.annual ?? 200}/yr — 2 months free` : 'Up to 10 workers'}
              color="#2563eb"
              current={currentPlan === 'starter' && isActive}
              selected={selectedPlan === 'starter'}
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
              btnLabel={
                currentPlan === 'starter' && isActive ? t.currentPlan
                  : isTrial ? (selectedPlan === 'starter' ? `✓ ${t.planStarter} Selected` : `Choose ${t.planStarter}`)
                  : `Subscribe — ${annual ? `$${plans?.starter.annual ?? 200}/yr` : `$${plans?.starter.monthly ?? 20}/mo`}`
              }
              disabled={!!redirecting || (currentPlan === 'starter' && isActive)}
              onSelect={() => isTrial
                ? setSelectedPlan('starter')
                : checkout(annual ? plans?.starter.annual_price_id : plans?.starter.monthly_price_id)
              }
            />

            <PlanCard
              name={t.planBusiness}
              highlight
              tag={t.planMostPopular}
              priceEl={
                annual
                  ? <><span style={{ fontSize: 28, fontWeight: 800 }}>${businessAnnualPerMonth}</span><span style={{ fontSize: 14, color: '#6b7280' }}>/mo</span></>
                  : <><span style={{ fontSize: 28, fontWeight: 800 }}>${BASE_MONTHLY}</span><span style={{ fontSize: 14, color: '#6b7280' }}>/mo</span></>
              }
              subline={
                annual
                  ? <span>
                      ${businessAnnualTotal}/yr — 2 months free
                      {businessOverage > 0 && <> · {businessOverage} extra workers</>}
                    </span>
                  : <span>
                      Includes {INCLUDED_WORKERS} workers
                      {businessOverage > 0
                        ? <> + {businessOverage} extra = <strong style={{ color: '#8b5cf6' }}>${businessMonthly}/mo</strong></>
                        : <> · ${PER_WORKER_MONTHLY}/worker after {INCLUDED_WORKERS}</>
                      }
                    </span>
              }
              color="#8b5cf6"
              current={currentPlan === 'business' && isActive}
              selected={selectedPlan === 'business'}
              features={[
                { text: 'Everything in Starter' },
                { text: `${INCLUDED_WORKERS} workers included, $${PER_WORKER_MONTHLY}/worker after` },
                { text: 'Broadcast announcements' },
                { text: 'Field reports & daily reports' },
                { text: 'Safety talks / toolbox talks' },
                { text: 'Punchlist management' },
                { text: 'Advanced analytics & trends' },
                { text: 'Inactive worker alerts' },
              ]}
              btnLabel={
                currentPlan === 'business' && isActive ? t.currentPlan
                  : isTrial ? (selectedPlan === 'business' ? `✓ ${t.planBusiness} Selected` : `Choose ${t.planBusiness}`)
                  : annual ? `Subscribe — $${businessAnnualTotal}/yr` : `Subscribe — $${businessMonthly}/mo`
              }
              disabled={!!redirecting || (currentPlan === 'business' && isActive)}
              onSelect={() => isTrial
                ? setSelectedPlan('business')
                : checkout(
                  annual ? plans?.business.base_annual_price_id : plans?.business.base_monthly_price_id,
                  annual
                    ? { worker_price_id: plans?.business.worker_annual_price_id, worker_count: workerCount }
                    : { worker_price_id: plans?.business.worker_monthly_price_id, worker_count: workerCount }
                )
              }
            />
          </div>

          <div style={s.sliderWrap}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ ...s.sliderLabel, marginBottom: 0 }}>
                Team size (Business plan): <strong>{workerCount} workers</strong>
                {workerCount > INCLUDED_WORKERS
                  ? <span style={{ color: '#8b5cf6', marginLeft: 8 }}>
                      {annual ? `$${businessAnnualTotal}/yr` : `$${businessMonthly}/mo`}
                    </span>
                  : <span style={{ color: '#6b7280', marginLeft: 8 }}>included in base price</span>
                }
              </label>
              <button
                className="worker-mode-btn btn-circle"
                style={s.inputModeBtn}
                title={workerInputMode === 'slider' ? 'Enter exact count' : 'Use slider'}
                onClick={() => {
                  if (workerInputMode === 'slider') {
                    setWorkerDraft(String(workerCount));
                    setWorkerInputMode('number');
                  } else {
                    setWorkerInputMode('slider');
                  }
                }}
              >
                {workerInputMode === 'slider' ? '✏️' : '↔'}
              </button>
            </div>
            {workerInputMode === 'slider' ? (
              <>
                <input type="range" min={INCLUDED_WORKERS} max={500} value={workerCount}
                  onChange={e => setWorkerCount(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#8b5cf6' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af' }}>
                  <span>{INCLUDED_WORKERS} (included)</span><span>500+</span>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min={1}
                  value={workerDraft}
                  onChange={e => setWorkerDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const v = Math.max(INCLUDED_WORKERS, parseInt(workerDraft, 10) || INCLUDED_WORKERS);
                      setWorkerCount(v);
                      setWorkerDraft(String(v));
                    }
                  }}
                  style={s.workerNumInput}
                  autoFocus
                />
                <button
                  style={s.workerUpdateBtn}
                  onClick={() => {
                    const v = Math.max(INCLUDED_WORKERS, parseInt(workerDraft, 10) || INCLUDED_WORKERS);
                    setWorkerCount(v);
                    setWorkerDraft(String(v));
                  }}
                >
                  Update
                </button>
              </div>
            )}
          </div>

          <div style={s.addonCard}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={addQbo} onChange={e => setAddQbo(e.target.checked)}
                style={{ accentColor: '#d97706', width: 16, height: 16 }} />
              <span style={s.addonTitle}>
                + QuickBooks Online Sync &nbsp;
                <span style={{ fontSize: 18, fontWeight: 800, color: '#d97706' }}>${plans?.qbo.monthly ?? 25}</span>
                <span style={{ fontSize: 13, color: '#9ca3af' }}>/mo</span>
              </span>
            </label>
            <div style={{ paddingLeft: 26, fontSize: 12, color: '#6b7280', lineHeight: 1.5, marginTop: 6 }}>
              Push approved hours and payroll data directly to QuickBooks Online. No manual entry, no double-keying.
            </div>
          </div>

          {isTrial && selectedPlan && selectedPlan !== 'free' && (
            <div style={s.trialCta}>
              <div style={{ fontSize: 14, color: '#111827' }}>
                Ready to subscribe to <strong style={{ textTransform: 'capitalize' }}>{selectedPlan}</strong>?
                {selectedPlan === 'business' && (
                  <span style={{ color: '#6b7280' }}>
                    {annual
                      ? ` (${workerCount} workers = $${businessAnnualTotal}/yr)`
                      : ` (${workerCount} workers = $${businessMonthly}/mo)`}
                  </span>
                )}
              </div>
              <button style={s.ctaBtn} onClick={subscribeSelectedPlan} disabled={!!redirecting}>
                {redirecting ? 'Redirecting...' : `Subscribe to ${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)} — ${annual ? 'Annual' : 'Monthly'}`}
              </button>
              <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'center' }}>
                You won't be charged until your trial ends. Remaining trial days carry over.
              </div>
            </div>
          )}

          {isTrial && !selectedPlan && (
            <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', marginTop: 8, fontStyle: 'italic' }}>
              Select a plan above to lock in your pricing before your trial ends.
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
  toggle: { display: 'flex', alignItems: 'center', width: 70, height: 40, borderRadius: 7, border: 'none', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0, padding: 4 },
  toggleKnob: { display: 'block', width: 16, height: 32, borderRadius: 5, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'transform 0.2s', flexShrink: 0 },
  plans: { display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 },
  planCard: { flex: 1, minWidth: 200, border: '2px solid #e5e7eb', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' },
  planTag: { position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 12px', borderRadius: 20, whiteSpace: 'nowrap' },
  selectedTag: { position: 'absolute', top: -11, right: 12, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 12px', borderRadius: 20, whiteSpace: 'nowrap' },
  planName: { fontSize: 16, fontWeight: 700, color: '#111827' },
  planPrice: { display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' },
  planSubline: { fontSize: 12, color: '#6b7280', marginTop: -6 },
  featureList: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 5, flex: 1 },
  featureItem: { fontSize: 12, color: '#374151', display: 'flex', alignItems: 'flex-start' },
  planBtn: { width: '100%', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 4, transition: 'opacity 0.15s' },
  sliderWrap: { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px', marginBottom: 14 },
  sliderLabel: { fontSize: 13, color: '#374151', display: 'block', marginBottom: 8 },
  inputModeBtn: { background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#6b7280', fontSize: 15, minWidth: 30, width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, flexGrow: 0, padding: 0, lineHeight: 1, boxSizing: 'content-box' },
  workerNumInput: { width: 90, padding: '7px 10px', border: '1px solid #c7d2fe', borderRadius: 7, fontSize: 15, fontWeight: 700, color: '#8b5cf6', textAlign: 'center' },
  workerUpdateBtn: { padding: '7px 14px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 },
  addonCard: { border: '2px solid #fde68a', borderRadius: 10, padding: '14px 16px', background: '#fffbeb', marginBottom: 16 },
  addonTitle: { fontSize: 15, fontWeight: 700, color: '#92400e' },
  trialCta: { background: '#f0fdf4', border: '2px solid #bbf7d0', borderRadius: 10, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 },
  ctaBtn: { background: '#059669', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  billingError: { color: '#dc2626', fontSize: 13, margin: '0 0 12px' },
};
