import React, { useState, useEffect } from 'react';
import api from '../api';

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$49',
    period: '/mo',
    priceEnv: 'VITE_STRIPE_PRICE_STARTER',
    features: ['Up to 10 workers', 'All core features', 'CSV & payroll exports', 'Email support'],
    color: '#2563eb',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$99',
    period: '/mo',
    priceEnv: 'VITE_STRIPE_PRICE_PRO',
    features: ['Unlimited workers', 'Everything in Starter', 'QuickBooks integration', 'Priority support'],
    color: '#7c3aed',
    highlight: true,
  },
];

function daysLeft(dateStr) {
  if (!dateStr) return 0;
  return Math.max(0, Math.ceil((new Date(dateStr) - new Date()) / 86400000));
}

function StatusBadge({ status, trialEndsAt }) {
  if (status === 'active') return <span style={{ ...badge, background: '#d1fae5', color: '#065f46' }}>● Active</span>;
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

export default function BillingPanel() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(null);

  useEffect(() => {
    api.get('/stripe/status')
      .then(r => setStatus(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const checkout = async (priceId) => {
    if (!priceId) return alert('Stripe price ID not configured. Set VITE_STRIPE_PRICE_STARTER / VITE_STRIPE_PRICE_PRO in your Vercel env vars.');
    setRedirecting(priceId);
    try {
      const r = await api.post('/stripe/checkout', { price_id: priceId });
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

  if (loading) return <div style={styles.card}><p style={{ color: '#888' }}>Loading billing info...</p></div>;

  const isActive = status?.subscription_status === 'active';
  const isTrial = status?.subscription_status === 'trial';
  const trialExpired = isTrial && daysLeft(status?.trial_ends_at) === 0;
  const showPlans = !isActive || status?.subscription_status === 'canceled';

  return (
    <div style={styles.card}>
      <div style={styles.topRow}>
        <div>
          <h3 style={styles.title}>Billing & Subscription</h3>
          {status?.plan && isActive && (
            <p style={styles.planName}>{status.plan === 'pro' ? 'Pro' : 'Starter'} plan</p>
          )}
        </div>
        <StatusBadge status={status?.subscription_status} trialEndsAt={status?.trial_ends_at} />
      </div>

      {status?.subscription_status === 'past_due' && (
        <div style={styles.alert}>
          ⚠ Your last payment failed. Please update your payment method to avoid losing access.
          <button style={styles.alertBtn} onClick={portal} disabled={redirecting === 'portal'}>
            {redirecting === 'portal' ? 'Redirecting...' : 'Update payment'}
          </button>
        </div>
      )}

      {trialExpired && (
        <div style={{ ...styles.alert, background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>
          Your trial has expired. Subscribe to continue using Time Crunch.
        </div>
      )}

      {isActive && (
        <div style={styles.activeSection}>
          <p style={styles.activeText}>Your subscription is active. Use the billing portal to update payment details, download invoices, or cancel.</p>
          <button style={styles.portalBtn} onClick={portal} disabled={redirecting === 'portal'}>
            {redirecting === 'portal' ? 'Redirecting...' : 'Manage Subscription'}
          </button>
        </div>
      )}

      {showPlans && (
        <>
          <p style={styles.plansHeading}>{isActive ? 'Change plan' : 'Choose a plan to continue'}</p>
          <div style={styles.plans}>
            {PLANS.map(plan => {
              const priceId = import.meta.env[plan.priceEnv];
              const isCurrentPlan = status?.plan === plan.id && isActive;
              return (
                <div key={plan.id} style={{ ...styles.planCard, ...(plan.highlight ? styles.planCardHighlight : {}), ...(isCurrentPlan ? styles.planCardCurrent : {}) }}>
                  {plan.highlight && <div style={styles.popularBadge}>Most Popular</div>}
                  <div style={styles.planName2}>{plan.name}</div>
                  <div style={styles.planPrice}>
                    <span style={{ fontSize: 32, fontWeight: 800, color: plan.color }}>{plan.price}</span>
                    <span style={{ fontSize: 14, color: '#6b7280' }}>{plan.period}</span>
                  </div>
                  <ul style={styles.featureList}>
                    {plan.features.map(f => <li key={f} style={styles.featureItem}>✓ {f}</li>)}
                  </ul>
                  {isTrial && daysLeft(status?.trial_ends_at) > 0 && (
                    <p style={styles.trialNote}>Remaining trial days carry over — no charge until trial ends</p>
                  )}
                  <button
                    style={{ ...styles.subscribeBtn, background: plan.color }}
                    onClick={() => checkout(priceId)}
                    disabled={!!redirecting || isCurrentPlan}
                  >
                    {redirecting === priceId ? 'Redirecting...' : isCurrentPlan ? 'Current Plan' : `Subscribe to ${plan.name}`}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  card: { background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: 24 },
  topRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 10 },
  title: { fontSize: 17, fontWeight: 700, margin: 0, marginBottom: 2 },
  planName: { fontSize: 13, color: '#6b7280', margin: 0 },
  alert: { background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  alertBtn: { background: '#1a56db', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  activeSection: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '16px 20px', marginBottom: 8 },
  activeText: { fontSize: 14, color: '#374151', marginBottom: 12 },
  portalBtn: { background: '#1a56db', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  plansHeading: { fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 16 },
  plans: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  planCard: { flex: 1, minWidth: 220, border: '2px solid #e5e7eb', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' },
  planCardHighlight: { border: '2px solid #7c3aed', boxShadow: '0 4px 20px rgba(124,58,237,0.15)' },
  planCardCurrent: { border: '2px solid #059669' },
  popularBadge: { position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#7c3aed', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap' },
  planName2: { fontSize: 18, fontWeight: 700, color: '#111827' },
  planPrice: { display: 'flex', alignItems: 'baseline', gap: 4 },
  featureList: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 },
  featureItem: { fontSize: 13, color: '#374151' },
  trialNote: { fontSize: 11, color: '#6b7280', fontStyle: 'italic', margin: 0 },
  subscribeBtn: { width: '100%', color: '#fff', border: 'none', padding: '11px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4 },
};
