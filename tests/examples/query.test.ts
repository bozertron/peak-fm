/**
 * THE COPYABLE QUERY-TEST PATTERN — copy this file's shape when a ticket says
 * "call the real query layer and assert the real result".
 *
 * PEAK-206, worked example, unit 7 of 10. `lib/queries/market.ts` is the
 * smallest complete query module in the repo, so it is the one used here to show
 * the whole pattern end to end: empty the scratch schema, write a real row
 * through the real schema table, call the real query function, and assert the
 * exact value Postgres handed back.
 *
 * THE FOUR MOVES
 *   1. `beforeEach(resetTestDatabase)` — every test starts from an EMPTY scratch
 *      schema, so "no rows" means no rows rather than "the previous test's rows
 *      happen not to match". The scratch schema itself (`peak_test_<pid>`,
 *      created and migrated by `tests/setup/global-db.ts`) is the fixture; the
 *      developer's `public` schema is never touched.
 *   2. WRITE with the real table object (`db.insert(market)` here — there is no
 *      market factory in `tests/helpers/factories.ts`, which only covers user,
 *      listing and thread), keeping the row the database actually wrote, from
 *      `.returning()`. That row is the expected value: whichever side of the
 *      comparison is wrong, the test fails.
 *   3. CALL the real query function imported from `@/lib/queries/...`. Never a
 *      copy of its SQL, never a mocked `db` — the point of these tests is the
 *      query module as it ships.
 *   4. ASSERT exact values: the row you inserted (field by field, then the
 *      whole object), `toBeNull()` for an absent row, and the absence of a row
 *      from a filtered list. `toBeNull()` and not `toBeFalsy()`/`not.toBeTruthy()`:
 *      the contract in `lib/queries/market.ts` is "returns null", and an
 *      assertion that would also accept `undefined` does not test it.
 *
 * WHAT NOT TO DO
 *   - No `vi.mock('@/lib/db')`. A mocked pool asserts your mock, not the query.
 *   - No `try/catch` around an assertion, no `.skip`, no test without an
 *     assertion — a swallowed failure is a test that certifies nothing.
 *   - No hardcoded row ids or slugs shared across tests: `resetTestDatabase()`
 *     restarts identities and empties tables, so a fixture pinned to another
 *     test's id is a failure waiting for test ordering to change. Slugs are
 *     generated per test with `crypto.randomUUID()`.
 *   - Do not assert on `createdAt`/`updatedAt` orderings against `Date.now()`;
 *     assert them by comparing against the row `.returning()` produced.
 *
 * WHY `getActiveMarkets` IS SAFE TO CALL TWICE HERE
 * `lib/queries/market.ts` wraps its readers in React's `cache()`, which
 * deduplicates WITHIN one request render. React 19's non-`react-server` build —
 * the one this Vitest process resolves, verified on the installed react@19.2.4:
 * `require('react').cache(fn)` returns `fn` unchanged — is a pass-through, so a
 * cached reader cannot serve a test a row written by a later `beforeEach`.
 */
import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { market } from '@/lib/db/schema'
import { getActiveMarkets, getCurrentMarket, getMarketBySlug } from '@/lib/queries/market'
import { closeTestPool, countRows, resetTestDatabase } from '@/tests/helpers/db'

type NewMarket = typeof market.$inferInsert
type MarketRow = typeof market.$inferSelect

/**
 * Insert one market and return the row Postgres stored.
 *
 * Local to this file rather than added to `tests/helpers/factories.ts`, which is
 * owned by another agent in this wave AND deliberately covers only the tables
 * that already had a factory (user, listing, thread). `market` is not one of
 * them. Everything a caller does not pass is a real value: `region`,
 * `centerLat` and `centerLng` are `NOT NULL` in `lib/db/schema/market.ts`, and
 * `active` has no default that would make a fixture visible by accident
 * (`market.active` defaults to `false`), so it is required here and always
 * spelled at the call site.
 */
async function insertMarket(input: {
  slug: string
  name: string
  active: boolean
  region?: string
}): Promise<MarketRow> {
  const values: NewMarket = {
    slug: input.slug,
    name: input.name,
    active: input.active,
    region: input.region ?? 'Okanagan',
    centerLat: 49.7254,
    centerLng: -118.9376,
  }

  const [row] = await db.insert(market).values(values).returning()
  if (!row) {
    throw new Error(
      `insertMarket("${input.slug}"): INSERT ... RETURNING produced no row, so the ` +
        'fixture was never written and every assertion after it would be meaningless.',
    )
  }
  return row
}

