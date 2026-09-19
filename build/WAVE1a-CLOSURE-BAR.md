# WAVE 1a-CLOSURE BAR — three residues, closed at the mechanism

**Wave:** W-PEAK-01a-closure · **Date:** 2026-09-19 · **Repo:** `/home/bozertron/peak-fm` (HEAD `08cf832`)
**Why this wave exists:** Wave 1a was verified and committed, and three findings were recorded on the ticket board rather than
left implicit (a killed test process leaks its scratch schema; a latent silent-failure hazard at the auth boundary; scoped test
runs need the env file). None of the three is decoration: the first accumulates in **every** future wave, and the second is a
silent security failure waiting for a config change. This wave closes all three and nothing else.

**Not this wave:** PEAK-222 (composer) and PEAK-300 (threads) — that is Wave 1b, composed after this disk is verified.

---

## 0. Environment, as measured

| Fact | Value |
|---|---|
| Gates at wave start | `db:check` 38/38 · `typecheck` clean · `lint` exit 0 (90 files) · `pnpm test` 16 files / **161 tests** exit 0 · `build` clean (14 routes) |
| Harness | per-process scratch schema `peak_test_<pid>`, created and migrated by the real `scripts/db-migrate.mjs`, dropped by teardown |
| **Scoped run form (measured the hard way)** | `pnpm test <path>` — because only the `pnpm test` script loads `.env.local`. `pnpm exec vitest run <path>` fails loudly with `BETTER_AUTH_SECRET is not set` |
| Live residue | 3 orphan schemas from killed test processes were dropped by hand this session; `peak_test_%` count is now 0 |
| Forbidden | reading/editing `.kilo/`, `.next/`, `node_modules/` (research reads of an installed package are fine; edits are not) |

## 1. Lanes

| Unit | Owns | Depends on |
|---|---|---|
| `cl-1` | `tests/setup/global-db.ts` **(MODIFY)**, `tests/setup/harness-hygiene.test.ts` **(NEW)** | — |
| `cl-2` | `lib/auth.ts` **(MODIFY, comment only)**, `tests/invites/enforcement.test.ts` **(MODIFY)** | — |
| `cl-3` | `AGENT-START-HERE.md` **(MODIFY)** | — |

Three units, three disjoint file sets, all three parallel-safe. **No unit may touch** `package.json`, `lib/db/schema/index.ts`,
`app/globals.css`, `lib/surfaces.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`, `app/layout.tsx`, `drizzle.config.ts`,
`scripts/check-links.mjs`, or any other ticket's files.

---

## 2. The three closures

### cl-1 — the harness must not leak scratch schemas

**The mechanism, not the symptom.** Teardown runs only when globalSetup resolves and the process exits cleanly, so a killed or
timed-out test process strands its schema forever — and because the name is per-pid, a later run never reuses it. Measured: three
orphans (`peak_test_1888021`, `_1892144`, `_1956625`) after one wave.

**Required shape** (pinned, because the naming scheme is what makes staleness decidable):

```ts
export const TEST_SCHEMA_PREFIX = 'peak_test_'
/** A live test process is minutes old; two hours cannot race a concurrent run. */
export const TEST_SCHEMA_MAX_AGE_MS = 2 * 60 * 60 * 1000

/** Unique per process AND carrying the moment it was made, so age is decidable. */
export function schemaNameFor(nowMs: number, pid: number): string        // peak_test_<epochMs>_<pid>
export function parseSchemaMadeAt(name: string): number | null           // null when the name is not ours
export function staleSchemaNames(existing: string[], nowMs: number, maxAgeMs?: number): string[]
/** Drops the stale ones; returns what it dropped. */
export async function sweepStaleScratchSchemas(pool: Pool, nowMs: number): Promise<string[]>
```

**Acceptance**

