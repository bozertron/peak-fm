/**
 * Orphan collection — reclaiming the bytes behind drafts that were never published.
 *
 * WHY THIS EXISTS
 * A seller uploads six photos, knows the price is wrong, closes the tab. The
 * listing stays `draft` forever and its `listing_media` rows pin six objects in
 * the store forever. Storage cost is the risk PEAK-209 names, so the reclaim
 * path is part of the seam rather than an admin chore someone remembers to run.
 *
 * WHAT "ORPHAN" MEANS HERE, AND WHAT IT DOES NOT
 * An orphan is media whose listing is STILL `draft` AND whose own
 * `listing_media.createdAt` is older than the caller's threshold. Publish state
 * is the whole point: an `active`, `paused`, `completed` or `withdrawn`
 * listing's photos are never orphans however old they are, because those photos
 * are (or were) on a live surface. This module touches `listing_media` only —
 * it never deletes a `listing` row and never mutates a listing's status.
 *
 * NO POLICY IS INVENTED
 * `olderThan` is a REQUIRED argument on both functions. How long "abandoned"
 * means — a day, a month, a season — is the owner's call, not this module's, so
 * there is deliberately no default to silently keep or silently change. A
 * missing threshold is a compile error; an unusable one is a runtime refusal.
 *
 * `listing_media` HAS NO KEY COLUMN
 * PEAK-209's schema stores `url` and nothing else, so the storage key is
 * recovered by the caller's `keyFromUrl`. That function is the one place the
 * url-to-key convention lives, and it may legitimately fail to resolve a url
 * (an old row written before the convention, a url from another bucket). Such a
 * row is NOT deleted and NOT dropped: it is reported in `skipped` with a reason,
 * because a silent drop would hide a real mismatch between the store and the
 * database (doctrine rule 2).
 *
 * FAILURE BEHAVIOUR
 * `collectOrphanMedia` is deliberately NOT transactional: the store is an
 * external system, so no database transaction can make "removed the object" and
 * "removed the row" atomic. Instead each candidate is processed in the only
 * safe order — key first, row second — and the run FAILS LOUDLY, naming the key,
 * if the store refuses a delete. A re-run is safe: a key that is already gone
 * must not be a corruption (see `MediaStore.delete`'s contract in ./types), and
 * a row already claimed by a concurrent collector is reported rather than
 * silently counted.
 */

import { and, asc, eq, lt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { listing, listingMedia } from '@/lib/db/schema'
import type { MediaStore } from './types'

/** One reclaimable media row: the identity, its listing, its url and its age. */
export interface OrphanMediaRow {
  id: string
  listingId: string
  url: string
  createdAt: Date
}

/**
 * `skipped[].reason` is `"<code>: <detail>"`. The code is stable so a caller (or
 * a test) can branch on it; the detail is the sentence a human needs to fix the
 * mismatch. There are three codes, one per way a row survives a collection run.
 */
/** `keyFromUrl` returned `null`: nothing to delete, so nothing was deleted. */
const SKIP_NO_STORAGE_KEY = 'no-storage-key'
/** `keyFromUrl` returned a blank string. Deleting "" is a store-level footgun, not a key. */
const SKIP_EMPTY_STORAGE_KEY = 'empty-storage-key'
/** The row vanished between the select and the delete: a concurrent collector got it. */
const SKIP_ROW_ALREADY_ABSENT = 'row-already-absent'

/**
 * Refuse a threshold that is not a real instant.
 *
 * `new Date('not a date')` has no `getTime()`, and Postgres would be handed
 * `Invalid Date`. Comparing against it silently matches nothing — i.e. an orphan
 * sweep that reclaims nothing would look like "there was nothing to reclaim".
 * Refusing here keeps that failure visible at the call site.
 */
function requireInstant(value: Date, where: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(
      `${where}: olderThan must be a valid Date. How long "abandoned" means is the ` +
        "caller's policy, so this module will not invent a window — pass a real instant " +
        `(received ${value instanceof Date ? 'Invalid Date' : typeof value}).`,
    )
  }
  return value
}

/**
 * Media belonging to a listing that is still a draft and older than the caller's threshold.
 *
 * The selection is one join and two conditions, and BOTH are load-bearing:
 *   - `listing.status = 'draft'` — a published listing's photos are never
 *     reclaimed, however old. `draft` is the DDL default, so an abandoned
 *     listing keeps this value unless someone explicitly published it.
 *   - `listing_media.createdAt < olderThan` — STRICTLY older. A row written
 *     exactly at the threshold has not crossed it yet, which keeps a sweep run
 *     twice in a row from disagreeing with itself about the boundary.
 *
 * Ordered oldest-first with `id` as the tie-break so a report, a log line and a
 * test all see the same sequence on every run.
 */
