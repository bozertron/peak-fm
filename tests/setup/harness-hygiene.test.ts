/**
 * tests/setup/harness-hygiene.test.ts — CLOSURE cl-1: the harness must not leak
 * scratch schemas.
 *
 * THE MECHANISM THIS FILE GUARDS. `tests/setup/global-db.ts`'s teardown runs only
 * when globalSetup resolves AND the process exits cleanly, so a killed or
 * timed-out test process strands its scratch schema forever. Measured after one
 * wave: three orphans (`peak_test_1888021`, `peak_test_1892144`,
 * `peak_test_1956625`), dropped by hand. The fix makes orphanhood decidable — the
 * schema name now carries the epoch milliseconds it was made in
 * (`peak_test_<epochMs>_<pid>`) — and sweeps the decidable ones before each run.
 *
 * WHAT THIS FILE PROVES, and the assertion that proves it:
 *   1. `schemaNameFor(1000, 42)` is `peak_test_1000_42` and different pids give
 *      different names                                            → toBe / not.toBe
 *   2. a name round-trips through `parseSchemaMadeAt` back to the same epoch   → toBe
 *   3. `peak_test_1234` (the OLD scheme), `peak_other` and every other shape
 *      parse to `null`, so the sweep can never judge them                      → toBeNull
 *   4. given old + fresh + unparseable, `staleSchemaNames` returns ONLY the old → toEqual
 *   5. exactly at the threshold is LIVE (rule: strictly greater-than is stale) → toEqual
 *   6. a REAL sweep drops a real old schema and leaves a real fresh one
 *      STANDING — the assertion that separates a sweep from a deleter          → schemaExists
 *   7. a REAL sweep leaves an unrecognised schema alone and reports it         → schemaExists
 *
 * Test 6 is the acceptance that matters: half of it asserts a DROP happened and
 * the other half asserts a DROP DID NOT. A sweep that drops everything passes the
 * first half alone, and killing a concurrent test run is exactly the failure this
 * closure exists to prevent — so the fresh half is load-bearing and the mandatory
 * kill-mutation (remove the age comparison from `staleSchemaNames`) must make it
 * fail.
 *
 * THE REAL SCHEMAS USE AN OFFSET PID (`process.pid + 90_000`). The offset is not
 * decoration: the harness's own live scratch schema is `peak_test_<epoch>_<pid>`
 * for THIS process, and a "fresh" test schema built with the real pid could, in
 * the millisecond where `Date.now()` matched, be that live schema — and
 * `afterAll` would then drop the fixture out from under the rest of the suite.
 * The offset removes the collision; the timestamp is still "now", which is the
 * half the sweep reads.
 */

import type { Pool } from 'pg'
import { afterAll, describe, expect, test } from 'vitest'
import { closeTestPool, quoteIdentifier, testPool } from '@/tests/helpers/db'
import {
  TEST_SCHEMA_MAX_AGE_MS,
  TEST_SCHEMA_PREFIX,
  parseSchemaMadeAt,
  schemaNameFor,
  staleSchemaNames,
  sweepStaleScratchSchemas,
} from '@/tests/setup/global-db'

/** The pid used for the real scratch schemas this file creates and drops. */
const SYNTHETIC_PID = process.pid + 90_000

/**
 * A schema under the harness prefix whose name carries no timestamp — the shape
 * the OLD naming scheme produced (`peak_test_<pid>`) and the shape a hand-made
 * schema would have. The sweep must REPORT it and never drop it (rule 9: an
 * unreferenced artifact is not yours to delete on a guess).
 */
const UNRECOGNISED_SCHEMA = `${TEST_SCHEMA_PREFIX}unparseable`

/** Created by test 6, dropped by test 6 (and by `afterAll` if it ever survives). */
const FRESH_SCHEMA = schemaNameFor(Date.now(), SYNTHETIC_PID)

