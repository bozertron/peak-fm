/**
 * tests/setup/harness-lifecycle.test.ts — cx-2: the sweep's INVOCATION must be
 * assertable, not just the sweep function.
 *
 * THE MEASURED GAP THIS FILE CLOSES. `tests/setup/harness-hygiene.test.ts` calls
 * `sweepStaleScratchSchemas(pool, now)` DIRECTLY, so it proves the function
 * works. It does not prove the harness ever calls it. Measured by a blind critic
 * on the previous wave: replacing the one sweep line inside `globalSetup` with
 * `const swept: string[] = []` left the ENTIRE suite green (170/170) while an
 * orphaned `peak_test_<epoch>_<pid>` schema survived the run forever. The
 * protection was correct and silently removable.
 *
 * THE FIX, AND THIS FILE'S JOB. The sequence `globalSetup` performs (sweep →
 * drop/create → migrate with the real runner → verify 38 tables → re-point the
 * foreign keys → export the handles) now lives in the exported
 * `prepareScratchSchema(pool, nowMs, pid)`, and `globalSetup` is a thin caller of
 * it. This file calls that SAME function — the very path the run uses — so
 * deleting the sweep from the lifecycle breaks the assertion below instead of
 * passing unnoticed.
 *
 * WHAT THE ASSERTIONS PROVE:
 *   1. a REAL stale schema (epoch well past `TEST_SCHEMA_MAX_AGE_MS`) is GONE
 *      after the lifecycle runs                                    → schemaExists false
 *   2. a REAL fresh schema (this epoch) SURVIVES — the half that separates a
 *      sweep from a deleter, and the reason `staleSchemaNames` compares strictly
 *      greater-than                                          → schemaExists true
 *   3. an UNPARSEABLE name under the prefix (`peak_test_unparseable_<pid>`)
 *      SURVIVES: no readable timestamp means no evidence it is dead, so it is
 *      not the harness's to drop (an unreferenced artifact is not dead weight)
 *                                                                    → true
 *   4. the schema `prepareScratchSchema` RETURNS exists and holds exactly the 38
 *      application tables — i.e. the real migration ran and was verified inside
 *      the very path that ran the sweep                    → toBe(38)
 *   5. that schema's referential graph is CLOSED: zero foreign keys still point
 *      at another schema, so the re-point step ran too               → toBe(0)
 *   6. the live schema this test process is actually using is never a sweep
 *      candidate — a sweep that ate the running fixture would be worse than the
 *      leak it fixes                                              → toBe(true)
 *   7. the lifecycle exported the handles forked workers need, aimed at the
 *      schema it just prepared                                     → toBe(...)
 *
 * WHY THE ENV RESTORATION IS MANDATORY (and not defensive noise).
 * `prepareScratchSchema` is step 7 of the lifecycle: it assigns
 * `process.env.PEAK_TEST_SCHEMA`, `PEAK_TEST_DATABASE_URL` and `DATABASE_URL`.
 * That is correct for `globalSetup`, which runs once per process before any
 * worker forks — and WRONG for a test file, because files share a worker
 * (`vitest.config.ts`: `pool: 'forks'`, `maxWorkers: 1`,
 * `fileParallelism: false`). If this file left the three variables pointing at
 * the schema it prepared, then (a) the next test file's `setupFiles`
 * (`tests/setup/db-env.ts`) would re-assert THAT schema as `DATABASE_URL`, (b)
 * `testPool()` would connect to it, and (c) this file's `afterAll` drops it —
 * so every later file would run against a dropped schema, or against this file's
 * leftovers. The original values are therefore captured once, at module load,
 * before any test body runs, and restored in a `finally` for the one test that
 * calls the lifecycle, again in an `afterEach`, and once more in `afterAll`; a
 * value that started `undefined` is DELETED rather than set to the string
 * "undefined".
 *
 * A MEASURED HAZARD THIS TEST MAKES VISIBLE, BUT DOES NOT CAUSE (reported, not
 * fixed here — the fix belongs in `tests/helpers/db.ts`, which this unit does not
 * own). A session whose `search_path` names a scratch schema that does not exist
 * resolves `current_schema()` to `public`, and `resetTestDatabase()` truncates
 * `current_schema()` — i.e. it TRUNCATEs the shared `public` schema, whose 53
 * base tables include another project's. Measured in the Postgres server log
 * (`podman exec peak-postgres grep -A8 'deadlock detected' /var/lib/pgsql/data/userdata/log/*.log`)
 * during this unit: such a `TRUNCATE` (its table list contains `"Account"`,
 * `"Booking"`, … — tables `lib/db/schema/` does not declare) held
 * ACCESS EXCLUSIVE on `public` tables while `repointForeignKeys` dropped an FK
 * still pointing at `public`, which locks the referenced table; the two
 * transactions took them in opposite order and Postgres killed one:
 *   ERROR: deadlock detected
 *   Process 4134: ALTER TABLE "peak_test_<epoch>_<pid>"."buyer_question" DROP CONSTRAINT …
 *   Process 4142: TRUNCATE TABLE "Account", …, "account", …, "verification" RESTART IDENTITY CASCADE
 * One scoped run in eight died that way, and only while sibling suites ran
 * concurrently. The mechanism needed BOTH halves; this file's own runs left zero
 * schemas behind and produced no `public` TRUNCATE (`public`'s table list never
 * appeared in any truncate this file caused).
 *
 * THE CLOCK IS ONE READING, TAKEN ONCE. `nowMs` is captured a single time and
 * used for the stale name, the fresh name, the prepared name AND as the sweep's
 * "now", because the assertion is about the RELATIONSHIP between those four
 * (stale = now − maxAge − 60s, fresh = now, sweep at now) and not about wall
 * clock arithmetic. Spelling `Date.now()` at each site would make the test's
 * staleness depend on how long the intervening `CREATE SCHEMA` calls took.
 *
 * THE PID OFFSET (`process.pid + 91_000`) keeps these synthetic schemas off the
 * harness's own live name (`peak_test_<epoch>_<pid>` for THIS process) and off
 * `harness-hygiene.test.ts`'s offset (+90_000); a collision would let `afterAll`
 * drop the suite's fixture.
 */

