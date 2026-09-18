import { desc, eq, sql, and, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { listing, listingMedia, order } from '@/lib/db/schema'

/** Every listing a seller owns, any kind, any status. Their desk. */
export async function listSellerListings(sellerId: string, limit = 100) {
  const rows = await db
    .select({
      id: listing.id,
      title: listing.title,
      kind: listing.kind,
      offeringType: listing.offeringType,
      status: listing.status,
      priceCents: listing.priceCents,
      currency: listing.currency,
      pricingUnit: listing.pricingUnit,
      updatedAt: listing.updatedAt,
    })
    .from(listing)
    .where(eq(listing.sellerId, sellerId))
    .orderBy(desc(listing.updatedAt))
    .limit(limit)

  if (rows.length === 0) return rows.map((r) => ({ ...r, mediaCount: 0 }))

  const counts = await db
    .select({ listingId: listingMedia.listingId, count: sql<number>`count(*)::int` })
    .from(listingMedia)
    .where(
      inArray(
        listingMedia.listingId,
        rows.map((r) => r.id),
      ),
    )
    .groupBy(listingMedia.listingId)

  const byListing = new Map(counts.map((c) => [c.listingId, c.count]))
  return rows.map((r) => ({ ...r, mediaCount: byListing.get(r.id) ?? 0 }))
}

/**
 * Completed-sale totals for a seller.
 *
 * Only `paid` and `fulfilled` orders count. A pending order is not revenue,
 * and reporting it as such would overstate what the seller actually earned.
 */
export async function sellerTotals(sellerId: string) {
  const [row] = await db
    .select({
      orderCount: sql<number>`count(*)::int`,
      grossCents: sql<number>`coalesce(sum(${order.totalCents}), 0)::int`,
    })
    .from(order)
    .where(and(eq(order.sellerId, sellerId), inArray(order.status, ['paid', 'fulfilled'])))

  return { orderCount: row?.orderCount ?? 0, grossCents: row?.grossCents ?? 0 }
}
