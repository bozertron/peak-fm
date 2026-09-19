# WAVE 0 · FIX ROUND 1 — closing the critic's largest gap (A1)

**Wave:** W-PEAK-00 (PEAK-206 / PEAK-207 / PEAK-208) · **Repo:** `/home/bozertron/peak-fm`, branch `main`, HEAD `8f27a6f`
**Gap given to me:** `pnpm test` exits 1; bar A1 ("`pnpm test` exits 0") unmet because
`tests/setup/global-db.ts` isolates by scratch SCHEMA while `drizzle/0000_peak_cloud_domain.sql` hardcodes every
foreign key as `REFERENCES "public"."<table>"`.
**Verdict after the fix:** `pnpm test` → **exit 0**, `Test Files 5 passed (5)` / `Tests 19 passed (19)`.

---

## GAP REPRODUCED — before touching anything

```
$ cd /home/bozertron/peak-fm && pnpm test
...
 FAIL  tests/examples/action-authz.test.ts > updateProfile refuses callers without a session (PEAK-206 worked example) > applies the change for a caller carrying a real session cookie
 FAIL  tests/examples/action-authz.test.ts > updateProfile refuses callers without a session (PEAK-206 worked example) > refuses a too-short name with that rule's own message, and writes nothing
error: insert or update on table "account" violates foreign key constraint "account_userId_user_id_fk"
...
 Test Files  1 failed | 3 passed (4)
      Tests  2 failed | 12 passed (14)
[test-db] teardown complete: "peak_test_1836638" is gone and the pool is closed
[ELIFECYCLE] Test failed. See above for more details.
EXIT=1
```

Exactly the critic's signature, reproduced on the first run. `grep -c 'REFERENCES "public"' drizzle/0000_peak_cloud_domain.sql`
= **61**.

## WHY IT HAPPENED — measured in a fresh scratch schema, not inferred

`drizzle/0000_peak_cloud_domain.sql` is machine-generated and emits schema-qualified targets, because drizzle-kit
writes the schema name it generated against. The harness runs the **real** runner with
`search_path = peak_test_<pid>, public`, so every `CREATE TABLE` lands in the scratch schema while every
`ALTER TABLE ... ADD CONSTRAINT` still aims its key back at `public`. `pg_constraint`, read inside a freshly
migrated scratch schema:

```
FK_TOTAL= 63 EXTERNAL= 61 INTERNAL= 2
EXTERNAL_TABLES= ["account","accounting_record",...,"trade_offer"]   (34 tables)
INTERNAL_CONSTRAINTS= ["account_userId_fkey","session_userId_fkey"]  (Better Auth's own, unqualified)
SAMPLE_EXTERNAL= {"conname":"account_userId_user_id_fk", ... "tgt_schema":"public","tgt_table":"user",
                  "conkey":[4],"confkey":[1],"confdeltype":"c","confupdtype":"a","confmatchtype":"s",
                  "condeferrable":false,"condeferred":false}
```

Consequences, in order of severity:

1. The constraints **create cleanly** (`public` really does hold those tables), so setup reports success and the
   failure is pushed into every write that crosses a key — `account` for the auth example, `listing` for
   `createListing()`, `thread_participant` for `createThread()`. That is why only the two FK-free examples
   (`market`, `beta_invite`) ever passed and the suite *looked* mostly healthy.
2. Any write that did satisfy a key would be validated against **the developer's real data** — a fixture that
   silently stops being a fixture. Isolation was reported as "the developer database is never touched" on the
   strength of writes that never happened.

## THE FIX — one new step in the harness; **no generated file and no shared runner was touched**