import type { Pool } from 'pg'
import { afterAll, afterEach, describe, expect, test } from 'vitest'
import { closeTestPool, quoteIdentifier, testPool } from '@/tests/helpers/db'
import {
  TEST_SCHEMA_MAX_AGE_MS,
  TEST_SCHEMA_PREFIX,
  parseSchemaMadeAt,
  prepareScratchSchema,
  schemaNameFor,
} from '@/tests/setup/global-db'

/**
 * The three variables the lifecycle writes and this file must put back. Read
 * `undefined` as "was not set", because `process.env.X = undefined` stores the
 * literal string.
 */
const ENV_KEYS = ['PEAK_TEST_SCHEMA', 'PEAK_TEST_DATABASE_URL', 'DATABASE_URL'] as const
type EnvKey = (typeof ENV_KEYS)[number]
type SavedEnv = Record<EnvKey, string | undefined>

function saveEnv(): SavedEnv {
  return {
    PEAK_TEST_SCHEMA: process.env.PEAK_TEST_SCHEMA,
    PEAK_TEST_DATABASE_URL: process.env.PEAK_TEST_DATABASE_URL,
    DATABASE_URL: process.env.DATABASE_URL,
  }
}

function restoreEnv(saved: SavedEnv): void {
  for (const key of ENV_KEYS) {
    const value = saved[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

/** Captured at module load, i.e. after `tests/setup/db-env.ts` set them up. */
const ORIGINAL_ENV = saveEnv()

/** Distinct pid offsets so no two synthetic names, nor the live one, can collide. */
const STALE_PID = process.pid + 91_000
const FRESH_PID = process.pid + 91_001
const PREPARE_PID = process.pid + 91_002

/**
 * A name under the prefix that carries no timestamp this harness can read. It
 * carries THIS process's pid because `tests/setup/harness-hygiene.test.ts`
 * creates and drops the bare `peak_test_unparseable` in its own file, and two
 * concurrently running suites (this wave runs several) would then race: one
 * file's `afterAll` can drop the schema the other file is mid-assertion on.
 * Uniqueness costs nothing here — the name is still unparseable, which is the
 * property under test.
 */
const UNPARSEABLE_SCHEMA = `${TEST_SCHEMA_PREFIX}unparseable_${process.pid}`

/**
 * `information_schema` counts as APPLICATION tables, exactly as
 * `tests/setup/global-db.ts` counts them: the migration journal
 * `scripts/db-migrate.mjs` writes is bookkeeping, not schema. `pnpm db:check`
 * and the harness's own `EXPECTED_TABLE_COUNT` both land on 38.
 */
const MIGRATION_JOURNAL_TABLES = new Set(['__drizzle_migrations', '_peak_migration'])
const EXPECTED_APPLICATION_TABLES = 38

/**
 * The default 5s per-test budget is not enough here and that is not a flake: the
 * lifecycle under test runs the REAL migration runner in a child process
 * (measured: ~5.4s for the whole sequence on this tree, of which ~4s is the
 * migration), exactly as `globalSetup` does. The budget is deliberately GENEROUS
 * (120s, not 10s): while the lifecycle holds `process.env` pointed at the schema
 * it prepared, a timeout would let the abandoned test body keep running past this
 * file's `afterAll` — and if a later test file in this worker then re-read
 * `DATABASE_URL` it would find a schema that has since been dropped, which is
 * how `resetTestDatabase()` ends up truncating the shared `public` schema
 * (`current_schema()` falls back to the first EXISTING entry of `search_path`).
 * Wide budget, and the env is put back in three places (`afterEach`, the test's
 * own `finally`, and `afterAll`), none of which can be skipped in a normal run.
 */
const LIFECYCLE_TEST_TIMEOUT_MS = 120_000

/** One pool, opened on first use so importing this file opens none. */
let pool: Pool | null = null

function db(): Pool {
  if (!pool) pool = testPool()
  return pool
}

/** Every schema this file created, so `afterAll` can drop each one. */
const OWNED_SCHEMAS = new Set<string>()

/** Does the schema exist — asked of the catalog, never remembered. */
async function schemaExists(name: string): Promise<boolean> {
  const { rows } = await db().query<{ present: boolean }>(
    `SELECT EXISTS (
              SELECT 1 FROM information_schema.schemata WHERE schema_name = $1
            ) AS present`,
    [name],
  )
  const present = rows[0]?.present
  if (typeof present !== 'boolean') {
    // A non-boolean would make `toBe(false)` read as "gone" for the wrong reason.
    throw new Error(`schemaExists("${name}") returned ${String(present)}, not a boolean.`)
  }
  return present
}

/**
 * The application base tables of `schema` — the number the lifecycle's own
 * verification step asserts against `lib/db/schema/`, re-derived here from
 * `information_schema` so the test does not just re-run the harness's claim.
 */
async function applicationTableCount(schema: string): Promise<number> {
  const { rows } = await db().query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'`,
    [schema],
  )
  return rows
    .map((row) => row.table_name)
    .filter((table) => !MIGRATION_JOURNAL_TABLES.has(table)).length
}

/**
 * How many foreign keys owned by `schema` still target a relation in ANOTHER
 * schema. The migration is generated against `public`, so without the re-point
 * step this is 61, not 0 (measured in `tests/setup/global-db.ts`'s header).
 */
async function foreignKeysPointingOutside(schema: string): Promise<number> {
  const { rows } = await db().query<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM pg_constraint con
       JOIN pg_class source        ON source.oid = con.conrelid
       JOIN pg_namespace source_ns ON source_ns.oid = source.relnamespace
       JOIN pg_class target        ON target.oid = con.confrelid
       JOIN pg_namespace target_ns ON target_ns.oid = target.relnamespace
      WHERE con.contype = 'f'
        AND source_ns.nspname = $1
        AND target_ns.nspname <> $1`,
    [schema],
  )
  const count = rows[0]?.count
  if (typeof count !== 'number') {
    throw new Error(`foreign-key count for "${schema}" was ${String(count)}, not a number.`)
  }
  return count
}

async function createSchema(name: string): Promise<void> {
  await db().query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(name)} CASCADE`)
  await db().query(`CREATE SCHEMA ${quoteIdentifier(name)}`)
  OWNED_SCHEMAS.add(name)
}

/**
 * Restore the environment. Registered as an `afterEach` as well as being called
 * in the test's `finally` and in `afterAll`: all three are idempotent, and a
 * later test file in this worker must never inherit a schema this file drops.
 */
afterEach(() => {
  restoreEnv(ORIGINAL_ENV)
})

/** Restore the environment and drop everything this file created. */
afterAll(async () => {
  restoreEnv(ORIGINAL_ENV)
  try {
    for (const name of OWNED_SCHEMAS) {
      await db().query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(name)} CASCADE`)
    }
  } finally {
    await closeTestPool()
  }
})

describe('cx-2 the scratch-schema lifecycle globalSetup runs', () => {
  test('sweeps the stale schema, keeps the fresh one, and returns a migrated schema of its own', async () => {
    // One clock reading for all four names, so "stale", "fresh" and the sweep's
    // "now" are the same instant (see the header).
    const nowMs = Date.now()

    const staleSchema = schemaNameFor(nowMs - TEST_SCHEMA_MAX_AGE_MS - 60_000, STALE_PID)
    const freshSchema = schemaNameFor(nowMs, FRESH_PID)
    const preparedSchema = schemaNameFor(nowMs, PREPARE_PID)
    const liveSchema = ORIGINAL_ENV.PEAK_TEST_SCHEMA
    if (!liveSchema) {
      throw new Error(
        'PEAK_TEST_SCHEMA is not set, so this test cannot tell the live fixture apart from the ' +
          'schemas it creates. Run the suite through `pnpm test`.',
      )
    }

    // The pool is created NOW, while DATABASE_URL still points at the live
    // fixture — so it stays usable after the lifecycle moves the env vars under it.
    await createSchema(staleSchema)
    await createSchema(freshSchema)
    await createSchema(UNPARSEABLE_SCHEMA)
    // Track the schema the lifecycle will create BEFORE calling it, so a failure
    // halfway through the sequence still has `afterAll` drop the partial schema.
    OWNED_SCHEMAS.add(preparedSchema)

    // Preconditions, asserted rather than assumed: if a CREATE SCHEMA had failed,
    // "the stale one is gone" would pass for the wrong reason.
    expect(await schemaExists(staleSchema)).toBe(true)
    expect(await schemaExists(freshSchema)).toBe(true)
    expect(await schemaExists(UNPARSEABLE_SCHEMA)).toBe(true)
    // The name really is unreadable — the premise of assertion 3, asserted
    // rather than assumed, so a future prefix change cannot quietly make it
    // parse (and therefore make "it survives" a different test).
    expect(parseSchemaMadeAt(UNPARSEABLE_SCHEMA)).toBeNull()

    try {
      // THE CALL UNDER TEST: the exact function, and the exact sequence,
      // `globalSetup` runs — not `sweepStaleScratchSchemas` in isolation.
      const returned = await prepareScratchSchema(db(), nowMs, PREPARE_PID)

      expect(returned).toBe(preparedSchema)

      // 1. The orphan the sweep must remove. THE KILL-MUTATION LANDING SITE:
      //    replace the sweep call inside prepareScratchSchema with a no-op and
      //    this assertion fails, which is what makes the protection un-removable.
      expect(await schemaExists(staleSchema)).toBe(false)

      // 2. The half that makes this a sweep and not a deleter. Removing the age
      //    comparison (so every recognised name looks stale) fails HERE.
      expect(await schemaExists(freshSchema)).toBe(true)

      // 3. No readable timestamp == no evidence of death == not ours to drop.
      expect(await schemaExists(UNPARSEABLE_SCHEMA)).toBe(true)

      // 6. The schema this process is actually testing against was never a
      //    candidate: a sweep that killed the live fixture would break every
      //    other test file.
      expect(await schemaExists(liveSchema)).toBe(true)

      // 4. The returned schema is real, migrated by the real runner, and complete.
      expect(await schemaExists(returned)).toBe(true)
      expect(await applicationTableCount(returned)).toBe(EXPECTED_APPLICATION_TABLES)

      // 5. And its referential graph was closed inside the lifecycle.
      expect(await foreignKeysPointingOutside(returned)).toBe(0)

      // 7. The handles forked workers need were exported, aimed at the schema the
      //    lifecycle just prepared — which is exactly why the restore below is
      //    mandatory rather than tidy.
      expect(process.env.PEAK_TEST_SCHEMA).toBe(returned)
      expect(process.env.PEAK_TEST_DATABASE_URL).toBe(process.env.DATABASE_URL)
      expect(process.env.PEAK_TEST_DATABASE_URL).toContain(returned)
      expect(process.env.PEAK_TEST_DATABASE_URL).not.toBe(ORIGINAL_ENV.PEAK_TEST_DATABASE_URL)
    } finally {
      // Put the environment back before anything else can observe it — even if an
      // assertion above threw. `afterAll` repeats this, because a failure here
      // must not be able to leak a moved schema into the next test file.
      restoreEnv(ORIGINAL_ENV)
    }

    // The restoration is itself asserted: a later file must see the live fixture,
    // not the schema this test prepared and will drop.
    expect(process.env.PEAK_TEST_SCHEMA).toBe(liveSchema)
    expect(process.env.PEAK_TEST_DATABASE_URL).toBe(ORIGINAL_ENV.PEAK_TEST_DATABASE_URL)
    expect(process.env.DATABASE_URL).toBe(ORIGINAL_ENV.DATABASE_URL)
  }, LIFECYCLE_TEST_TIMEOUT_MS)
})
