/**
 * Row factories — real inserts, returned as the row the database actually wrote.
 *
 * WHAT THIS FILE IS FOR
 * Nineteen open tickets need "a user", "a listing", "a thread with two people"
 * before they can assert anything. Without one implementation they each invent
 * their own object literal, and an object literal is a claim about the schema
 * that nothing checks: the day a `NOT NULL` is added, the literal keeps
 * type-checking against a stale `$inferInsert`, and the failure lands somewhere
 * else. Every function here therefore inserts through drizzle and returns
 * `.returning()` — the row Postgres wrote, including the defaults the database
 * computed — so a schema change surfaces here, once.
 *
 * NOTHING RUNS AT MODULE SCOPE. Importing this file inserts nothing, and that is
 * deliberate: the empty state of every surface is a real state the product must
 * handle (doctrine rule 3, and the header of `scripts/db-seed.mjs`), so no test
 * ever gets sample rows it did not ask for. Call a factory to get a row.
 *
 * WHY THE `@/` ALIAS
 * This module imports `db` from `@/lib/db`, exactly as the application queries
 * do. That alias is resolved by vitest (`resolve.tsconfigPaths` in
 * `vitest.config.ts`) and by `jiti`, which is how `tests/setup/global-db.ts` and
 * `scripts/db-seed.mjs` load `lib/*.ts`. Measured on Node v26.2.0: a bare
 * `node tests/helpers/factories.ts` fails with `ERR_MODULE_NOT_FOUND: Cannot
 * find package '@/lib'` — Node's type stripping resolves relative and bare
 * specifiers, not tsconfig paths. Import this through one of those two loaders.
 *
 * THE ONE CAST
 * Each factory builds a `defaults` object typed as a `Pick<>` of the table's
 * SELECT type, so every default written here is checked against the real schema
 * (a typo in `kind` or `status` is a compile error, and the migration carries no
 * CHECK constraints to catch one at runtime). The object is then widened to
 * `typeof table.$inferInsert` at the single point where the caller's untyped
 * `overrides` bag is merged in — that bag is the test author's, and every value
 * in it still travels to Postgres, which is what actually enforces `NOT NULL`,
 * the unique indexes and the foreign keys.
 *
 * MARKETS
 * `listing.marketId` is `NOT NULL` and references `market.id`, so a listing
 * cannot exist without a market. `ensureDefaultMarket()` finds-or-creates one
 * fixture market keyed on its natural slug, which means two listings created by
 * default land in the *same* market — what a browse/filter test needs — without
 * depending on `pnpm db:seed` having run.
 *
 * THREAD STATE IS PER-PARTICIPANT, BY SCHEMA DESIGN
 * `thread_participant` carries `lastReadAt`, `archivedAt`, `mutedAt` and
 * `deletedAt`; the `thread` table has none of them, and its own comment says
 * why — "one party archiving must not remove the other party's copy".
 * `createThread` therefore writes no archive/mute/delete state anywhere.
 */

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { listing, market, thread, threadParticipant, user } from '@/lib/db/schema'
import type { Listing, Thread, User } from '@/lib/db/schema'

/**
 * The rows the harness hands out. Aliases rather than re-declared shapes: the
 * schema file stays the single source of truth, so these types cannot drift from
 * the tables the way a hand-written interface would.
 */
export type UserRow = User
export type ListingRow = Listing
export type ThreadRow = Thread
export type ThreadParticipantRow = typeof threadParticipant.$inferSelect

/**
 * Exactly the columns each factory supplies, taken from the table's select type
 * so that a wrong literal is a compile error rather than a row no query finds.
 */
type UserDefaults = Pick<UserRow, 'id' | 'name' | 'email' | 'emailVerified' | 'role'>
type ListingDefaults = Pick<
  ListingRow,
  'kind' | 'sellerId' | 'marketId' | 'title' | 'status' | 'publishedAt'
>
type ThreadDefaults = Pick<ThreadRow, 'subjectType' | 'title'>

/** Natural key of the one market the factories create for themselves. */
const DEFAULT_MARKET_SLUG = 'peak-test-market'

/**
 * A caller-supplied id, or `undefined` when the factory must create the row it
 * points at. A non-string override is rejected here rather than shipped to
 * Postgres: `pg` will send `123` to a `text` foreign key quite happily, and the
 * failure that came back ("no user with id 123") would misattribute a test bug
 * to the database.
 */