export async function listOrphanMedia(input: { olderThan: Date }): Promise<OrphanMediaRow[]> {
  const olderThan = requireInstant(input.olderThan, 'listOrphanMedia')

  return db
    .select({
      id: listingMedia.id,
      listingId: listingMedia.listingId,
      url: listingMedia.url,
      createdAt: listingMedia.createdAt,
    })
    .from(listingMedia)
    .innerJoin(listing, eq(listing.id, listingMedia.listingId))
    .where(and(eq(listing.status, 'draft'), lt(listingMedia.createdAt, olderThan)))
    .orderBy(asc(listingMedia.createdAt), asc(listingMedia.id))
}

/** What one `collectOrphanMedia` run did, and what it refused to do. */
export interface OrphanCollectionReport {
  /** Rows where the key was deleted AND the row was removed. */
  removedRows: number
  /** Every storage key the store confirmed deleted, in the order it was asked. */
  deletedKeys: string[]
  /** Rows that survived the run, each with the reason it survived. */
  skipped: Array<{ id: string; reason: string }>
}

/**
 * Delete those keys from the given store and remove their rows. Reports what it did.
 *
 * `store` is `Pick<MediaStore, 'delete'>` and not the whole seam: collection has
 * no business issuing upload URLs, so it asks for the narrowest thing it uses.
 * `keyFromUrl` is the caller's url-to-key convention — `listing_media` stores a
 * url, not a key, so the mapping cannot live here.
 *
 * PER ROW, IN THIS ORDER:
 *   1. `keyFromUrl(row.url)` — a `null` (or blank) result skips the row with a
 *      reason and WITHOUT deleting anything; the row stays in the database so
 *      the mismatch can be investigated.
 *   2. `store.delete(key)` — a throw is rethrown immediately, naming the key, so
 *      a partially swept run cannot be mistaken for a successful one.
 *   3. `DELETE FROM listing_media WHERE id = row.id` — only after the object is
 *      gone. A row that another collector removed first is reported as skipped
 *      rather than counted, and its key stays in `deletedKeys` because the store
 *      really did delete it.
 *
 * A row is counted in `removedRows` only when both step 2 and step 3 succeeded.
 * The listing row itself is never touched.
 */
export async function collectOrphanMedia(input: {
  olderThan: Date
  store: Pick<MediaStore, 'delete'>
  keyFromUrl: (url: string) => string | null
}): Promise<OrphanCollectionReport> {
  const olderThan = requireInstant(input.olderThan, 'collectOrphanMedia')

  const candidates = await listOrphanMedia({ olderThan })

  const deletedKeys: string[] = []
  const skipped: Array<{ id: string; reason: string }> = []
  let removedRows = 0

  for (const row of candidates) {
    const key = input.keyFromUrl(row.url)

    if (key === null) {
      skipped.push({
        id: row.id,
        reason:
          `${SKIP_NO_STORAGE_KEY}: keyFromUrl returned null for url "${row.url}", so this row ` +
          'was left in the database and no object was deleted. Either the url does not encode ' +
          'a storage key or the store holds an object the database no longer describes.',
      })
      continue
    }

    if (key.trim() === '') {
      skipped.push({
        id: row.id,
        reason:
          `${SKIP_EMPTY_STORAGE_KEY}: keyFromUrl returned a blank key for url "${row.url}". ` +
          'Refusing to call delete(""), which in most backends addresses a prefix or the ' +
          "bucket root rather than the caller's object.",
      })
      continue
    }

    try {
      await input.store.delete(key)
    } catch (cause) {
      throw new Error(
        `collectOrphanMedia: the store refused to delete key "${key}" for listing_media row ` +
          `"${row.id}" (url "${row.url}"). The sweep stopped before removing that row, so the ` +
          'database still describes the object. Re-run after the store is reachable; keys ' +
          'already deleted this run are safe to delete again, and rows already removed are gone.',
        { cause },
      )
    }

    const removed = await db
      .delete(listingMedia)
      .where(eq(listingMedia.id, row.id))
      .returning({ id: listingMedia.id })

    if (removed.length === 0) {
      skipped.push({
        id: row.id,
        reason:
          `${SKIP_ROW_ALREADY_ABSENT}: the object for key "${key}" was deleted, but the ` +
          'listing_media row was already gone when this run reached it — a concurrent ' +
          'collector removed it first.',
      })
      deletedKeys.push(key)
      continue
    }

    if (removed.length > 1) {
      // `listing_media.id` is the primary key, so this cannot happen; returning
      // without a word would hide the only thing worse than a missing delete.
      throw new Error(
        `collectOrphanMedia: deleting listing_media row "${row.id}" removed ` +
          `${removed.length} rows, which contradicts its primary key. Refusing to report a count.`,
      )
    }

    deletedKeys.push(key)
    removedRows += 1
  }

  return { removedRows, deletedKeys, skipped }
}
