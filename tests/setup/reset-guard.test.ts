/**
 * tests/setup/reset-guard.test.ts — resetTestDatabase() must refuse to truncate
 * anything that is not the scratch schema.
 *
 * THE MEASURED HAZARD THIS FILE CLOSES. The test pool is opened with
 * `search_path = <scratch>, public`, and `current_schema()` resolves to the
 * first EXISTING entry. If the scratch schema is absent — a crashed teardown
 * dropped it, or a file was run outside `pnpm test` — `current_schema()`
 * silently becomes `public`: the developer's working database.
 *
 * The pre-existing `tables.length === 0` check does NOT catch that, because
 * `public` holds the full application fixture. Measured directly against a dev
 * database before the guard existed:
 *
 *     SET search_path = peak_test_does_not_exist, public;
 *     SELECT current_schema();                    -- public
 *     SELECT count(*) ... table_schema = current_schema()
 *                          AND table_type='BASE TABLE'
 *                          AND table_name NOT IN (journals);   -- 38
 *
 * Thirty-eight application tables, list non-empty, guard passes, TRUNCATE
 * proceeds against real data. This is a data-loss path, not a hygiene nit.
 *
 * Corroborating evidence that it is reachable and not merely theoretical: an
 * audit of the developer database found a `beta_invite` row coded
 * `race-<uuid>` — the pattern built by `tests/examples/concurrency.test.ts:109`
 * and present in zero application code — meaning a test process did at some
 * point write through to `public`.
 *
 * WHAT THIS FILE ASSERTS:
 *   1. a pool whose search_path falls through to `public` is REFUSED, and the
 *      message names both the schema found and the one expected
 *   2. the refusal happens BEFORE any truncation — the fixture is untouched
 *   3. the guard is not vacuous: the real scratch schema is still accepted
 */

import { afterAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { resetTestDatabase, testPool } from '@/tests/helpers/db'

/** The scratch schema this process actually owns, per globalSetup. */
const scratchSchema = process.env.PEAK_TEST_SCHEMA
const scratchUrl = process.env.PEAK_TEST_DATABASE_URL

/**
 * A pool aimed at a schema that does not exist, so `search_path` falls through
 * to `public` exactly as it would after a crashed teardown.
 */
function fallthroughUrl(): string {
  if (!scratchUrl) throw new Error('PEAK_TEST_DATABASE_URL is not set')
  const u = new URL(scratchUrl)
  u.searchParams.set('options', '-c search_path=peak_test_does_not_exist,public')
  return u.toString()
}

const openedPools: Pool[] = []

afterAll(async () => {
  await Promise.all(openedPools.map((p) => p.end()))
})

describe('resetTestDatabase() schema guard', () => {
  it('a fall-through to public really does resolve there, with the fixture present', async () => {
    // Establishes the hazard is real in THIS environment before asserting the
    // guard against it — otherwise a passing guard test proves nothing.
    const pool = new Pool({ connectionString: fallthroughUrl() })
    openedPools.push(pool)

    const { rows } = await pool.query<{ schema: string; tables: string }>(
      `SELECT current_schema() AS schema,
              (SELECT count(*) FROM information_schema.tables
                WHERE table_schema = current_schema()
                  AND table_type = 'BASE TABLE'
                  AND table_name NOT IN ('_peak_migration', '__drizzle_migrations')
              )::text AS tables`,
    )

    expect(rows[0]?.schema).toBe('public')
    // Non-zero is the whole point: the old length check would have passed.
    expect(Number(rows[0]?.tables)).toBeGreaterThan(0)
  })

  it('refuses to truncate when current_schema() is not the scratch schema', async () => {
    expect(scratchSchema).toBeTruthy()

    const realUrl = process.env.DATABASE_URL
    try {
      // Point the module's lazily-created pool at the fall-through connection.
      process.env.DATABASE_URL = fallthroughUrl()
      const { closeTestPool } = await import('@/tests/helpers/db')
      await closeTestPool()

      await expect(resetTestDatabase()).rejects.toThrow(
        /refuses to truncate: current_schema\(\) is public/,
      )
      await expect(resetTestDatabase()).rejects.toThrow(
        /developer working database/,
      )
      await expect(resetTestDatabase()).rejects.toThrow(
        new RegExp(`scratch schema is ${scratchSchema}`),
      )

      await closeTestPool()
    } finally {
      process.env.DATABASE_URL = realUrl
      const { closeTestPool } = await import('@/tests/helpers/db')
      await closeTestPool()
    }
  })

  it('leaves the fixture data intact — it refuses before truncating, not after', async () => {
    // If the guard had let the TRUNCATE through, the developer fixture would be
    // empty. Count through a pool that resolves to public deliberately.
    const pool = new Pool({ connectionString: fallthroughUrl() })
    openedPools.push(pool)

    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    )
    expect(Number(rows[0]?.n)).toBeGreaterThan(0)

    // `beta.invite_only` is reference data from scripts/db-seed.mjs. Its row
    // must survive the refused reset; table existence alone would not detect a
    // TRUNCATE because it preserves the table definition.
    const { rows: beforeRows } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM public.feature_flag
        WHERE key = 'beta.invite_only'`,
    )
    const featureFlagRowsBefore = Number(beforeRows[0]?.n)
    expect(featureFlagRowsBefore).toBeGreaterThan(0)

    const realUrl = process.env.DATABASE_URL
    try {
      process.env.DATABASE_URL = fallthroughUrl()
      const { closeTestPool } = await import('@/tests/helpers/db')
      await closeTestPool()

      await expect(resetTestDatabase()).rejects.toThrow(
        /refuses to truncate: current_schema\(\) is public/,
      )

      await closeTestPool()
    } finally {
      process.env.DATABASE_URL = realUrl
      const { closeTestPool } = await import('@/tests/helpers/db')
      await closeTestPool()
    }

    const { rows: afterRows } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM public.feature_flag
        WHERE key = 'beta.invite_only'`,
    )
    expect(Number(afterRows[0]?.n)).toBe(featureFlagRowsBefore)
  })

  it('still accepts the real scratch schema — the guard is not vacuous', async () => {
    const pool = testPool()
    const { rows } = await pool.query<{ schema: string }>('SELECT current_schema() AS schema')
    expect(rows[0]?.schema).toBe(scratchSchema)

    // The positive control: the same call that was refused above must succeed
    // here, or the guard is simply "always throw".
    await expect(resetTestDatabase()).resolves.toBeUndefined()
  })
})
