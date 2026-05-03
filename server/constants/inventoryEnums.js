/**
 * Fixed-value enums for inventory tables. See `docs/db-enums.md`
 * for the full registry.
 *
 * Note: `inventory_items.locations[].type` is also enum-like but lives
 * inside a JSON-shaped column, which CHECK constraints handle awkwardly.
 * Centralising it here so the app side has one source of truth even
 * though the DB can't enforce.
 */

const INVENTORY_COUNT_TYPES = Object.freeze(['cycle', 'full', 'audit', 'reconcile']);
const INVENTORY_COUNT_TYPE_DEFAULT = 'cycle';

const INVENTORY_LOCATION_TYPES = Object.freeze(['warehouse', 'job_site', 'truck', 'other']);
const INVENTORY_LOCATION_TYPE_DEFAULT = 'other';

module.exports = {
  INVENTORY_COUNT_TYPES,
  INVENTORY_COUNT_TYPE_DEFAULT,
  INVENTORY_LOCATION_TYPES,
  INVENTORY_LOCATION_TYPE_DEFAULT,
};