function overrideId(overrides: Record<string, unknown>, key: string): string | undefined {
  const value = overrides[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new Error(
      `createListing: the "${key}" override must be a string id, received ${typeof value}. ` +
        'Pass the id of a real row — a foreign key cannot be satisfied by a number.',
    )
  }
  return value
}

async function findDefaultMarket(): Promise<{ id: string } | undefined> {
  const [row] = await db
    .select({ id: market.id })
    .from(market)
    .where(eq(market.slug, DEFAULT_MARKET_SLUG))
    .limit(1)
  return row
}

/**
 * The fixture market, created on first use and reused after that.
 *
 * `onConflictDoNothing` plus a re-read, rather than a bare insert: PEAK-240's
 * concurrency tests call the factories from two writers at once, and a plain
 * insert would turn that race into a unique-violation on `market.slug` instead
 * of two listings. The coordinates are the seeded Big White market's, so
 * radius / "near me" assertions read like production data — `market.centerLat`,
 * `centerLng` and `radiusKm` are all `NOT NULL`.
 */
async function ensureDefaultMarket(): Promise<{ id: string }> {
  const existing = await findDefaultMarket()
  if (existing) return existing

  const [created] = await db
    .insert(market)
    .values({
      slug: DEFAULT_MARKET_SLUG,
      name: 'Peak Test Market',
      region: 'Test Region',
      country: 'CA',
      centerLat: 49.7254,
      centerLng: -118.9376,
      radiusKm: 25,
      active: true,
    })
    .onConflictDoNothing({ target: market.slug })
    .returning({ id: market.id })
  if (created) return created

  const raced = await findDefaultMarket()
  if (!raced) {
    throw new Error(
      `createListing: the fixture market "${DEFAULT_MARKET_SLUG}" could neither be read ` +
        'nor inserted, so no listing can satisfy its NOT NULL marketId reference.',
    )
  }
  return raced
}

/**
 * Insert one user and return the stored row.
 *
 * `email` is `NOT NULL UNIQUE`, so a caller that passes no override gets a
 * per-call `crypto.randomUUID()` in the address and in the name: two tests in
 * one file cannot collide, and `user-<uuid>@peak.test` is unmistakably a fixture
 * rather than somebody's real address. `role` is `NOT NULL` with `'member'` —
 * `USER_ROLES[0]` in `lib/db/schema/_shared.ts` — as the schema's own default,
 * written explicitly so the harness has a visible, overridable value: PEAK-203's
 * admin-route tests need `{ role: 'admin' }`.
 *
 * `id` AND `emailVerified` ARE SUPPLIED, and that is not belt-and-braces. The
 * four Better Auth tables are the exception to the `id()` builder used by every
 * domain table: `lib/db/schema/auth.ts` declares `id: text('id').primaryKey()`,
 * with no `$defaultFn`, and the table the migration actually creates comes from
 * Better Auth's own planner, where `information_schema` reports `column_default
 * IS NULL` for BOTH `user.id` and `user.emailVerified` (measured in the scratch
 * schema — the drizzle mirror declares `.default(false)` for `emailVerified`,
 * Better Auth's DDL does not). An insert that omits them therefore fails the
 * `NOT NULL` constraint instead of quietly getting a default, which is how this
 * was found. The id comes from `crypto.randomUUID()` — the same generator
 * `lib/db/schema/_shared.ts` `id()` uses — and `emailVerified: false` is the
 * only real value: a fixture user has not clicked a verification link.
 *
 * `createdAt` and `updatedAt` are not passed. Their `defaultNow()` is the
 * database's business, and receiving them through `.returning()` is the proof
 * that the row was really written rather than assembled here.
 */
export async function createUser(overrides: Record<string, unknown> = {}): Promise<UserRow> {
  const tag = crypto.randomUUID()
  const defaults: UserDefaults = {
    id: crypto.randomUUID(),
    name: `Test User ${tag.slice(0, 8)}`,
    email: `user-${tag}@peak.test`,
    emailVerified: false,
    role: 'member',
  }

  const values = { ...defaults, ...overrides } as typeof user.$inferInsert
  const [row] = await db.insert(user).values(values).returning()
  if (!row) {
    throw new Error('createUser: INSERT ... RETURNING produced no row; the user was not written.')
  }
  return row
}

