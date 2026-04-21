const { effectiveSubscriptionStatus } = require('../utils/subscription');

describe('effectiveSubscriptionStatus', () => {
  test('null/undefined company → null', () => {
    expect(effectiveSubscriptionStatus(null)).toBeNull();
    expect(effectiveSubscriptionStatus(undefined)).toBeNull();
  });

  test('non-trial statuses pass through unchanged', () => {
    expect(effectiveSubscriptionStatus({ subscription_status: 'active' })).toBe('active');
    expect(effectiveSubscriptionStatus({ subscription_status: 'canceled' })).toBe('canceled');
    expect(effectiveSubscriptionStatus({ subscription_status: 'past_due' })).toBe('past_due');
  });

  test('trial with no end date stays trial', () => {
    expect(effectiveSubscriptionStatus({ subscription_status: 'trial', trial_ends_at: null })).toBe('trial');
  });

  test('trial with future end date stays trial', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(effectiveSubscriptionStatus({ subscription_status: 'trial', trial_ends_at: future })).toBe('trial');
  });

  test('trial with past end date → trial_expired', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(effectiveSubscriptionStatus({ subscription_status: 'trial', trial_ends_at: past })).toBe('trial_expired');
  });

  test('already-expired trial (status trial_expired) stays trial_expired', () => {
    expect(effectiveSubscriptionStatus({ subscription_status: 'trial_expired', trial_ends_at: null })).toBe('trial_expired');
  });

  test('garbage trial_ends_at is ignored (falls back to status)', () => {
    expect(effectiveSubscriptionStatus({ subscription_status: 'trial', trial_ends_at: 'not-a-date' })).toBe('trial');
  });
});
