/**
 * Orphan collection against the scratch database, with a real store double.
 *
 * WHAT THESE TESTS ESTABLISH
 * PEAK-209 acceptance criterion 5 is "media for an abandoned draft is
 * reclaimable", and the whole risk of implementation is over-reclaiming: a
 * sweep that deletes a live listing's photos is worse than the storage bill it
 * was written to reduce. So every fixture set below is built around a
 * three-way contrast — an old DRAFT (an orphan), a fresh DRAFT (too new to
 * touch) and an ACTIVE listing holding OLD media (never an orphan, however
 * old) — and the tests assert the exact set that came back rather than a count,
 * so dropping either half of the `status = 'draft' AND createdAt < olderThan`
 * predicate fails loudly.
 *
 * The store is a `RecordingMediaStore` in this file, not a mock of the module
 * under test: `lib/storage/orphans.ts` is the real code, the database is the
 * real scratch schema, and the double only records which keys the production
 * code asked it to delete. A double may never reach a production path
 * (doctrine rule 7), and nothing outside `tests/` imports this file.
 *
 * TIMESTAMPS ARE COMPARED THROUGH THE VALUES THE DATABASE RETURNED
 * `listing_media.createdAt` is `timestamp` WITHOUT time zone, and this machine
 * runs `America/Los_Angeles`. The read-back row is therefore the only honest
 * source of an expected instant: asserting a raw `new Date(...)` literal against
 * a column that round-trips through UTC wall-clock text would be testing
 * Postgres's timezone handling, not this module. Ages here are 48h / 1h apart
 * with a 24h threshold, so the contrast holds in any timezone; the
 * exactly-at-the-threshold test pins the boundary using the value the database
 * itself stored, which is exactly what the SQL comparison sees.
 */

import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { listingMedia } from '@/lib/db/schema'
import { collectOrphanMedia, listOrphanMedia } from '@/lib/storage/orphans'
import type { MediaStore } from '@/lib/storage/types'
import { closeTestPool, countRows, resetTestDatabase } from '@/tests/helpers/db'
import { createListing } from '@/tests/helpers/factories'

const HOUR_MS = 60 * 60 * 1000

/** The url convention this test file's `keyFromUrl` understands. */
const CDN_PREFIX = 'https://cdn.peak.test/'

/** The caller's policy: 48h-old media is abandoned, 1h-old media is not. */
function abandonedThreshold(): Date {
  return new Date(Date.now() - 24 * HOUR_MS)
}
function olderThanThreshold(): Date {
  return new Date(Date.now() - 48 * HOUR_MS)
}
function fresherThanThreshold(): Date {
  return new Date(Date.now() - 1 * HOUR_MS)
}

function keyFor(name: string): string {
  return `listings/${name}`
}
function urlFor(name: string): string {
  return `${CDN_PREFIX}${keyFor(name)}`
}

/**
 * The url-to-key convention, spelled once. `listing_media` has no key column
 * (PEAK-209's schema stores `url` only), so this function is where the mapping
 * lives — and it is allowed to fail on a url it does not recognise, which the
 * "unresolvable url" test exercises.
 */
function keyFromUrl(url: string): string | null {
  if (!url.startsWith(CDN_PREFIX)) return null
  return url.slice(CDN_PREFIX.length)
}

/** A store double that records what production code asked it to delete. */
class RecordingMediaStore implements Pick<MediaStore, 'delete'> {
  readonly deleted: string[] = []

  async delete(key: string): Promise<void> {
    this.deleted.push(key)
  }
}

/**
 * `MediaStore.delete` that always fails. A real backend being briefly unreachable
 * is the case that must not corrupt the database, so this is the store whose
 * refusal has to reach the caller.
 */
class RefusingMediaStore implements Pick<MediaStore, 'delete'> {
  readonly attempted: string[] = []

  async delete(key: string): Promise<void> {
    this.attempted.push(key)
    throw new Error(`storage backend unavailable while deleting key "${key}"`)
  }
}

type MediaRow = typeof listingMedia.$inferSelect

/**
 * Insert one media row and return the row Postgres wrote.
 *
 * `createdAt` is always passed explicitly: the age of the row IS the fixture in
 * this file, and letting the column's `defaultNow()` decide would make every
 * fixture fresh and every test vacuous.
 */
async function insertMedia(input: {
  listingId: string
  url: string
  createdAt: Date
  position?: number
}): Promise<MediaRow> {
  const [row] = await db
    .insert(listingMedia)
    .values({
      listingId: input.listingId,
      url: input.url,
      createdAt: input.createdAt,
      position: input.position ?? 0,
    })
    .returning()
  if (!row) {
    throw new Error(
      `insertMedia("${input.url}"): INSERT ... RETURNING produced no row, so the fixture ` +
        'was never written and every assertion after it would be meaningless.',
    )
  }
  return row
}

/** Just the ids of a listing's media, straight from the database. */
async function mediaIdsForListing(listingId: string): Promise<string[]> {
  const rows = await db
    .select({ id: listingMedia.id })
    .from(listingMedia)
    .where(eq(listingMedia.listingId, listingId))
  return rows.map((row) => row.id)
}

