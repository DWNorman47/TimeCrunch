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
        'SELECT plan, subscription_status, pro_addon FROM companies WHERE id = $1',
        [req.user.company_id]
      );
      const company = r.rows[0];
      if (!company) return res.status(403).json({ error: 'Company not found' });

      if (company.subscription_status === 'canceled' || company.subscription_status === 'trial_expired') {
        return res.status(403).json({ error: 'Subscription required', code: 'subscription_required' });
      }

      // Trial users get full access
      if (company.subscription_status === 'trial') {
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
      'SELECT plan, subscription_status, pro_addon FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    const company = r.rows[0];
    if (!company) return res.status(403).json({ error: 'Company not found' });

    if (company.subscription_status === 'canceled' || company.subscription_status === 'trial_expired') {
      return res.status(403).json({ error: 'Subscription required', code: 'subscription_required' });
    }

    // Trial users get full access
    if (company.subscription_status === 'trial' || company.pro_addon) {
      req.company = company;
      return next();
    }

    return res.status(403).json({ error: 'Pro add-on required', code: 'pro_addon_required' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { requireAuth, requireAdmin, requireSuperAdmin, requirePlan, requireProAddon };