/** Created by test 7, dropped by `afterAll`. */
const OWNED_SCHEMAS = new Set<string>([FRESH_SCHEMA, UNRECOGNISED_SCHEMA])

/** One connection pool, opened on first use so importing this file opens none. */
let pool: Pool | null = null

function db(): Pool {
  if (!pool) pool = testPool()
  return pool
}

/** Does the schema exist in the catalog — asked of the catalog, not remembered. */
async function schemaExists(name: string): Promise<boolean> {
  const { rows } = await db().query<{ present: boolean }>(
    `SELECT EXISTS (
              SELECT 1 FROM information_schema.schemata WHERE schema_name = $1
            ) AS present`,
    [name],
  )
  const present = rows[0]?.present
  if (typeof present !== 'boolean') {
    // A non-boolean here would make `expect(await schemaExists(...)).toBe(false)`
    // fail loudly rather than read as "gone".
    throw new Error(`schemaExists("${name}") returned ${String(present)}, not a boolean.`)
  }
  return present
}

async function dropSchemaIfExists(name: string): Promise<void> {
  await db().query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(name)} CASCADE`)
}

afterAll(async () => {
  for (const name of OWNED_SCHEMAS) {
    await dropSchemaIfExists(name)
  }
  await closeTestPool()
})

describe('cl-1 scratch-schema naming', () => {
  test('the name carries the creation epoch and the pid', () => {
    expect(schemaNameFor(1000, 42)).toBe('peak_test_1000_42')
    expect(schemaNameFor(1000, 42).startsWith(TEST_SCHEMA_PREFIX)).toBe(true)
    // Unique per process: two pids must never collide on one schema.
    expect(schemaNameFor(1000, 42)).not.toBe(schemaNameFor(1000, 43))
    // Unique per moment: a run started later cannot reuse an earlier run's name.
    expect(schemaNameFor(1001, 42)).not.toBe(schemaNameFor(1000, 42))
    expect(schemaNameFor(Date.now(), process.pid)).toMatch(/^peak_test_[0-9]+_[0-9]+$/)
  })

  test('parseSchemaMadeAt round-trips this harness’s names and rejects every other shape', () => {
    const madeAt = 1_760_000_000_000
    expect(parseSchemaMadeAt(schemaNameFor(madeAt, process.pid))).toBe(madeAt)

    // The OLD scheme: pid, no timestamp. Unreadable by design, so un-droppable.
    expect(parseSchemaMadeAt(`${TEST_SCHEMA_PREFIX}1234`)).toBeNull()
    // Under the prefix but not ours.
    expect(parseSchemaMadeAt(UNRECOGNISED_SCHEMA)).toBeNull()
    expect(parseSchemaMadeAt(`${TEST_SCHEMA_PREFIX}1234_x`)).toBeNull()
    expect(parseSchemaMadeAt(`${TEST_SCHEMA_PREFIX}123_456_789`)).toBeNull()
    // Not under the prefix at all.
    expect(parseSchemaMadeAt('peak_other')).toBeNull()
    expect(parseSchemaMadeAt('public')).toBeNull()
    expect(parseSchemaMadeAt('')).toBeNull()
  })
})

describe('cl-1 staleness decision', () => {
  const NOW = 1_800_000_000_000

  test('returns only the names it recognises as its own and provably old', () => {
    const old = schemaNameFor(NOW - TEST_SCHEMA_MAX_AGE_MS - 1000, 11)
    const fresh = schemaNameFor(NOW - 1000, 12)
    const unrecognised = UNRECOGNISED_SCHEMA
    const oldScheme = `${TEST_SCHEMA_PREFIX}${process.pid}`
    const foreign = 'peak_other'

    expect(staleSchemaNames([old, fresh, unrecognised, oldScheme, foreign], NOW)).toEqual([old])
  })

  test('a schema exactly at the threshold is live; one millisecond older is stale', () => {
    // THE RULE, asserted: staleness is `nowMs - madeAt > maxAgeMs`, i.e. STRICTLY
    // older. Exactly `maxAgeMs` old is still live — the boundary lands on the
    // safe side, because a wrong drop kills a concurrent run while a wrong keep
    // only leaves one extra schema for a later sweep.
    const atThreshold = schemaNameFor(NOW - TEST_SCHEMA_MAX_AGE_MS, 7)
    const justPast = schemaNameFor(NOW - TEST_SCHEMA_MAX_AGE_MS - 1, 7)

    expect(staleSchemaNames([atThreshold], NOW)).toEqual([])
    expect(staleSchemaNames([justPast], NOW)).toEqual([justPast])
    // Passing the default explicitly must agree with omitting it.
    expect(staleSchemaNames([justPast], NOW, TEST_SCHEMA_MAX_AGE_MS)).toEqual([justPast])
    expect(staleSchemaNames([atThreshold], NOW, TEST_SCHEMA_MAX_AGE_MS)).toEqual([])
  })

  test('a name dated in the future is treated as live, never as stale', () => {
    const future = schemaNameFor(NOW + 60_000, 9)
    expect(staleSchemaNames([future], NOW)).toEqual([])
  })

  test('a nonsense clock is refused instead of sweeping nothing in silence', () => {
    expect(() => staleSchemaNames([schemaNameFor(NOW, 1)], Number.NaN)).toThrow(/current time/)
    expect(() => staleSchemaNames([schemaNameFor(NOW, 1)], NOW, -1)).toThrow(/max age/)
  })
})

describe('cl-1 the real sweep', () => {
  test('drops the stale schema and leaves the fresh one standing', async () => {
    const nowMs = Date.now()
    const staleName = schemaNameFor(nowMs - TEST_SCHEMA_MAX_AGE_MS - 60_000, SYNTHETIC_PID)
    const freshName = FRESH_SCHEMA

    await dropSchemaIfExists(staleName)
    await dropSchemaIfExists(freshName)
    await db().query(`CREATE SCHEMA ${quoteIdentifier(staleName)}`)
    await db().query(`CREATE SCHEMA ${quoteIdentifier(freshName)}`)

    // Precondition, asserted rather than assumed: if CREATE SCHEMA had failed,
    // "the stale one is gone" would pass for the wrong reason.
    expect(await schemaExists(staleName)).toBe(true)
    expect(await schemaExists(freshName)).toBe(true)

    const dropped = await sweepStaleScratchSchemas(db(), Date.now())

    expect(dropped).toContain(staleName)
    expect(await schemaExists(staleName)).toBe(false)

    // THE ASSERTION THAT MAKES THIS A SWEEP AND NOT A DELETER.
    expect(dropped).not.toContain(freshName)
    expect(await schemaExists(freshName)).toBe(true)

    // And the run's own live fixture is never a sweep candidate, or the sweep
    // would delete the schema the suite is currently using.
    const live = process.env.PEAK_TEST_SCHEMA
    expect(live).toBeTruthy()
    expect(dropped).not.toContain(live)

    await dropSchemaIfExists(freshName)
  })

  test('leaves an unrecognised schema alone, and reports it by name', async () => {
    await db().query(`CREATE SCHEMA ${quoteIdentifier(UNRECOGNISED_SCHEMA)}`)
    expect(await schemaExists(UNRECOGNISED_SCHEMA)).toBe(true)

    const dropped = await sweepStaleScratchSchemas(db(), Date.now())

    // No timestamp this harness can read == no evidence it is dead == not ours
    // to drop (rule 9). Being under `peak_test_%` is not enough.
    expect(dropped).not.toContain(UNRECOGNISED_SCHEMA)
    expect(parseSchemaMadeAt(UNRECOGNISED_SCHEMA)).toBeNull()
    expect(await schemaExists(UNRECOGNISED_SCHEMA)).toBe(true)
  })
})