async function mediaExists(id: string): Promise<boolean> {
  const rows = await db
    .select({ id: listingMedia.id })
    .from(listingMedia)
    .where(eq(listingMedia.id, id))
  return rows.length === 1
}

/** The three-way contrast every test builds on: old draft, fresh draft, active. */
interface ContrastFixtures {
  draftOldMedia: MediaRow
  draftFreshMedia: MediaRow
  activeOldMedia: MediaRow
  activeListingId: string
}

async function buildContrast(): Promise<ContrastFixtures> {
  const draftOld = await createListing({ status: 'draft', publishedAt: null })
  const draftFresh = await createListing({ status: 'draft', publishedAt: null })
  const active = await createListing()

  const draftOldMedia = await insertMedia({
    listingId: draftOld.id,
    url: urlFor(`draft-old-${draftOld.id}.jpg`),
    createdAt: olderThanThreshold(),
  })
  const draftFreshMedia = await insertMedia({
    listingId: draftFresh.id,
    url: urlFor(`draft-fresh-${draftFresh.id}.jpg`),
    createdAt: fresherThanThreshold(),
  })
  const activeOldMedia = await insertMedia({
    listingId: active.id,
    url: urlFor(`active-old-${active.id}.jpg`),
    createdAt: olderThanThreshold(),
    position: 1,
  })

  return { draftOldMedia, draftFreshMedia, activeOldMedia, activeListingId: active.id }
}

