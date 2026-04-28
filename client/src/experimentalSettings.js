/**
 * Experimental settings — UI-level kill-switch for toggles that exist in
 * the schema and are gated on the server, but whose UX hasn't been
 * decided. Flip ENABLED to true to expose the experimental section in
 * ManageRates → Company Settings; leave it false in checked-in code so
 * the section never renders for normal users.
 *
 * "Hidden in code" is the contract: this file is the only switch. There
 * is intentionally no DB row, env var, or per-user override — flipping
 * it means committing the change.
 *
 * If you reach for a value here, also wire the corresponding server-side
 * gate so the feature isn't half-implemented when the section turns on.
 */
export const EXPERIMENTAL_SETTINGS_ENABLED = false;

// Keys whose UI lives behind the experimental gate. Listed here so it's
// easy to see at a glance what's pending a final design call.
export const EXPERIMENTAL_FEATURE_KEYS = [
  'feature_admin_edit_time',
  'feature_worker_edit_time',
];
