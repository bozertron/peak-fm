# WAVE 0 BAR — the foundation gate

**Wave:** W-PEAK-00 · **Date:** 2026-09-19 · **Repo:** `/home/bozertron/peak-fm` (branch `main`, HEAD `8f27a6f`)
**Tickets:** PEAK-206 (test harness) · PEAK-207 (lint and format) · PEAK-208 (continuous integration)
**Derived from:** the three ticket files' Scope + Acceptance criteria + Verification evidence, and
`EXECUTION-HANDOFF.md` §5 (Wave 0 is a hard gate: nothing else merges before it).

This is the reference builders build against and **fresh-context critics grade the DISK by**. A critic
never reads a builder's report. A claim with no on-disk artifact and no pasted command output is not a
claim that happened.

---

## D1 — RESOLVED, and this is the ruling the whole wave is deployed under

`tickets/doctrine/AREA-107-agent-orchestration-protocol.md` requires the **11-rule** PROHIBITED block;
`tickets/doctrine/PROHIBITED.txt` contained **10** numbered rules plus its `STAY SHORT` closer. D1 was
open and it gates every governed wave.

**Ruling (design owner, this wave):** the canonical governed block is the **11-rule** block. Rules 1–10
are already byte-identical between the doctrine's referenced block and the repository file; rule 11 is
`NO GREP-ABSENCE = INTENT-ABSENCE`. Every agent prompt in this wave carries all 11 rules, and
`tickets/doctrine/PROHIBITED.txt` is updated to the 11-rule text so the two authorities agree again.
This closes D1 as *supplied by the owner*, not by invention.

---

## Environment, as measured (orchestrator probe — do not re-derive, do not contradict)

| Fact | Measured value |
|---|---|
| Node / pnpm | `v26.2.0` / `11.5.2`; dependencies installed |
| Postgres | **16.8, running** in podman container `peak-postgres`, `127.0.0.1:5432` |
| Connection | `postgres://peak:peak@127.0.0.1:5432/peak`; `.env.local` present with `BETTER_AUTH_SECRET` |
| Baseline gates | `pnpm db:check` → **38/38 verified**; `pnpm typecheck` → clean; `pnpm build` → clean (14 routes) |
| Missing gates | `pnpm lint` and `pnpm test` **do not exist** — this wave creates them |
| `psql` binary | **absent**. All database evidence must go through the `pg` client from Node |
| `peak` role rights | `rolsuper=f`, `rolcreatedb=f`; `CREATE SCHEMA` **allowed**, `CREATE DATABASE` **denied** |
| Scratch isolation | `CREATE SCHEMA peak_test` + `?options=-c search_path=peak_test,public` **works**: `scripts/db-migrate.mjs` reported **38/38 verified** inside the scratch schema, `public` untouched (53 tables), scratch schema dropped clean |
| Scratch naming | the harness makes the schema **per-process** (`peak_test_<pid>`) so two concurrent test processes never share one schema; the isolation proof is therefore `schema_name like 'peak_test_%'` = **0** after a run |
| Vitest | `5.0.1` runs TS + TSX + `@/*` tsconfig paths + real `pg` on this Node. `resolve.tsconfigPaths` is native; `test.poolOptions` **removed** in v4 |
| Biome | `2.5.14` runs on this Node; `rules.preset` is the current field (`recommended` is deprecated) |
| Stale trees | `.kilo/worktrees/*` are detached copies at `60f10dd` — never read, grep, or edit them; same for `.next/` and `node_modules/` |

**Named deviation, recorded rather than hidden:** PEAK-206's acceptance says the harness "creates its own
database". The `peak` role is **denied** `CREATE DATABASE` (measured), so the harness creates its own
**schema** (`peak_test_<pid>`) in the `peak` database — which is what the ticket's Scope names first, needs
no new grant, and was proven to satisfy the intent: the developer's working tables are never touched, and
no scratch state survives the run. Steady state is `public` = 53 tables, scratch schemas matching
`peak_test_%` = 0.

---

## The bar

### A. Test gate — `pnpm test` (PEAK-206)

| # | Requirement | How a critic proves it on the disk |
|---|---|---|
| A1 | `pnpm test` exists and runs | `pnpm test` exits 0; vitest output pasted with a non-zero test count |
| A2 | Tests create their own scratch schema, run the **real** migration runner against it, and drop it | `scripts/db-migrate.mjs` is invoked with `DATABASE_URL` pointed at the scratch schema; after `pnpm test`, `select count(*) from information_schema.schemata where schema_name='peak_test'` = **0** |
| A3 | The developer's working database is never touched | `public` table count is 53 before and after a `pnpm test` run |
| A4 | Real helpers exist, not described helpers | `createUser`, `signInAs`, `createListing`, `createThread`, `expectRejects` are importable and used by at least one example |
| A5 | One worked example per shape | a query test, a Server Action authorization test, and a concurrency test each exist under `tests/` and each **asserts something** |
| A6 | Authorization failure is an authorization error | the Server Action example, called with no session, asserts the action's own refusal (`{ ok: false, error: 'You are not signed in.' }`) — not a null dereference |
| A7 | The harness can express a race | the concurrency example runs two genuinely concurrent writers against one row and asserts **exactly one** succeeds |
| A8 | Kill-mutation: the tests actually bite | breaking an asserted value makes `pnpm test` **fail**; reverting makes it pass. Evidence = both outputs |