| File | Change |
|---|---|
| `tests/setup/global-db.ts` | new `repointForeignKeys()` (lines 274–372) + its catalog query `EXTERNAL_FOREIGN_KEYS` (203–237), code maps `MATCH_TYPES` (239) / `REFERENTIAL_ACTIONS` (246), `codeFor()` lookup guard (255), called as step 5/7 (line 532); step numbering 1/6…6/6 → 1/7…7/7 |
| `tests/helpers/db.ts` | `quoteIdentifier` is now exported (line 78) and its two error messages say "identifier" instead of "table name" — one quoting implementation shared by both DDL writers |
| `tests/examples/factories.test.ts` | **new** (170 lines, 5 tests): the copyable factory example + the standing regression test for this defect |

**What it does.** Immediately after the real runner reports `Schema is consistent.` and before any worker can
connect, every foreign key in the scratch schema whose target lives in another schema is dropped and re-added
against the same-named table inside the scratch schema. Everything `pg_constraint` records is preserved: the
constraint name, `conkey`/`confkey` column order, `confmatchtype`, `confdeltype`, `confupdtype` and
deferrability. The whole rewrite is one transaction.

**Why the fix lives here and not in the SQL.** `drizzle/0000_peak_cloud_domain.sql` is generated and
`scripts/db-migrate.mjs` is PEAK-201's committed production runner. Rewriting either would change the
production migration path to serve a test-only concern. The harness's job is to build a *complete* fixture;
a migrated shape whose keys escape the schema is not complete, so closing the referential graph belongs to
the harness. A2 still holds: the DDL is 100 % the real runner's — this step only re-points it.

**It refuses to guess, at three points (no silent fallbacks):**

- the aggregate casts `att.attname::text` — without it `array_agg` returns `name[]`, an OID `pg` has no parser
  for, and it hands back the *string* `{userId}` (measured: `typeof source_columns === 'string'`), which the
  first draft crashed on rather than mis-inserting;
- a target table missing from the scratch schema, or an unrecognised `MATCH`/referential-action code, throws
  with the offending constraint named (`codeFor`);
- the closing query is the assertion: **zero** keys may reference another schema. A future migration that
  reintroduces a qualified key fails the run instead of quietly rebuilding this bug.

## PROOF

**(1) The gate the critic used — `pnpm test`, after the fix:**

```
$ cd /home/bozertron/peak-fm && pnpm test
[test-db] 1/7 schema=peak_test_1842153 admin=postgres://peak:***@127.0.0.1:5432/peak
[test-db] 2/7 reset: dropped (if it existed) and created schema "peak_test_1842153"
[test-db] 3/7 migrating: node scripts/db-migrate.mjs (scratch schema, real runner)
[test-db]     apply   0000_peak_cloud_domain.sql — 152 statement(s), 4 skipped (Better Auth owns them)
[test-db]     38/38 table(s) verified
[test-db] 4/7 verified: 38/38 application table(s) present in "peak_test_1842153" (journal: _peak_migration)
[test-db] 5/7 referential graph: re-pointed 61 foreign key(s) across 34 table(s) to "peak_test_1842153" — every key now resolves locally
[test-db] 6/7 exported PEAK_TEST_SCHEMA, PEAK_TEST_DATABASE_URL, DATABASE_URL
 Test Files  5 passed (5)
      Tests  19 passed (19)
   Start at  20:19:17
   Duration  37.59s
[test-db] 7/7 teardown: dropping schema "peak_test_1842153" CASCADE and ending the pool
[test-db] teardown complete: "peak_test_1842153" is gone and the pool is closed
PNPM_TEST_EXIT=0
```

The two example shapes the harness could not previously express are now green (`factories.test.ts`: a listing
with a real seller, a thread with two participants, plus the duplicate-participant guard and the FK closure).

**(2) A3 isolation re-proved by catalog read (before my mutations and after the full run):**

```
ISOLATION BEFORE MUTATIONS: public_tables = 53 | scratch_schemas = 0
ISOLATION AFTER:            public_tables = 53 | scratch_schemas = 0 | public.user_rows = 0
```

**(3) Every other gate still green:**