| # | Requirement | Proof |
|---|---|---|
| cl1.A1 | The schema name carries its creation time and stays unique per process | the pure helpers are asserted directly: a name round-trips through `parseSchemaMadeAt`, and two calls with different pids differ |
| cl1.A2 | A stale schema is swept before the run's own schema is created | a REAL test creates a schema named with an old timestamp **and** one named with a fresh timestamp, calls the sweep, and asserts the stale one is gone and **the fresh one still exists** |
| cl1.A3 | The sweep cannot drop a schema it does not recognise | a name like `peak_test_<pid>` (the old scheme, no timestamp) or `peak_other` is left alone and reported, never silently dropped |
| cl1.A4 | The sweep never races a live run | `TEST_SCHEMA_MAX_AGE_MS` is exported with its rationale, and a schema younger than the threshold is never dropped (cl1.A2's fresh case is exactly this assertion) |
| cl1.A5 | The run still works end to end | `pnpm test` green, with the scratch schema created, migrated, verified and dropped — and `peak_test_%` count 0 after |

**Kill-mutation (mandatory):** remove the age comparison from `staleSchemaNames` so everything looks stale, re-run `harness-hygiene.test.ts`,
and confirm the **fresh-schema assertion FAILS**. Restore and confirm green. That mutation is the difference between a sweep and a
schema deleter.

### cl-2 — the refusal must be client-visible, not a synthetic success

**The hazard, cited.** Better Auth's sign-up route branches on
`node_modules/better-auth/dist/api/routes/sign-up.mjs:234` — `if (e.statusCode === 403 && shouldReturnGenericDuplicateResponse) return buildGenericDuplicateResponse()` —
where the flag is `requireEmailVerification || autoSignIn === false` (`:162`). `lib/auth.ts` sets `emailAndPassword: { enabled: true, autoSignIn: true }`
and no `requireEmailVerification`, so the branch is **dead today** and every refusal is a clean 403 (measured in Wave 1a across 13 attack classes).
But the invite refusal **is** a 403: flipping either knob would make a refused sign-up return **HTTP 200 with a synthetic success shape**, and the
client (`result.error === undefined`) would redirect into a session that does not exist — a silent security failure, with no error anywhere (rule 2).

**Acceptance**

| # | Requirement | Proof |
|---|---|---|
| cl2.A1 | The refusal is asserted on the **client-visible** response, not only in the database | a test asserts the HTTP status of an uninvited sign-up is 403 and the body carries the refusal, while `countRows('user')` is unchanged |
| cl2.A2 | The synthetic-success shape is explicitly excluded | the same test asserts the body does **not** carry the generic-duplicate success shape (no `token`, no user object), with a comment naming the upstream branch it guards against |
| cl2.A3 | The coupling is legible at the code site | `lib/auth.ts`'s refusal path carries a comment naming the exact upstream file:line and stating that `autoSignIn: true` (and no `requireEmailVerification`) is what keeps the branch dead. **Comment only — no behaviour change, and no config change** |
| cl2.A4 | Flipping a config knob breaks a test rather than a user | the critic's kill-mutation below produces a FAILING test, not a passing suite |

**Kill-mutation (mandatory for the critic, and attempted by the builder):** temporarily set `autoSignIn: false` in `lib/auth.ts`,
run the enforcement test, and record what happens. If the new assertions do **not** catch it, they are decoration — fix them until they do.
Restore the config and prove the tree is byte-identical to the start (`git diff --stat` + `md5sum lib/auth.ts`).

### cl-3 — the scoped-run form is written down where agents read it

The measured failure: `pnpm exec vitest run tests/x.test.ts` → `Error: BETTER_AUTH_SECRET is not set … Refusing to invent a secret.`
(The harness guard is correct; the invocation was wrong.) Only `pnpm test` loads `.env.local` through `--env-file-if-exists`.

**Acceptance**

| # | Requirement | Proof |
|---|---|---|
| cl3.A1 | `AGENT-START-HERE.md` section 6 states the scoped form next to the definition of done | the file shows `pnpm test` for the full suite and `pnpm test <path>` for one file, and says why the difference matters |
| cl3.A2 | No hedge or stale claim is introduced | the DoD block still lists exactly the real gates; nothing is added that does not exist (`format`, `smoke` are not DoD gates on this machine) |

---

## 3. Wave hygiene (every unit)

| # | Requirement |
|---|---|
| D1 | Exactly the lanes above; no registrar-owned file touched; no dependency, no table, no migration, no `package.json` change |
| D2 | Zero TODO/FIXME/placeholder; zero assertion-free tests; zero `.skip`/`.only`/`xit`; zero suppression comments |
| D3 | `pnpm lint` / `typecheck` / `build` / `db:check` / `pnpm test` all green at the end, with real output |
| D4 | Zero scratch schemas left behind after the final run |
| D5 | No agent committed |
