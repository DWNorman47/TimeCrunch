/**
 * Fixed-value enums for the `incident_reports` table. See
 * `docs/db-enums.md` for the full registry.
 */

const INCIDENT_TYPES = Object.freeze([
  'near_miss',
  'first_aid',
  'recordable',
  'lost_time',
  'property_damage',
  'other',
]);
const INCIDENT_TYPE_DEFAULT = 'other';

const INCIDENT_STATUSES = Object.freeze(['open', 'under_review', 'closed']);
const INCIDENT_STATUS_DEFAULT = 'open';

module.exports = {
  INCIDENT_TYPES,
  INCIDENT_TYPE_DEFAULT,
  INCIDENT_STATUSES,
  INCIDENT_STATUS_DEFAULT,
};
