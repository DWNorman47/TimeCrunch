const jwt = require('jsonwebtoken');
const pool = require('../db');

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  });
}

function requireSuperAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  });
}

// Plan hierarchy: free < starter < business
const PLAN_LEVEL = { free: 0, starter: 1, business: 2 };

// Gate a route to a minimum plan.
// Trial companies always pass — they get full access until the trial ends.
// Canceled companies are always blocked.
function requirePlan(minPlan) {
  return async (req, res, next) => {
    try {
      const r = await pool.query(
        'SELECT plan, subscription_status, addon_qbo, trial_ends_at FROM companies WHERE id = $1',
        [req.user.company_id]
      );
      const company = r.rows[0];
      if (!company) return res.status(403).json({ error: 'Company not found' });

      // Real-time trial expiry check — don't wait for the cron job
      if (company.subscription_status === 'trial' && company.trial_ends_at && new Date(company.trial_ends_at) < new Date()) {
        await pool.query('UPDATE companies SET subscription_status = $1 WHERE id = $2', ['trial_expired', req.user.company_id]);
        return res.status(403).json({ error: 'Trial expired', code: 'subscription_required' });
      }

      if (company.subscription_status === 'canceled' || company.subscription_status === 'trial_expired') {
        return res.status(403).json({ error: 'Subscription required', code: 'subscription_required' });
      }

      // Exempt and trial companies get full access to all features
      if (company.subscription_status === 'exempt' || company.subscription_status === 'trial') {
        req.company = company;
        return next();
      }

      const currentLevel = PLAN_LEVEL[company.plan || 'free'] ?? 0;
      const requiredLevel = PLAN_LEVEL[minPlan] ?? 0;

      if (currentLevel < requiredLevel) {
        return res.status(403).json({ error: 'Plan upgrade required', code: 'plan_required', required_plan: minPlan });
      }

      req.company = company;
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  };
}

// Gate a route to the Pro add-on.
async function requireProAddon(req, res, next) {
  try {
    const r = await pool.query(
      'SELECT plan, subscription_status, addon_qbo, trial_ends_at FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    const company = r.rows[0];
    if (!company) return res.status(403).json({ error: 'Company not found' });

    // Real-time trial expiry check
    if (company.subscription_status === 'trial' && company.trial_ends_at && new Date(company.trial_ends_at) < new Date()) {
      await pool.query('UPDATE companies SET subscription_status = $1 WHERE id = $2', ['trial_expired', req.user.company_id]);
      return res.status(403).json({ error: 'Trial expired', code: 'subscription_required' });
    }

    if (company.subscription_status === 'canceled' || company.subscription_status === 'trial_expired') {
      return res.status(403).json({ error: 'Subscription required', code: 'subscription_required' });
    }

    // Exempt and trial users get full access
    if (company.subscription_status === 'exempt' || company.subscription_status === 'trial' || company.addon_qbo) {
      req.company = company;
      return next();
    }

    return res.status(403).json({ error: 'QBO add-on required', code: 'qbo_required' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

// Returns true if the user has a given admin permission.
// null admin_permissions = full access (existing admins + company founder).
function hasAdminPermission(user, key) {
  if (user.role === 'super_admin') return true;
  if (!user.admin_permissions) return true;
  return user.admin_permissions[key] === true;
}

// Middleware factory — gate a route to a specific admin permission.
function requirePermission(key) {
  return (req, res, next) => {
    if (!hasAdminPermission(req.user, key)) {
      return res.status(403).json({ error: 'Insufficient permissions', code: 'permission_denied', required: key });
    }
    next();
  };
}

module.exports = { requireAuth, requireAdmin, requireSuperAdmin, requirePlan, requireProAddon, hasAdminPermission, requirePermission };
