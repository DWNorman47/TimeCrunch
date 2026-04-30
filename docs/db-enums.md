# DB Enum Reference

Single source of truth for every database column that holds a fixed
set of values. **Consult this file every time you write or review code
that validates against a fixed list, and update it whenever you add or
change one.**

For each column we record:
- Allowed values
- DB enforcement state — `enforced` means a CHECK constraint or PG ENUM
  rejects bad values at write time no matter the path; `app-only` means
  a bypass write (raw SQL, migration, Stripe webhook, future endpoint,
  manual `psql`) can corrupt the row.
- Where validation lives in code.
- A short note on stakes.

> **History.** First populated 2026-04-30 after the
> `projects.status='active'` bug. Significantly revised same day after a
> full-codebase audit revealed (a) migration 0071 had quietly enforced
> many columns I'd marked app-only, and (b) three CHECK constraints had
> drifted from the route code (daily_reports / field_reports /
> incident_reports `.status`) — fixed in migration 0100.

## Quick rules when touching a fixed-value field

1. **Look it up here first.** If the column isn't listed, grep the
   codebase for hardcoded lists (`VALID_*`, `].includes(`,
   `<option value=`) and add an entry.
2. **Use one shared constant in code**, not a literal in every file.
   Server: `server/constants/<name>.js` exporting both the array and a
   `Default`. Client: import the same constant when feasible.
3. **Add a CHECK constraint** if the column doesn't have one. The
   constraint is the unbypassable backstop — application validators
   only protect paths that remember to call them. (See `0249ac4` for
   the cost of skipping this.)
4. **When extending an enum**, drop and re-add the CHECK in the same
   migration — don't expect 0071-style historical constraints to
   silently accept the new value. (See `0100` for an example.)
5. **Update this file in the same PR** so the registry doesn't drift.

---

## High-stakes columns (payroll, billing, security, auth)

| Table.column | Allowed values | DB enforcement | App validation | Stakes |
|---|---|---|---|---|
| `companies.subscription_status` | `trial`, `active`, `past_due`, `canceled`, `trial_expired`, `exempt` | **app-only** | `server/routes/superadmin.js:74` | Billing gate. Stripe webhook (`stripe.js:166-197`) writes `obj.status` directly with no app-side validation, relying on Stripe's API to send only known values. A future Stripe-side change could land an unknown value; CHECK constraint would catch it. |
| `companies.plan` | `free`, `starter`, `business` | **app-only** | `server/routes/superadmin.js:75` | Feature gating (worker limits, storage caps, plan-gated features). |
| `users.role` | `worker`, `admin`, `super_admin` | **app-only** | `server/permissions.js`, scattered checks | Auth boundary. Permission system is allow-list, so a bad value can't escalate — but it can lock a user out of every module. |
| `users.role_id` (FK) | references `roles.id` | enforced (FK) | n/a | The new permission system. FK is the constraint. |
| `time_entries.status` | `pending`, `approved`, `rejected` | **enforced** (CHECK) | scattered UPDATEs in `server/routes/admin.js` | Approval workflow + payroll inclusion. |
| `time_entries.clock_source` | `worker`, `admin`, `log_entry` | **enforced** (CHECK in `0071`) | scattered INSERTs | Audit trail; the constraint blocks any unknown source from being recorded. |
| `active_clock.clock_source` | `worker`, `admin` | **enforced** (CHECK in `0071`) | `server/routes/clock.js`, `server/routes/admin.js` clock-in paths | Same idea; tighter set because admin/worker are the only callers that create active_clock rows. |
| `projects.wage_type` | `regular`, `prevailing` | **enforced** (CHECK) | `server/routes/admin.js:1684` | Payroll calculation. `time_entries.wage_type` inherits this. |
| `users.rate_type` | `hourly`, `daily` | **app-only** | `server/routes/admin.js:1331` | Daily-rate pay calc + `day_mark_mode` gate. |
| `users.overtime_rule` (per-user) | `daily`, `weekly`, `none` | **app-only** | `server/routes/admin.js:1214` | Overtime calculation. Bad value silently falls back to `daily` rules. |
| `users.worker_type` | `employee`, `contractor`, `subcontractor`, `owner` | **enforced** (CHECK in `0071`) | `server/routes/admin.js:1217` | Display + report filtering on worker profile. |
| `reimbursements.status` | `pending`, `approved`, `rejected` | **enforced** (CHECK in `0071`) | `server/routes/reimbursements.js` | Financial workflow. |
| `settings.value` (key=`overtime_rule`) | `daily`, `weekly` | **app-only** | `server/routes/admin.js` PATCH validation | Company-wide overtime calc. |
| `settings.value` (key=`invoice_signature`) | `none`, `optional`, `required` | **app-only** | `server/routes/admin.js` PATCH validation | Whether workers must sign invoices before exporting. |

## Medium-stakes columns (workflow / business logic)

