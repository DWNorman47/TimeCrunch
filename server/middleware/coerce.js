/**
 * Input coercion for HTTP request bodies.
 *
 * The clients in this repo (web + PWA) submit forms that often contain empty
 * strings for optional numeric fields — selectedProject: "", from_location_id: "",
 * budget_dollars: "" — because that's what an unfilled <input> holds. Postgres
 * rejects those with "invalid input syntax for type integer" before the handler
 * gets a chance to intercept, producing unhelpful 500s.
 *
 * This middleware normalizes each route's declared integer fields:
 *   - ""  → null
 *   - "42" → 42
 *   - "abc" (invalid int) → 400 { field, error }
 *   - missing key → unchanged (left out of the body)
 *   - numbers passed as numbers → unchanged
 *
 * Usage:
 *   const { coerceBody } = require('../middleware/coerce');
 *   router.post('/in', coerceBody({ int: ['project_id'] }), handler);
 */

function coerceBody(schema = {}) {
  const intFields    = schema.int    || [];
  const floatFields  = schema.float  || [];
  const boolFields   = schema.bool   || [];

  return function coerceBodyMiddleware(req, res, next) {
    if (!req.body || typeof req.body !== 'object') return next();

    for (const field of intFields) {
      if (!(field in req.body)) continue;
      const raw = req.body[field];
      if (raw === null || raw === undefined || raw === '') {
        req.body[field] = null;
        continue;
      }
      if (typeof raw === 'number' && Number.isInteger(raw)) continue;
      const parsed = parseInt(raw, 10);
      if (Number.isNaN(parsed) || String(parsed) !== String(raw).trim()) {
        return res.status(400).json({ field, error: `${field} must be an integer or omitted` });
      }
      req.body[field] = parsed;
    }

    for (const field of floatFields) {
      if (!(field in req.body)) continue;
      const raw = req.body[field];
      if (raw === null || raw === undefined || raw === '') {
        req.body[field] = null;
        continue;
      }
      if (typeof raw === 'number') continue;
      const parsed = parseFloat(raw);
      if (Number.isNaN(parsed)) {
        return res.status(400).json({ field, error: `${field} must be a number or omitted` });
      }
      req.body[field] = parsed;
    }

    for (const field of boolFields) {
      if (!(field in req.body)) continue;
      const raw = req.body[field];
      if (raw === null || raw === undefined || raw === '') {
        req.body[field] = null;
        continue;
      }
      if (typeof raw === 'boolean') continue;
      if (raw === 'true' || raw === 1 || raw === '1')  { req.body[field] = true;  continue; }
      if (raw === 'false' || raw === 0 || raw === '0') { req.body[field] = false; continue; }
      return res.status(400).json({ field, error: `${field} must be a boolean` });
    }

    next();
  };
}

module.exports = { coerceBody };
