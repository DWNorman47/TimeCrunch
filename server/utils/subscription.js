/**
 * Subscription-status helpers.
 *
 * The DB column `subscription_status` can fall out of sync with reality:
 *   - A company created in trial mode stays 'trial' forever in the DB until
 *     something actively flips it, even if trial_ends_at has come and gone.
 *   - Hourly cron catches these and flips them to 'trial_expired', but we
 *     don't want users to experience up-to-an-hour of silent freebie access.
 *
 * effectiveSubscriptionStatus() resolves this at read time. Use it anywhere
 * you return subscription_status to the client or gate on it in middleware.
 */

function effectiveSubscriptionStatus(company) {
  if (!company) return null;
  const status = company.subscription_status;
  if (status === 'trial' && company.trial_ends_at) {
    const endsAt = new Date(company.trial_ends_at);
    if (!Number.isNaN(endsAt.getTime()) && endsAt.getTime() < Date.now()) {
      return 'trial_expired';
    }
  }
  return status;
}

module.exports = { effectiveSubscriptionStatus };