/**
 * Insert one listing and return the stored row.
 *
 * `kind` ('sale', the spine's first kind — Buy and Sell are two views of it) and
 * `title` have no database default and are `NOT NULL`, so both are supplied.
 * `sellerId` and `marketId` are `NOT NULL` foreign keys: when the caller pins
 * neither, a real seller row is created and the fixture market is used, because
 * a listing whose seller does not exist is not a fixture, it is a constraint
 * violation waiting for the first reader.
 *
 * `status` is set to 'active' with `publishedAt` = now, a deliberate departure
 * from the DDL default of 'draft'. Every read path in the application filters
 * `status = 'active'` (`listListings`, `countListingsByKind`), so a factory that
 * defaulted to 'draft' would hand every caller a row no surface can see and make
 * each browse test re-publish by hand — inviting `expect(rows).toHaveLength(0)`
 * to pass for the wrong reason. The draft path is one override away and stays
 * visible at the call site:
 *   `createListing({ sellerId, status: 'draft', publishedAt: null })`
 *
 * `overrides` is spread last, so any column may be pinned — `id`,
 * `priceCents`, `categoryId`, `createdAt`, anything.
 */
export async function createListing(overrides: Record<string, unknown> = {}): Promise<ListingRow> {
  const sellerId = overrideId(overrides, 'sellerId') ?? (await createUser()).id
  const marketId = overrideId(overrides, 'marketId') ?? (await ensureDefaultMarket()).id
  const tag = crypto.randomUUID()

  const defaults: ListingDefaults = {
    kind: 'sale',
    sellerId,
    marketId,
    title: `Test listing ${tag.slice(0, 8)}`,
    status: 'active',
    publishedAt: new Date(),
  }

  const values = { ...defaults, ...overrides } as typeof listing.$inferInsert
  const [row] = await db.insert(listing).values(values).returning()
  if (!row) {
    throw new Error(
      'createListing: INSERT ... RETURNING produced no row; the listing was not written.',
    )
  }
  return row
}

/**
 * Insert one thread and one participant row per user id, in a single
 * transaction, and return both — the `thread` row and the inserted
 * `thread_participant` rows, straight from `.returning()`.
 *
 * Transactional because a thread whose participant insert failed halfway is not
 * a smaller fixture, it is a broken one: it appears in nobody's inbox
 * (`listThreads` and `countUnreadThreads` both join `thread_participant`) while
 * still existing in `thread`. Either both halves are written or neither is.
 *
 * No archive, mute or delete state is written, and none exists to write: those
 * columns live on `thread_participant`, per the schema's own comment. A test
 * that needs the archived / muted / soft-deleted view updates the participant
 * row itself; `role` likewise stays at the database default `'member'`.
 *
 * `userIds` must be non-empty and free of duplicates. An empty list is rejected
 * rather than inserted because it produces exactly the invisible thread
 * described above; duplicates are rejected here because the database's
 * `thread_participant_unique (threadId, userId)` would otherwise report a test
 * bug as a raw constraint violation. Both are real constraints read from
 * `lib/db/schema/comms.ts`.
 *
 * `overrides` applies to the thread row (`title`, `subjectType`, `subjectId`,
 * `marketId`, …) and is spread last.
 */
export async function createThread(
  userIds: string[],
  overrides: Record<string, unknown> = {},
): Promise<{ thread: ThreadRow; participants: ThreadParticipantRow[] }> {
  if (userIds.length === 0) {
    throw new Error(
      'createThread: at least one participant user id is required. A thread with no ' +
        'participants exists in `thread` but is invisible to `listThreads` and ' +
        '`countUnreadThreads`, which both join `thread_participant`.',
    )
  }

  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const userId of userIds) {
    if (seen.has(userId)) duplicates.add(userId)
    seen.add(userId)
  }
  if (duplicates.size > 0) {
    throw new Error(
      `createThread: duplicate participant id(s) ${[...duplicates].join(', ')} would violate ` +
        'the unique index thread_participant_unique (threadId, userId). Pass each user once.',
    )
  }

  const tag = crypto.randomUUID()
  const defaults: ThreadDefaults = {
    subjectType: 'direct',
    title: `Test thread ${tag.slice(0, 8)}`,
  }

  return db.transaction(async (tx) => {
    const threadValues = { ...defaults, ...overrides } as typeof thread.$inferInsert
    const [threadRow] = await tx.insert(thread).values(threadValues).returning()
    if (!threadRow) {
      throw new Error('createThread: the thread INSERT ... RETURNING produced no row.')
    }

    const participants = await tx
      .insert(threadParticipant)
      .values(userIds.map((userId) => ({ threadId: threadRow.id, userId })))
      .returning()
    if (participants.length !== userIds.length) {
      throw new Error(
        `createThread: inserted ${participants.length} participant row(s) for ${userIds.length} ` +
          'user id(s); refusing to return a partially populated thread.',
      )
    }

    return { thread: threadRow, participants }
  })
}