| Table.column | Allowed values | DB enforcement | App validation | Stakes |
|---|---|---|---|---|
| `projects.status` | `planning`, `in_progress`, `on_hold`, `completed` | **app-only** | `server/routes/admin.js:1679` | Project tracking dashboards. **Caused the bug fixed in `0249ac4`.** Top candidate for a CHECK constraint. |
| `daily_reports.status` | `draft`, `submitted`, `reviewed` | **enforced** (CHECK in `0100`, was wrong in `0071`) | `server/routes/dailyReports.js:199` | Daily-report workflow + edit lock. `0071` had `approved` instead; `0100` corrects to `reviewed`. |
| `field_reports.status` | `draft`, `submitted`, `reviewed` | **enforced** (CHECK in `0100`, was missing `draft` in `0071`) | `server/routes/fieldReports.js:30` | Field-report workflow + edit lock. |
| `incident_reports.status` | `open`, `under_review`, `closed` | **enforced** (CHECK in `0100`, was missing `under_review` in `0071`) | `server/routes/incidents.js:8` | Incident workflow. |
| `incident_reports.type` | `near_miss`, `first_aid`, `recordable`, `lost_time`, `property_damage`, `other` | **app-only** | `server/routes/incidents.js:7` | Safety / OSHA-style metrics. Top follow-up candidate for CHECK. |
| `punchlist_items.status` | `open`, `in_progress`, `resolved`, `verified` | **app-only** | `server/routes/punchlist.js:105` | Punchlist filtering + closure tracking. |
| `punchlist_items.priority` | `low`, `normal`, `high`, `urgent` | **app-only** | `server/routes/punchlist.js:57` | Priority filter dropdown. |
| `rfis.status` | `open`, `answered`, `closed` | **enforced** (CHECK in `0071`) | `server/routes/rfis.js:80` | RFI workflow + reply gating. |
| `inspections.status` | `pass`, `fail`, `pending` | **enforced** (CHECK) | `server/routes/inspections.js:102` | Inspection results. |
| `service_requests.status` | `new`, `in_review`, `converted`, `declined`, `spam` | **app-only** | `server/routes/serviceRequests.js:25` | Public-intake triage. |
| `time_off_requests.status` | `pending`, `approved`, `denied` | **enforced** (CHECK in `0071`) | `server/routes/timeOff.js:101,159` | PTO approval workflow. |
| `time_off_requests.type` | `vacation`, `sick`, `personal`, `other` | **enforced** (CHECK in `0071`) | `server/routes/timeOff.js:9` | PTO categorization for reports. |
| `qbo_sync_errors.entity_type` | `time_entry`, `reimbursement` | **enforced** (CHECK in `0071`) | `server/services/qbo.js` (writes only) | Discriminator for the QBO error log. |
| `project_invoices.payment_status` | `unknown`, `paid`, `partial`, `unpaid` | **enforced** (CHECK in `0071`) | (verify route) | Invoice payment tracking. |

## Cosmetic / UI columns

| Table.column | Allowed values | DB enforcement | App validation | Stakes |
|---|---|---|---|---|
| `users.language` | `English`, `Spanish` | **app-only** | `server/routes/admin.js:1045` | Default UI language. |
| `inbox.type` | open-ended (see note) | **app-only** | scattered `createInboxItem` calls — no central list | Drives notification icon / routing. New types added casually; treating it as a closed enum would require a refactor first. |
| `inventory_items.locations[].type` | `warehouse`, `job_site`, `truck`, `other` | **app-only** | `server/routes/inventory.js:534` | Stock-location categorization. |
| `inventory_cycle_counts.type` | `cycle`, `full`, `audit`, `reconcile` | **app-only** | `server/routes/inventory.js:924` | Inventory audit type. |

### `inbox.type` — the unfinished one

`inbox.type` is the most-written, least-constrained enum-like column in
the codebase. Every `createInboxItem(...)` and `createInboxItemBatch(...)`
call uses a free-form string. Currently observed values across the
server (probably incomplete):

`approval`, `rejection`, `comment`, `announcement`, `inactive_workers`,
`stale_active_clock`, `timeoff_request`, `timeoff_approved`,
`timeoff_denied`, `shift_assigned`, `shift_updated`, `shift_cancelled`,
`shift_cantmake`, `signoff`, `location_denied`, `overtime_alert`,
`service_request`, `low_stock`, `equipment_maintenance`.

Before constraining: collect the canonical list into
`server/constants/inboxTypes.js`, route every existing call through it,
THEN add a CHECK constraint that matches.

## Settings keys (`settings.key` allow-list)

`settings.key` is itself an enum-like column — only known keys should be
written. The allow-list lives in `server/settingsDefaults.js`:

- `FEATURE_KEYS` — boolean flags (`feature_*`, `module_*`).
- `STRING_KEYS` — string-valued settings.
- Everything else is treated as numeric.

No DB CHECK on `settings.key`. PATCH `/admin/settings` validates against
the allowlist; raw INSERTs would not. Update `settingsDefaults.js`
**and** this file when adding a new key.

## Boolean-flag columns

These are fixed-value but Postgres enforces them via the `BOOLEAN` type.
Listed for completeness so they're not flagged as gaps:

`users.active`, `users.day_mark_mode`, `users.mfa_enabled`,
`projects.active`, `time_entries.locked`, `shifts.cant_make_it`,
`companies.is_exempt`, etc.

---

## Open follow-ups

CHECK constraints still missing on app-only columns (in priority order):

1. **`projects.status`** — already caused one bug (`0249ac4`). Cheap fix.
2. **`incident_reports.type`** — safety-reporting metric, easy enum.
3. **`punchlist_items.status`** + **`punchlist_items.priority`** — small enum, lots of writes.
4. **`service_requests.status`** — public-intake triage.
5. **`users.rate_type`** + **`users.overtime_rule`** — payroll math depends on these.
6. **`companies.subscription_status`** + **`companies.plan`** — see Stripe-webhook concern under high-stakes.
7. **`users.language`**, **`inventory_items.locations[].type`**, **`inventory_cycle_counts.type`** — cosmetic, lower urgency.
8. **`inbox.type`** — needs a code refactor (centralize call sites) before a CHECK is realistic.

Other structural follow-ups:

- Centralize each enum in `server/constants/<name>.js` exporting the
  array and a `Default`. Reduces drift between sites and gives the
  client a clean import path too.
- Stripe webhook (`server/routes/stripe.js`) writes
  `companies.subscription_status` directly. Either whitelist the value
  before write or rely on a future CHECK constraint.
