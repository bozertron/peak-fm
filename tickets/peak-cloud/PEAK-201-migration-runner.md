# [PEAK-201] Migration runner and schema verification

- Priority: P0 · Area: Foundation · Status: **DONE — verified**
- Dependencies: PEAK-200
- Risk: operations / data
- Closes: the AREA-109 root cause

## Intent
AREA-109 traced a production sign-in 500 to the fact that **no deploy step ever
created the tables**, and nothing detected it because nothing checked. Make that
class of failure impossible to ship silently.

## Delivered
`scripts/db-migrate.mjs`, three stages:

1. **Better Auth planner** — owns its 4 tables and Peak's added `user` columns.
   Runs first so `user` exists before foreign keys reference it.
2. **Generated Drizzle SQL** — `drizzle/*.sql` from `pnpm db:generate`, tracked
   in `_peak_migration`. Each statement runs inside a savepoint; a duplicate is
   tolerated **only** for the four Better-Auth-owned tables. Every other
   duplicate fails the migration loudly.
3. **Verify** — walks the Drizzle schema via `getTableConfig` and asserts every
   table and column exists. Non-zero exit on mismatch.

Stage 2b reconciles the drift where Better Auth creates additional fields as
nullable with no DB default while Drizzle declares them NOT NULL — otherwise
TypeScript would claim non-null on a nullable column.

`pnpm db:check` runs stage 3 alone.

## Acceptance criteria
- Given a fresh database, when `pnpm db:migrate` runs, then 38/38 tables verify.
- Given an already-migrated database, when it runs again, then it is a no-op.
- Given a missing table, when `pnpm db:check` runs, then it exits non-zero and
  names the table.

## Verification evidence
```
first run:  applied 4 change(s) / 152 statement(s), 4 skipped / 38 of 38 verified
second run: already up to date / skip (already applied) / 38 of 38 verified
user columns: role|NO|'member'::text   avatarKind|NO|'initials'::text
```

## Follow-through
**`pnpm db:check` must be wired as a predeploy gate — PEAK-250.** The runner
being correct is worth nothing if deploy never calls it.