/** A slug no other test can collide with, even without the between-test reset. */
function uniqueSlug(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

describe('lib/queries/market against the scratch database', () => {
  beforeEach(async () => {
    await resetTestDatabase()
  })

  afterAll(async () => {
    await closeTestPool()
  })

  test('getMarketBySlug returns the row the database wrote', async () => {
    const slug = uniqueSlug('query-pattern-active')
    const inserted = await insertMarket({ slug, name: 'Big White', active: true })

    const found = await getMarketBySlug(slug)

    // Field by field first, so a failure names the column that drifted...
    expect(found).not.toBeNull()
    expect(found?.id).toBe(inserted.id)
    expect(found?.slug).toBe(slug)
    expect(found?.name).toBe('Big White')
    expect(found?.region).toBe('Okanagan')
    expect(found?.active).toBe(true)
    // ...then the whole row, which also pins the defaults this test did not
    // pass (country 'CA', radiusKm 40, createdAt/updatedAt from Postgres).
    expect(found).toEqual(inserted)
  })

  test('a slug that was never written returns null, from an empty table', async () => {
    // Proof the lookup is answering "no such row" and not "the reset left rows
    // behind whose slug happens to differ".
    expect(await countRows('market')).toBe(0)

    const absent = await getMarketBySlug(uniqueSlug('query-pattern-never-written'))

    // Exact null: the contract in lib/queries/market.ts is `row ?? null`, and
    // `toBeFalsy()` would also accept `undefined` — i.e. a query that forgot to
    // return anything.
    expect(absent).toBeNull()
  })

  test('getActiveMarkets excludes an inactive market and keeps the active one', async () => {
    const activeSlug = uniqueSlug('query-pattern-active')
    const inactiveSlug = uniqueSlug('query-pattern-inactive')
    const active = await insertMarket({ slug: activeSlug, name: 'Aaa Active', active: true })
    const inactive = await insertMarket({ slug: inactiveSlug, name: 'Bbb Inactive', active: false })

    const rows = await getActiveMarkets()

    expect(rows.map((row) => row.slug)).toEqual([activeSlug])
    expect(rows.map((row) => row.active)).toEqual([true])
    expect(rows).toEqual([active])

    // The inactive row EXISTS and stays reachable by slug — the exclusion is the
    // active filter's doing, not a missing fixture.
    expect(await getMarketBySlug(inactiveSlug)).toEqual(inactive)
    expect(await countRows('market')).toBe(2)
  })

  test('getCurrentMarket falls back to the first active market by name', async () => {
    const laterSlug = uniqueSlug('query-pattern-zulu')
    const earlierSlug = uniqueSlug('query-pattern-alpha')
    await insertMarket({ slug: laterSlug, name: 'Zzz Later Market', active: true })
    const earlier = await insertMarket({ slug: earlierSlug, name: 'Aaa Earlier Market', active: true })
    // An inactive market that sorts FIRST must still lose to the active ones:
    // the fallback query filters on `active` before it orders.
    await insertMarket({ slug: uniqueSlug('query-pattern-inactive'), name: '000 Inactive', active: false })

    const current = await getCurrentMarket()

    expect(current).toEqual(earlier)
  })

  test('getCurrentMarket returns an explicitly requested market even when it is inactive', async () => {
    const inactive = await insertMarket({
      slug: uniqueSlug('query-pattern-inactive'),
      name: 'Aaa Inactive',
      active: false,
    })
    await insertMarket({ slug: uniqueSlug('query-pattern-active'), name: 'Zzz Active', active: true })

    // Documented resolution order in lib/queries/market.ts: the caller's
    // explicit choice first, then the first active market.
    expect(await getCurrentMarket(inactive.slug)).toEqual(inactive)
  })

  test('getCurrentMarket is null when no market is active', async () => {
    await insertMarket({
      slug: uniqueSlug('query-pattern-inactive'),
      name: 'Only Inactive',
      active: false,
    })

    // A real state ("a fresh database before pnpm db:seed"), and the callers are
    // required to handle it — so it is pinned here rather than assumed.
    expect(await getCurrentMarket()).toBeNull()
  })
})
