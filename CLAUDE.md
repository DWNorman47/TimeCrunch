# OpsFloa — Claude Instructions

## Branching Rules
- **Always work on the `dev` branch.** Never commit or push directly to `main`.
- All changes go to `dev` first. Merges to `main` are done by the user via pull request.
- Before starting any work, ensure you are on the `dev` branch.

## Project
- App name: OpsFloa (Operations Flow Assistant)
- Domain: opsfloa.com (production), dev.opsfloa.com (development)
- Frontend: Vite + React, deployed on Vercel
- Backend: Node.js + Express, deployed on Render
- Database: PostgreSQL

## Fixed-value DB columns
- **`docs/db-enums.md` is the single source of truth** for every column
  that holds a fixed set of values (statuses, types, roles, kinds, etc).
- **Always read it before** writing or reviewing code that validates a
  fixed-value field, decides what value to write, or adds a new such
  column.
- **Always update it in the same change** when you add a new
  fixed-value column, change the allowed values, or change the DB
  enforcement state. The doc going stale defeats its whole purpose.
- New fixed-value columns should ideally land with both a shared
  constant in `server/constants/` AND a CHECK constraint or PG ENUM at
  the DB level. App-level validation alone is bypassable by raw SQL,
  webhooks, migrations, and future endpoints — the doc explains why.
