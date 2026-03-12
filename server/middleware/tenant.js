// Extracts company_id from the authenticated user's JWT and attaches it to req.
// Must run after requireAuth or requireAdmin.
function requireTenant(req, res, next) {
  const companyId = req.user?.company_id;
  if (!companyId) return res.status(403).json({ error: 'No company assigned to this account' });
  req.companyId = companyId;
  next();
}

module.exports = { requireTenant };
