import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tradeOffer, listing, user } from '@/lib/db/schema'

/**
 * Offers awaiting a response from a listing owner.
 *
 * Only `open` offers are returned: an accepted or declined offer is history,
 * and a countered one is represented by its child rather than itself.
 */
export async function listOffersForOwner(ownerId: string, limit = 25) {
  return db
    .select({
      id: tradeOffer.id,
      listingId: tradeOffer.listingId,
      listingTitle: listing.title,
      offererName: user.name,
      offerKind: tradeOffer.offerKind,
      cashCents: tradeOffer.cashCents,
      currency: tradeOffer.currency,
      offeredDescription: tradeOffer.offeredDescription,
      message: tradeOffer.message,
      status: tradeOffer.status,
      createdAt: tradeOffer.createdAt,
    })
    .from(tradeOffer)
    .innerJoin(listing, eq(listing.id, tradeOffer.listingId))
    .innerJoin(user, eq(user.id, tradeOffer.offererId))
    .where(and(eq(listing.sellerId, ownerId), eq(tradeOffer.status, 'open')))
    .orderBy(desc(tradeOffer.createdAt))
    .limit(limit)
}

/** The full negotiation chain on a listing, oldest first. */
export async function listOfferChain(listingId: string) {
  return db
    .select()
    .from(tradeOffer)
    .where(eq(tradeOffer.listingId, listingId))
    .orderBy(tradeOffer.createdAt)
}

/** Offers a user has made, across listings. */
export async function listOffersByUser(offererId: string, limit = 50) {
  return db
    .select({
      id: tradeOffer.id,
      listingTitle: listing.title,
      offerKind: tradeOffer.offerKind,
      cashCents: tradeOffer.cashCents,
      currency: tradeOffer.currency,
      status: tradeOffer.status,
      createdAt: tradeOffer.createdAt,
    })
    .from(tradeOffer)
    .innerJoin(listing, eq(listing.id, tradeOffer.listingId))
    .where(eq(tradeOffer.offererId, offererId))
    .orderBy(desc(tradeOffer.createdAt))
    .limit(limit)
}