```
$ pnpm lint        → Checked 68 files in 57ms. No fixes applied.                      LINT_EXIT=0
$ pnpm typecheck   → $ tsc --noEmit                                                   TYPECHECK_EXIT=0
$ pnpm db:check    → 38/38 table(s) verified / Schema is consistent.                  DBCHECK_EXIT=0
$ pnpm build       → BUILD_EXIT=0
```

## MUTATIONS — the fix and its controls genuinely bite

Each mutation was applied by a scripted string replacement, run, and reverted; the file was then compared
against a pre-mutation backup and SHA-256 re-checked.

| # | Mutation | Result |
|---|---|---|
| M3 | remove the `repointForeignKeys` call (the pre-fix tree) — run `tests/examples/action-authz.test.ts` | `EXIT=1`, `Tests 2 failed \| 1 passed (3)`, `error: insert or update on table "account" violates foreign key constraint "account_userId_user_id_fk"` — the critic's A1 failure, reproduced by reverting only my fix |
| M4 | keep the rewrite but re-add each key against its catalog **original** target | `EXIT=1`, setup throws: `Error: [test-db] 61 foreign key(s) in "peak_test_1841820" still point at another schema after the re-point: account.account_userId_user_id_fk -> public.user, …` (all 61 named) — the closing assertion is a real gate |
| M5 | same as M3, run the **new** regression file alone | `EXIT=1`, `Tests 4 failed \| 1 passed (5)`: `violates foreign key constraint "listing_sellerId_user_id_fk"` (the defect the critic named in `createListing`), `"thread_participant_threadId_thread_id_fk"`, and `AssertionError: expected [ { …(4) }, …, …(58) ] to deeply equal []` on the FK-closure test |
| restore | `cp` backup over the file | `diff -q` clean, `sha256sum tests/setup/global-db.ts` = `8bd7dc8b8f8bb0174900a7b33d3fdd73e15f31bed4237bab32840f9f3d6b3480` (identical to the pre-mutation value) |

Post-restore, the full suite was re-run from that exact byte state → `PNPM_TEST_EXIT=0`, `Tests 19 passed (19)`.

## SCOPE NOTE — files I edited that another unit owns

Everything I touched is under `tests/**`, i.e. PEAK-206's own ownership unit, and the largest gap was assigned
to this wave's harness. I did **not** edit `drizzle/0000_peak_cloud_domain.sql` (generated, and B6/D-checks
depend on it being byte-identical), `scripts/db-migrate.mjs` (PEAK-201, committed), `package.json`,
`vitest.config.ts`, or anything the sequential registrar owns. `git status --short` is unchanged from the wave
baseline apart from my report landing in `build/`.

## ANYTHING STILL OPEN

1. **A4's "used by at least one example" half is now closed by me, not by the original builder.** The critic
   correctly found `createListing`/`createThread` had zero call sites; `tests/examples/factories.test.ts` gives
   both a real call site with assertions. Flagging it because it is a second bar row improved by this fix.
2. **The generated SQL is still public-qualified, deliberately.** Re-generating it with an unqualified form
   would be a nicer long-term answer, but `drizzle.config.ts` / drizzle-kit generation is registrar-owned and
   changing generated output is out of this ticket's scope. The harness now fails loudly if a future migration
   reintroduces the shape, which is the durable guard.
3. **`pnpm exec vitest run <file>` still bypasses `--env-file-if-exists=.env.local`** (pre-existing, noted by
   the critic): running a single file directly fails with `BETTER_AUTH_SECRET is not set` from
   `tests/setup/db-env.ts`. I used
   `node --env-file-if-exists=.env.local ./node_modules/vitest/vitest.mjs run <file>` for the single-file
   runs above. `pnpm test` itself is correct; only the raw `pnpm exec vitest` path is affected.
4. **CI execution is still unverified locally** (no docker CLI on PATH) — unchanged from the critic's C2 note;
   the `Test` step now runs a passing `pnpm test`, which is what this fix changes.
