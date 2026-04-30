/**
 * Fixed-value enums for the `users` table. See `docs/db-enums.md`
 * for the full registry. Where `users.role` lives in this file even
 * though it isn't constrained at the DB level — it's still a fixed
 * set the app cares about, and centralising the list here means a
 * future CHECK constraint has one obvious source.
 */

const USER_RATE_TYPES = Object.freeze(['hourly', 'daily']);
const USER_RATE_TYPE_DEFAULT = 'hourly';

const USER_OVERTIME_RULES = Object.freeze(['daily', 'weekly', 'none']);
const USER_OVERTIME_RULE_DEFAULT = 'daily';

const USER_LANGUAGES = Object.freeze(['English', 'Spanish']);
const USER_LANGUAGE_DEFAULT = 'English';

const USER_WORKER_TYPES = Object.freeze(['employee', 'contractor', 'subcontractor', 'owner']);
const USER_WORKER_TYPE_DEFAULT = 'employee';

const USER_ROLES = Object.freeze(['worker', 'admin', 'super_admin']);

module.exports = {
  USER_RATE_TYPES,
  USER_RATE_TYPE_DEFAULT,
  USER_OVERTIME_RULES,
  USER_OVERTIME_RULE_DEFAULT,
  USER_LANGUAGES,
  USER_LANGUAGE_DEFAULT,
  USER_WORKER_TYPES,
  USER_WORKER_TYPE_DEFAULT,
  USER_ROLES,
};
