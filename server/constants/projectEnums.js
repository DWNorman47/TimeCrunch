/**
 * Fixed-value enums for the `projects` table.
 *
 * Anyone validating, defaulting, or rendering one of these columns
 * should import from here instead of redeclaring the array. Keep this
 * file in sync with the CHECK constraints in migrations and with
 * `docs/db-enums.md`.
 */

const PROJECT_STATUSES = Object.freeze(['planning', 'in_progress', 'on_hold', 'completed']);
const PROJECT_STATUS_DEFAULT = 'in_progress';

const PROJECT_WAGE_TYPES = Object.freeze(['regular', 'prevailing']);
const PROJECT_WAGE_TYPE_DEFAULT = 'regular';

module.exports = {
  PROJECT_STATUSES,
  PROJECT_STATUS_DEFAULT,
  PROJECT_WAGE_TYPES,
  PROJECT_WAGE_TYPE_DEFAULT,
};