describe('lib/storage/orphans against the scratch database', () => {
  beforeEach(async () => {
    await resetTestDatabase()
  })

  afterAll(async () => {
    await closeTestPool()
  })

  test('listOrphanMedia returns exactly the old draft media', async () => {
    const { draftOldMedia, draftFreshMedia, activeOldMedia } = await buildContrast()
    // The fixtures are really on disk: without this, an empty result would also
    // "pass" against an empty table for the wrong reason.
    expect(await countRows('listing_media')).toBe(3)

    const rows = await listOrphanMedia({ olderThan: abandonedThreshold() })

    expect(rows.map((row) => row.id)).toEqual([draftOldMedia.id])
    expect(rows).toHaveLength(1)
    const [only] = rows
    expect(only.listingId).toBe(draftOldMedia.listingId)
    expect(only.url).toBe(draftOldMedia.url)
    expect(only.createdAt.getTime()).toBe(draftOldMedia.createdAt.getTime())

    // Named individually so a failure says which half of the predicate broke.
    expect(rows.some((row) => row.id === draftFreshMedia.id)).toBe(false)
    expect(rows.some((row) => row.id === activeOldMedia.id)).toBe(false)
  })

  test('a draft whose only media is fresher than the threshold keeps it', async () => {
    const draft = await createListing({ status: 'draft', publishedAt: null })
    const fresh = await insertMedia({
      listingId: draft.id,
      url: urlFor(`only-fresh-${draft.id}.jpg`),
      createdAt: fresherThanThreshold(),
    })

    const rows = await listOrphanMedia({ olderThan: abandonedThreshold() })

    // Empty, and the table is not: the date half of the predicate did the
    // excluding, not a missing fixture.
    expect(rows).toEqual([])
    expect(await countRows('listing_media')).toBe(1)
    expect(await mediaExists(fresh.id)).toBe(true)
  })

  test('an ACTIVE listing with old media is never an orphan', async () => {
    const active = await createListing()
    const old = await insertMedia({
      listingId: active.id,
      url: urlFor(`active-only-old-${active.id}.jpg`),
      createdAt: olderThanThreshold(),
    })

    const rows = await listOrphanMedia({ olderThan: abandonedThreshold() })

    expect(rows).toEqual([])
    expect(await countRows('listing_media')).toBe(1)
    expect(await mediaExists(old.id)).toBe(true)
  })

  test('media written exactly at the threshold is not yet abandoned, and one second later it is', async () => {
    const draft = await createListing({ status: 'draft', publishedAt: null })
    const exactlyAt = new Date(Date.now() - 24 * HOUR_MS)
    const media = await insertMedia({
      listingId: draft.id,
      url: urlFor(`boundary-${draft.id}.jpg`),
      createdAt: exactlyAt,
    })
    const stored = media.createdAt

    // `createdAt < olderThan` is strict: the row written at the threshold has
    // not crossed it, so a sweep run twice cannot disagree with itself.
    const atBoundary = await listOrphanMedia({ olderThan: stored })
    expect(atBoundary).toEqual([])

    // ...and it is not merely invisible: a threshold one second later reclaims it.
    const pastBoundary = await listOrphanMedia({ olderThan: new Date(stored.getTime() + 1000) })
    expect(pastBoundary.map((row) => row.id)).toEqual([media.id])
  })

  test('collectOrphanMedia removes the draft rows, deletes their keys, and leaves the active listing alone', async () => {
    const { draftOldMedia, draftFreshMedia, activeOldMedia, activeListingId } =
      await buildContrast()
    const orphanKey = keyFromUrl(draftOldMedia.url)
    if (orphanKey === null)
      throw new Error('fixture url did not encode a key; the test itself is wrong')

    const store = new RecordingMediaStore()
    const report = await collectOrphanMedia({
      olderThan: abandonedThreshold(),
      store,
      keyFromUrl,
    })

    expect(report.removedRows).toBe(1)
    expect(report.deletedKeys).toEqual([orphanKey])
    expect(report.skipped).toEqual([])
    // The keys it reports are the keys the store was really asked to remove.
    expect(store.deleted).toEqual([orphanKey])

    // The orphan row is gone from the database...
    expect(await mediaExists(draftOldMedia.id)).toBe(false)
    // ...the untouched rows are still there...
    expect(await mediaExists(draftFreshMedia.id)).toBe(true)
    expect(await mediaIdsForListing(activeListingId)).toEqual([activeOldMedia.id])
    expect(await countRows('listing_media')).toBe(2)
    // ...and no listing row was deleted. This function touches media only.
    expect(await countRows('listing')).toBe(3)
  })

  test('a url whose key cannot be resolved is skipped with a reason and stays in the database', async () => {
    const draft = await createListing({ status: 'draft', publishedAt: null })
    const good = await insertMedia({
      listingId: draft.id,
      url: urlFor(`resolvable-${draft.id}.jpg`),
      createdAt: olderThanThreshold(),
    })
    const draftLegacy = await createListing({ status: 'draft', publishedAt: null })
    const legacy = await insertMedia({
      listingId: draftLegacy.id,
      url: `https://cdn.legacy.test/objects/${draftLegacy.id}.jpg`,
      createdAt: olderThanThreshold(),
    })

    const store = new RecordingMediaStore()
    const report = await collectOrphanMedia({
      olderThan: abandonedThreshold(),
      store,
      keyFromUrl,
    })

    expect(report.removedRows).toBe(1)
    expect(report.deletedKeys).toEqual([keyFromUrl(good.url)])
    expect(report.skipped).toHaveLength(1)
    expect(report.skipped[0]?.id).toBe(legacy.id)
    expect(report.skipped[0]?.reason).toContain('no-storage-key')
    expect(report.skipped[0]?.reason).toContain(legacy.url)

    // The unresolvable row was never sent to the store and still exists: hiding
    // the mismatch would leave the object and the row unreconciled forever.
    expect(store.deleted).toEqual([keyFromUrl(good.url)])
    expect(await mediaExists(legacy.id)).toBe(true)
    expect(await countRows('listing_media')).toBe(1)
  })

  test('a blank key is skipped rather than sent to the store as delete("")', async () => {
    const draft = await createListing({ status: 'draft', publishedAt: null })
    const blank = await insertMedia({
      listingId: draft.id,
      url: 'https://cdn.peak.test/',
      createdAt: olderThanThreshold(),
    })

    const store = new RecordingMediaStore()
    const report = await collectOrphanMedia({
      olderThan: abandonedThreshold(),
      store,
      keyFromUrl: (url) => (url === 'https://cdn.peak.test/' ? '' : null),
    })

    expect(report.removedRows).toBe(0)
    expect(report.deletedKeys).toEqual([])
    expect(report.skipped).toHaveLength(1)
    expect(report.skipped[0]?.id).toBe(blank.id)
    expect(report.skipped[0]?.reason).toContain('empty-storage-key')
    expect(store.deleted).toEqual([])
    expect(await mediaExists(blank.id)).toBe(true)
  })

  test('a store that refuses a delete makes the run reject, naming the key, with the rows intact', async () => {
    const { draftOldMedia, activeOldMedia } = await buildContrast()
    const failingKey = keyFromUrl(draftOldMedia.url)
    if (failingKey === null)
      throw new Error('fixture url did not encode a key; the test itself is wrong')

    const store = new RefusingMediaStore()

    // Held rather than asserted with `.rejects.toThrow(string)`: the key must be
    // named in the rejection AND the store's own failure must survive as the
    // cause, and only one of those is the message.
    let thrown: unknown
    try {
      await collectOrphanMedia({ olderThan: abandonedThreshold(), store, keyFromUrl })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toContain(failingKey)
    expect(((thrown as Error).cause as Error).message).toContain('storage backend unavailable')
    expect(store.attempted).toEqual([failingKey])

    // Nothing was removed: the key delete is step one, so a refusal there leaves
    // both the row and every other candidate exactly as they were.
    expect(await mediaExists(draftOldMedia.id)).toBe(true)
    expect(await mediaExists(activeOldMedia.id)).toBe(true)
    expect(await countRows('listing_media')).toBe(3)
  })

  test('collectOrphanMedia refuses an invalid threshold instead of inventing a window', async () => {
    const store = new RecordingMediaStore()
    const invalid = new Date('not-an-instant')

    await expect(listOrphanMedia({ olderThan: invalid })).rejects.toThrow(/valid Date/)
    await expect(collectOrphanMedia({ olderThan: invalid, store, keyFromUrl })).rejects.toThrow(
      /valid Date/,
    )
    expect(store.deleted).toEqual([])
  })
})
