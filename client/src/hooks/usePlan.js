import { useAuth } from '../contexts/AuthContext';

const PLAN_LEVEL = { free: 0, starter: 1, business: 2 };

// Returns helpers for checking the current company's plan and feature access.
export function usePlan() {
  const { user } = useAuth();

  const plan = user?.plan || 'free';
  const status = user?.subscription_status || 'trial';
  const qboAddon = user?.addon_qbo || false;
  const isTrial = status === 'trial';
  const isTrialExpired = status === 'trial_expired';
  const isActive = status === 'active' || isTrial;

  // Does the current plan meet or exceed minPlan?
  // Trial users always return true.
  function atLeast(minPlan) {
    if (isTrial) return true;
    if (!isActive) return false;
    return (PLAN_LEVEL[plan] ?? 0) >= (PLAN_LEVEL[minPlan] ?? 0);
  }

  return {
    plan,
    status,
    qboAddon,
    isTrial,
    isTrialExpired,
    isActive,
    isFree: plan === 'free' && !isTrial,
    isStarter: atLeast('starter'),
    isBusiness: atLeast('business'),
    hasQbo: qboAddon || isTrial,
    atLeast,
    // History limit in days — null means no limit
    historyDays: atLeast('starter') ? null : 90,
  };
}
