# DB Enum Reference

Single source of truth for every database column that holds a fixed
set of values. **Consult this file every time you write or review code
that validates against a fixed list, and update it whenever you add or
change one.**

For each column we record:
- The allowed values
- Whether the database itself enforces the set (CHECK constraint or PG
  ENUM) — `enforced` means a bad value is rejected at write time no
  matter the path; `app-only` means a bypass write (raw SQL, migration,
  Stripe webhook, future endpoint, manual `psql`) can corrupt the row.
- Where in code the application validates it.
- A short note on the stakes.

> **Not exhaustive.** First populated on 2026-04-30 by sweeping the repo;
> add to the file (and the corresponding migration / shared constant)
> any time you encounter a column not yet listed.

## Quick rules when touching a fixed-value field

1. **Look it up here first.** If the column isn't in the table below,
   grep the codebase for hardcoded lists and add it.
2. **Use one shared constant in code**, not a literal in every file.
   Server: `server/constants/<name>.js` exporting both the array and a
   `Default`. Client: import the same constant when feasible.
3. **Add a CHECK constraint** if the column doesn't have one. The
   constraint is the unbypassable backstop — application validators
   only protect paths that remember to call them. (See the
   `projects.status='active'` bug in commit `0249ac4` for the cost of
   skipping this.)
4. **Update this file in the same PR** so the registry doesn't drift
   from reality.

---

## High-stakes columns (payroll, billing, security, auth)

| Table.column | Allowed values | DB enforcement | App validation | Stakes |
|---|---|---|---|---|
| `companies.subscription_status` | `trial`, `active`, `past_due`, `canceled`, `trial_expired`, `exempt` | **app-only** | `server/routes/superadmin.js:74` | Billing gate — wrong value blocks or unblocks worker login. Stripe webhook (`stripe.js:166-197`) writes directly with no validation. |
| `companies.plan` | `free`, `starter`, `business` | **app-only** | `server/routes/superadmin.js:75` | Feature gating (worker limits, storage caps, plan-gated features). |
| `users.role` | `worker`, `admin`, `super_admin` | **app-only** | `server/permissions.js`, scattered checks | Auth boundary. A bad value can't escalate (permission system is allow-list) but can lock a user out of every module. |
| `users.role_id` (FK) | references `roles.id` | enforced (FK) | n/a | The new permission system. FK is the constraint. |
| `time_entries.status` | `pending`, `approved`, `rejected` | enforced (CHECK) | scattered UPDATEs in `server/routes/admin.js` | Approval workflow + payroll inclusion. Filters silently hide non-matching rows from the approval queue. |
| `projects.wage_type` | `regular`, `prevailing` | enforced (CHECK) | `server/routes/admin.js:1684` | Payroll calculation. `time_entries.wage_type` is inherited from project at clock-in; if a project somehow had a bad value, entries would too. |
| `users.rate_type` | `hourly`, `daily` | **app-only** | `server/routes/admin.js:1331` | Daily-rate pay calc + the day-mark feature gate (`day_mark_mode` requires `rate_type='daily'`). |
| `users.overtime_rule` (when set per-user) | `daily`, `weekly`, `none` | **app-only** | `server/routes/admin.js:1214` | Overtime calculation. A bad value silently falls back to `'daily'` rules. |
| `settings.value` (key=`overtime_rule`) | `daily`, `weekly` | **app-only** | `server/routes/admin.js` PATCH validation | Same as above but at company level. |
| `settings.value` (key=`invoice_signature`) | `none`, `optional`, `required` | **app-only** | `server/routes/admin.js` PATCH validation | Whether workers must sign invoices before exporting. |

## Medium-stakes columns (workflow / business logic)

