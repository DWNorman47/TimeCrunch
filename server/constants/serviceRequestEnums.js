/**
 * Fixed-value enums for the `service_requests` table. See
 * `docs/db-enums.md` for the full registry.
 */

const SERVICE_REQUEST_STATUSES = Object.freeze([
  'new',
  'in_review',
  'converted',
  'declined',
  'spam',
]);
const SERVICE_REQUEST_STATUS_DEFAULT = 'new';

module.exports = {
  SERVICE_REQUEST_STATUSES,
  SERVICE_REQUEST_STATUS_DEFAULT,
};
