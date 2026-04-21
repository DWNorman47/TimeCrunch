/**
 * Structured failure logging for hot request paths (clock-in, inventory
 * transactions, etc.) so "user can't do X" tickets become one log query away.
 *
 * Each call emits a single pino warn-level entry with a well-known shape:
 *
 *   logFailure(req, 'clock.in', 'project_not_found', { project_id })
 *
 *     {
 *       level: 40,
 *       time: ...,
 *       kind: 'request_failure',
 *       op: 'clock.in',
 *       reason: 'project_not_found',
 *       user_id: 29,
 *       role: 'worker',
 *       company_id: '9fc...',
 *       meta: { project_id: 28 },
 *       msg: 'clock.in failed: project_not_found'
 *     }
 *
 * Grep-friendly reason codes (snake_case, short). The `meta` object is free-form
 * per call site but shouldn't include user-typed free text or secrets — stick to
 * IDs, enums, and small boolean flags.
 */

const logger = require('./logger');

function logFailure(req, op, reason, meta = {}) {
  try {
    logger.warn({
      kind: 'request_failure',
      op,
      reason,
      user_id: req?.user?.id ?? null,
      role: req?.user?.role ?? null,
      company_id: req?.user?.company_id ?? null,
      meta,
    }, `${op} failed: ${reason}`);
  } catch {
    // Never let logging fail the request.
  }
}

module.exports = { logFailure };