### B. Lint gate — `pnpm lint` (PEAK-207)

| # | Requirement | How a critic proves it on the disk |
|---|---|---|
| B1 | `pnpm lint` exists and **passes on the current tree** | `pnpm lint` exits 0 with output pasted |
| B2 | No mass reformat | the config commit's `git diff --stat` shows a small, file-by-file change set — **not** a 30-file whitespace sweep |
| B3 | The gate has been seen to fail | a durable negative control asserts that an **unused import** and an **empty catch** each make `biome lint` exit non-zero, and that a clean fixture exits 0. Critic kill-mutation: corrupt the fixture generator so the fixture is clean → the control test must FAIL |
| B4 | Doctrine rules are enforceable | `noUnusedVariables`, `noUnusedImports` = error; `noEmptyBlockStatements` = error; `noExplicitAny` = error; `useImportType` active |
| B5 | The nine genuine diagnostics on the untouched tree are resolved honestly | each of the nine is either fixed with real code, or reported with a written reason — never silenced, never suppressed, never disabled in config |
| B6 | Machine-generated files are not reformatted | `drizzle/meta/*.json` is outside the formatter's include set and byte-identical |
| B7 | No stale suppression survives | the dead `eslint-disable-next-line` in `components/surface.tsx` is gone, and the warning it was hiding is genuinely resolved |

**The nine diagnostics the untouched tree carries (measured):**

| File | Location | Rule | Severity |
|---|---|---|---|
| `lib/queries/listings.ts` | 1:29 | `correctness/noUnusedImports` | error |
| `lib/queries/plans.ts` | 1:29 | `correctness/noUnusedImports` | error |
| `lib/queries/trade.ts` | 1:25 | `correctness/noUnusedImports` | error |
| `lib/queries/admin.ts` | 2:8 | `style/useImportType` | warning |
| `components/auth-form.tsx` | 3:8 | `style/useImportType` | warning |
| `components/surface.tsx` | 100:17 | `performance/noImgElement` | warning |
| `components/peak-header.tsx` | 70:3 | `correctness/useExhaustiveDependencies` | error |
| `components/peak-header.tsx` | 90:15 | `a11y/useAriaPropsSupportedByRole` | error |
| `app/(app)/plans/page.tsx` | 62:18 | `style/noNonNullAssertion` | warning |

### C. CI gate — `.github/workflows/ci.yml` (PEAK-208)

| # | Requirement | How a critic proves it on the disk |
|---|---|---|
| C1 | The workflow runs on push and PR and installs with `--frozen-lockfile` | file present; YAML parses; steps 1–7 of the ticket's Scope are all present |
| C2 | Both failure classes this project has shipped are gated | Postgres service → `db:migrate` → `db:check` (the AREA-109 class) and a running server → `check:links` (the 18-dead-links class) are real steps, not comments |
| C3 | Concurrency group per branch | present |
| C4 | No step is skipped to make the run green | no `if: false`, no `continue-on-error` on a gate, no removed test |
| C5 | The three negative controls are tested, and what cannot be tested here is **named**, not implied | local negative-control output pasted for every gate that can be broken non-destructively; any gate that needs a GitHub push to prove is recorded on the ticket as an explicit open item |

### D. Wave hygiene (every ticket)

| # | Requirement |
|---|---|
| D1 | Every agent touched exactly one owned file; no builder touched a registrar file (`app/globals.css`, `lib/db/schema/index.ts`, `lib/surfaces.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`, `app/layout.tsx`, `package.json`, `drizzle.config.ts`) |
| D2 | Zero TODO/FIXME/placeholder/`throw new Error('not implemented')` introduced |
| D3 | Zero `.skip`/`xit`/`todo` tests; every test asserts something |
| D4 | No lint/typecheck/test disabled, loosened, or suppressed to force green |
| D5 | `scripts/check-links.mjs` `KNOWN_MISSING` untouched (it may only shrink, and this wave creates no routes) |
| D6 | `pnpm db:check` still reports 38/38; `pnpm typecheck` and `pnpm build` still clean |
| D7 | No agent committed anything; the orchestrator commits |

---

## Out of scope for this wave (do not do it, do not "fix" it in passing)

- Any Wave 1 ticket (PEAK-209/222/300/230/240) and any surface ticket.
- Renaming `package.json`'s `"name": "my-project"` — a real inconsistency, reported, not fixed here.
- `packageManager: pnpm@12.3.4` vs the lockfile written by pnpm 11.5.2 — a real inconsistency for CI,
  resolved inside `.github/workflows/ci.yml` only, and reported.
- Reformatting the existing tree. The formatter is configured and available; it is not a wave to run.
