const pool = require('./db');
const logger = require('./logger');

/**
 * Append a row to the audit_log table. Failures are logged but never thrown —
 * auditing must never break the caller's primary action.
 *
 * @param {string} companyId
 * @param {number|null} actorId      user.id of whoever performed the action
 * @param {string|null} actorName    user.full_name at time of action
 * @param {string}  action           dotted action name, e.g. 'entry.submitted'
 * @param {string|null} entityType   'time_entry' | 'project' | 'reimbursement' etc.
 * @param {number|string|null} entityId
 * @param {string|null} entityName
 * @param {object|null} details      JSON-serialisable extra context
 */
async function logAudit(companyId, actorId, actorName, action, entityType, entityId, entityName, details) {
  try {
    await pool.query(
      'INSERT INTO audit_log (company_id, actor_id, actor_name, action, entity_type, entity_id, entity_name, details) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [
        companyId,
        actorId,
        actorName,
        action,
        entityType || null,
        entityId || null,
        entityName || null,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (e) {
    logger.error({ err: e, action, companyId, actorId }, 'audit log insert failed');
  }
}

module.exports = { logAudit };
