/**
 * Fixed-value enums for the `punchlist_items` table. See
 * `docs/db-enums.md` for the full registry.
 */

const PUNCHLIST_STATUSES = Object.freeze(['open', 'in_progress', 'resolved', 'verified']);
const PUNCHLIST_STATUS_DEFAULT = 'open';

const PUNCHLIST_PRIORITIES = Object.freeze(['low', 'normal', 'high', 'urgent']);
const PUNCHLIST_PRIORITY_DEFAULT = 'normal';

module.exports = {
  PUNCHLIST_STATUSES,
  PUNCHLIST_STATUS_DEFAULT,
  PUNCHLIST_PRIORITIES,
  PUNCHLIST_PRIORITY_DEFAULT,
};
