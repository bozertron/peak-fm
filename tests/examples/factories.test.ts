/**
 * THE COPYABLE FACTORY-TEST PATTERN — and the regression test for the harness's
 * own referential isolation.
 *
 * PEAK-206 worked example. `tests/helpers/factories.ts` is what the next
 * nineteen tickets reach for ("give me a user", "give me a listing with a
 * seller"), so it needs a worked example of its own: call the factory, then
 * assert against the row the DATABASE returned, not against the literal the
 * factory assembled.
 *
 * WHY THIS FILE EXISTS AT ALL — THE BUG IT PINS
 * The factories insert rows that carry foreign keys (`listing.sellerId` ->
 * `user.id`, `thread_participant.userId` -> `user.id`), and for a while none of
 * them could: `drizzle/0000_peak_cloud_domain.sql` is generated with every key
 * spelled `REFERENCES "public"."<table>"`, so migrating it into the scratch
 * schema produced scratch tables whose keys still pointed at the DEVELOPER's
 * tables. Every crossing write failed —
 *
 *   insert or update on table "listing" violates foreign key constraint
 *   "listing_sellerId_user_id_fk"
 *
 * — and a run that had succeeded would have been validating test fixtures
 * against real data. `tests/setup/global-db.ts` now re-points those keys
 * (`repointForeignKeys`); the last test in this file is the standing proof that
 * it stays done, for the whole schema rather than for one table.
 *
 * WHAT NOT TO DO
 *   - No `vi.mock('@/lib/db')`, no in-memory fake, no hand-written row literal
 *     compared against itself. Every assertion here compares a factory's return
 *     value with a fresh read from Postgres.
 *   - No assertion without a value: `expect(user).toBeTruthy()` would pass for a
 *     row inserted into the wrong table, so the ids are compared exactly.
 */
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { listing as listingTable, thread as threadTable, user as userTable } from '@/lib/db/schema'
import { closeTestPool, countRows, resetTestDatabase, testPool } from '@/tests/helpers/db'
import { createListing, createThread, createUser } from '@/tests/helpers/factories'

/** One row of the catalog read below: who a foreign key points at, and where. */
type ForeignKeyTargetRow = {
  constraint_name: string
  source_table: string
  target_schema: string
  target_table: string
}

/**
 * Every foreign key owned by `$1`, with the schema its target lives in.
 *
 * Deliberately a SQL string with no `:` in it: `pg` reads `::type` and named
 * parameters inside the query text, so a cast here would be mistaken for a
 * placeholder.
 */
async function foreignKeyTargets(schema: string): Promise<ForeignKeyTargetRow[]> {
  const { rows } = await testPool().query<ForeignKeyTargetRow>(
    `SELECT con.conname       AS constraint_name,
            source.relname    AS source_table,
            target_ns.nspname AS target_schema,
            target.relname    AS target_table
       FROM pg_constraint con
       JOIN pg_class source        ON source.oid = con.conrelid
       JOIN pg_namespace source_ns ON source_ns.oid = source.relnamespace
       JOIN pg_class target        ON target.oid = con.confrelid
       JOIN pg_namespace target_ns ON target_ns.oid = target.relnamespace
      WHERE con.contype = 'f'
        AND source_ns.nspname = $1
      ORDER BY source.relname, con.conname`,
    [schema],
  )
  return rows
}

/** The scratch schema this process is isolated in, or a loud refusal. */
function scratchSchema(): string {
  const schema = process.env.PEAK_TEST_SCHEMA
  if (!schema) {
    throw new Error(
      'PEAK_TEST_SCHEMA is not set, so this test cannot say which schema it is ' +
        'asserting about. Run the suite through `pnpm test` so tests/setup/' +
        'global-db.ts can set it; refusing to assert about an unknown schema.',
    )
  }
  return schema
}

describe('tests/helpers/factories against the scratch database', () => {
  beforeEach(async () => {
    await resetTestDatabase()
  })

  afterAll(async () => {
    await closeTestPool()
  })

  test('createListing stores a listing and its seller resolves as a real row', async () => {
    const seller = await createUser()
    const created = await createListing({ sellerId: seller.id })

    // The values the caller pinned, read back from the returned row.
    expect(created.sellerId).toBe(seller.id)
    expect(created.status).toBe('active')
    expect(created.publishedAt).not.toBeNull()

    // ...and the row as Postgres stored it, which is the assertion that fails if
    // the factory's object literal and the table it inserted into disagree.
    const [stored] = await db.select().from(listingTable).where(eq(listingTable.id, created.id))
    expect(stored).toEqual(created)
    expect(await countRows('listing')).toBe(1)
    // The market the factory had to create for the NOT NULL marketId reference.
    expect(await countRows('market')).toBe(1)
  })

  test('createListing with no overrides creates the seller it needs exactly once', async () => {
    const created = await createListing()

    const sellers = await db.select().from(userTable)
    expect(sellers).toHaveLength(1)
    expect(created.sellerId).toBe(sellers[0]?.id)
    expect(created.title).toContain('Test listing')
  })

  test('createThread writes the thread and one participant row per user', async () => {
    const first = await createUser()
    const second = await createUser()

    const { thread, participants } = await createThread([first.id, second.id])

    expect(participants).toHaveLength(2)
    expect(participants.every((row) => row.threadId === thread.id)).toBe(true)
    expect([...participants.map((row) => row.userId)].sort()).toEqual([first.id, second.id].sort())
    expect(await countRows('thread')).toBe(1)
    expect(await countRows('thread_participant')).toBe(2)

    const [stored] = await db.select().from(threadTable).where(eq(threadTable.id, thread.id))
    expect(stored).toEqual(thread)
  })

  test('a duplicate participant id is refused rather than surfacing as a raw constraint error', async () => {
    const user = await createUser()

    // The factory's own guard, with its own message: the alternative is the
    // `thread_participant_unique` violation, which reports a test bug as a
    // database failure.
    await expect(createThread([user.id, user.id])).rejects.toThrow(/duplicate participant id/)
    expect(await countRows('thread')).toBe(0)
  })

  test('every foreign key in the scratch schema resolves inside the scratch schema', async () => {
    const schema = scratchSchema()
    const keys = await foreignKeyTargets(schema)

    // Guard against a query that matches nothing and therefore "proves" the
    // property by being broken: the migrated schema has ~63 foreign keys.
    expect(keys.length).toBeGreaterThan(0)

    // The regression: no key may reach into another schema (`public`), which is
    // where the generated migration aims them.
    expect(keys.filter((key) => key.target_schema !== schema)).toEqual([])

    // And the exact constraint the bug was reported against, so a future
    // migration cannot silently reintroduce it.
    expect(keys.find((key) => key.constraint_name === 'account_userId_user_id_fk')).toMatchObject({
      source_table: 'account',
      target_schema: schema,
      target_table: 'user',
    })
  })
})
