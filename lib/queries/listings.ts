import { and, eq, gte, lte, ilike, desc, asc, sql, inArray, notInArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  listing,
  listingMedia,
  listingBlock,
  user,
  category,
  type ListingKind,
} from '@/lib/db/schema'

export type ListingFilters = {
  marketId: string
  kind: ListingKind
  categorySlug?: string
  q?: string
  minCents?: number
  maxCents?: number
  offeringType?: 'goods' | 'service'
  sort?: 'newest' | 'price-asc' | 'price-desc'
  /** Excludes listings whose owner has removed visibility from this viewer. */
  viewerId?: string
  limit?: number
  offset?: number
}

export type ListingCard = {
  id: string
  title: string
  summary: string | null
  priceCents: number | null
  currency: string
  pricingUnit: string | null
  offeringType: string
  bidAsSale: boolean
  locationName: string | null
  publishedAt: Date | null
  sellerName: string
  sellerAvatarKind: string
  sellerAvatarSeed: string | null
  categoryName: string | null
  imageUrl: string | null
}

/**
 * The browse query behind Buy, Rent and Trade.
 *
 * One implementation for all three because they differ only by `kind`. The
 * filters are real SQL predicates, not client-side array filtering — a market
 * with ten thousand listings must not ship all of them to the browser.
 */
export async function listListings(filters: ListingFilters): Promise<ListingCard[]> {
  const {
    marketId,
    kind,
    categorySlug,
    q,
    minCents,
    maxCents,
    offeringType,
    sort = 'newest',
    viewerId,
    limit = 48,
    offset = 0,
  } = filters

  const conditions = [
    eq(listing.marketId, marketId),
    eq(listing.kind, kind),
    eq(listing.status, 'active'),
  ]

  if (categorySlug) {
    const [cat] = await db
      .select({ id: category.id })
      .from(category)
      .where(eq(category.slug, categorySlug))
      .limit(1)
    // An unknown slug must return nothing rather than silently returning all.
    if (!cat) return []
    conditions.push(eq(listing.categoryId, cat.id))
  }

  if (q) {
    const pattern = `%${q}%`
    conditions.push(
      sql`(${listing.title} ILIKE ${pattern} OR ${listing.summary} ILIKE ${pattern} OR ${listing.description} ILIKE ${pattern})`,
    )
  }
  if (typeof minCents === 'number') conditions.push(gte(listing.priceCents, minCents))
  if (typeof maxCents === 'number') conditions.push(lte(listing.priceCents, maxCents))
  if (offeringType) conditions.push(eq(listing.offeringType, offeringType))

  if (viewerId) {
    const blocked = db
      .select({ id: listingBlock.listingId })
      .from(listingBlock)
      .where(eq(listingBlock.blockedUserId, viewerId))
    conditions.push(notInArray(listing.id, blocked))
  }

  const order =
    sort === 'price-asc'
      ? asc(listing.priceCents)
      : sort === 'price-desc'
        ? desc(listing.priceCents)
        : desc(listing.publishedAt)

  const rows = await db
    .select({
      id: listing.id,
      title: listing.title,
      summary: listing.summary,
      priceCents: listing.priceCents,
      currency: listing.currency,
      pricingUnit: listing.pricingUnit,
      offeringType: listing.offeringType,
      bidAsSale: listing.bidAsSale,
      locationName: listing.locationName,
      publishedAt: listing.publishedAt,
      sellerName: user.name,
      sellerAvatarKind: user.avatarKind,
      sellerAvatarSeed: user.avatarSeed,
      categoryName: category.name,
    })
    .from(listing)
    .innerJoin(user, eq(user.id, listing.sellerId))
    .leftJoin(category, eq(category.id, listing.categoryId))
    .where(and(...conditions))
    .orderBy(order)
    .limit(limit)
    .offset(offset)

  if (rows.length === 0) return []

  // Cover images in one round trip rather than N.
  const media = await db
    .select({ listingId: listingMedia.listingId, url: listingMedia.url, position: listingMedia.position })
    .from(listingMedia)
    .where(
      inArray(
        listingMedia.listingId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(listingMedia.position))

  const cover = new Map<string, string>()
  for (const m of media) if (!cover.has(m.listingId)) cover.set(m.listingId, m.url)

  return rows.map((r) => ({ ...r, imageUrl: cover.get(r.id) ?? null }))
}

/** Per-kind counts for a market. Drives the landing pitch and admin. */
export async function countListingsByKind(marketId?: string) {
  const rows = await db
    .select({ kind: listing.kind, status: listing.status, count: sql<number>`count(*)::int` })
    .from(listing)
    .where(marketId ? eq(listing.marketId, marketId) : undefined)
    .groupBy(listing.kind, listing.status)

  const totals: Record<string, number> = { sale: 0, rental: 0, trade: 0 }
  for (const r of rows) if (r.status === 'active') totals[r.kind] = (totals[r.kind] ?? 0) + r.count
  return totals
}