| Table.column | Allowed values | DB enforcement | App validation | Stakes |
|---|---|---|---|---|
| `projects.status` | `planning`, `in_progress`, `on_hold`, `completed` | **app-only** | `server/routes/admin.js:1679` | Project tracking dashboards. **This was the cause of the conversion-bug fixed in `0249ac4`.** |
| `daily_reports.status` | `draft`, `submitted`, `reviewed` | **app-only** | `server/routes/dailyReports.js:199` | Daily-report workflow + edit lock. |
| `field_reports.status` | `draft`, `submitted`, `reviewed` | **app-only** | `server/routes/fieldReports.js:30` | Field-report workflow + edit lock (`fieldReports.js:172`). |
| `punchlist_items.status` | `open`, `in_progress`, `resolved`, `verified` | **app-only** | `server/routes/punchlist.js:105` | Punchlist filtering + closure tracking. |
| `punchlist_items.priority` | `low`, `normal`, `high`, `urgent` | **app-only** | `server/routes/punchlist.js:57` | Priority filter dropdown. |
| `incident_reports.type` | `near_miss`, `first_aid`, `recordable`, `lost_time`, `property_damage`, `other` | **app-only** | `server/routes/incidents.js:7` | Safety metrics + OSHA-style trend analysis. |
| `incident_reports.status` | `open`, `under_review`, `closed` | **app-only** | `server/routes/incidents.js:8` | Incident workflow. |
| `rfis.status` | `open`, `answered`, `closed` | **app-only** | `server/routes/rfis.js:80` | RFI workflow + reply gating. |
| `inspections.status` | `pass`, `fail`, `pending` | enforced (CHECK) | `server/routes/inspections.js:102` | Inspection results. (Only enum below this section already enforced at DB.) |
| `service_requests.status` | `new`, `in_review`, `converted`, `declined`, `spam` | **app-only** | `server/routes/serviceRequests.js:25` | Public-intake triage. |
| `time_off_requests.type` | `vacation`, `sick`, `personal`, `other` | **app-only** | `server/routes/timeOff.js:9` | PTO categorization for reports. |
| `time_off_requests.status` | `pending`, `approved`, `denied` | **app-only** (verify) | `server/routes/timeOff.js` | Approval workflow. |

## Cosmetic / UI columns

| Table.column | Allowed values | DB enforcement | App validation | Stakes |
|---|---|---|---|---|
| `users.language` | `English`, `Spanish` | **app-only** | `server/routes/admin.js:1045` | Default UI language. Wrong value silently falls back to English. |
| `users.worker_type` | `employee`, `contractor`, `subcontractor`, `owner` | **app-only** | `server/routes/admin.js:1217` | Display-only on worker profile. |
| `users.clock_source` (on `time_entries` and `active_clock`) | `worker`, `admin`, `log_entry`, `mark_day` | **app-only** | scattered INSERTs | Audit trail; cosmetic in current UI. |
| `inbox.type` | `approval`, `rejection`, `comment`, `announcement`, `inactive_workers`, `stale_active_clock`, `timeoff_request`, `timeoff_approved`, `timeoff_denied`, `shift_assigned`, `shift_updated`, `shift_cancelled`, `shift_cantmake`, `signoff`, `location_denied`, `overtime_alert`, `service_request` (likely incomplete) | **app-only** | scattered `createInboxItem` calls — no central list | Drives notification rendering / icon. New types added casually. |
| `inventory_items.locations[].type` | `warehouse`, `job_site`, `truck`, `other` | **app-only** | `server/routes/inventory.js:534` | Stock-location categorization. |
| `inventory_cycle_counts.type` | `cycle`, `full`, `audit`, `reconcile` | **app-only** | `server/routes/inventory.js:924` | Inventory audit type. |
| `audit_log.action` | open-ended verb strings (`entry.edited`, `worker.archived`, …) | not an enum | n/a | Free-text by design — log these as needed. Listed here so you don't accidentally try to constrain it. |

## Settings keys (`settings.key` allow-list)

`settings.key` is itself an enum-like column — only known keys should be
written. The allow-list is in `server/settingsDefaults.js`:

- `FEATURE_KEYS` — boolean flags (`feature_*`, `module_*`).
- `STRING_KEYS` — string-valued settings.
- Everything else is treated as numeric.

No DB CHECK on `settings.key`. PATCH `/admin/settings` validates against
the allowlist; raw INSERTs would not. Update `settingsDefaults.js`
**and** this file when adding a new key.

## Boolean-flag columns (no DB enforcement needed beyond `BOOLEAN`)

These are fixed-value but PG already enforces them via the column type.
Listed for completeness:

`users.active`, `users.day_mark_mode`, `users.mfa_enabled`, `projects.active`,
`projects.show_estimated_finish`, `time_entries.locked`,
`shifts.cant_make_it`, `companies.is_exempt`, etc.

---

## Open follow-ups

- Add CHECK constraints (or PG ENUM types) for every row marked
  **app-only** above. One migration per cluster (e.g. one for project +
  daily-report + field-report + punchlist statuses, one for incident
  types, etc.) keeps PR review tractable.
- Centralize each enum in `server/constants/<name>.js` with both the
  array and a `Default` export so the validation block becomes a
  one-line `import` rather than a literal.
- Stripe webhook handler (`server/routes/stripe.js`) currently writes
  `companies.subscription_status` directly without validating against
  the allowed set — easiest entry point for a corrupt value. Either
  whitelist the status before write OR rely on the CHECK constraint
  once added.
