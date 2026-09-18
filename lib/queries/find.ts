import { and, desc, eq, sql, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { findRequest, findMatch, user, category } from '@/lib/db/schema'

/** A seeker's own Find requests. They persist until satisfied or withdrawn. */
export async function listMyFinds(seekerId: string, limit = 50) {
  const rows = await db
    .select({
      id: findRequest.id,
      title: findRequest.title,
      details: findRequest.details,
      status: findRequest.status,
      originSurface: findRequest.originSurface,
      createdAt: findRequest.createdAt,
      satisfiedAt: findRequest.satisfiedAt,
      categoryName: category.name,
    })
    .from(findRequest)
    .leftJoin(category, eq(category.id, findRequest.categoryId))
    .where(eq(findRequest.seekerId, seekerId))
    .orderBy(desc(findRequest.createdAt))
    .limit(limit)

  if (rows.length === 0) return rows.map((r) => ({ ...r, matchCount: 0 }))

  const counts = await db
    .select({ findRequestId: findMatch.findRequestId, count: sql<number>`count(*)::int` })
    .from(findMatch)
    .groupBy(findMatch.findRequestId)

  const byFind = new Map(counts.map((c) => [c.findRequestId, c.count]))
  return rows.map((r) => ({ ...r, matchCount: byFind.get(r.id) ?? 0 }))
}

/**
 * Open Finds in a market that someone else raised — the demand board a
 * supplier reads. Excludes the viewer's own, since you cannot answer yourself.
 */
export async function listOpenFinds(marketId: string, viewerId?: string, limit = 50) {
  const conditions = [eq(findRequest.marketId, marketId), eq(findRequest.status, 'open')]
  if (viewerId) conditions.push(ne(findRequest.seekerId, viewerId))

  return db
    .select({
      id: findRequest.id,
      title: findRequest.title,
      details: findRequest.details,
      budgetMinCents: findRequest.budgetMinCents,
      budgetMaxCents: findRequest.budgetMaxCents,
      currency: findRequest.currency,
      createdAt: findRequest.createdAt,
      seekerName: user.name,
      categoryName: category.name,
    })
    .from(findRequest)
    .innerJoin(user, eq(user.id, findRequest.seekerId))
    .leftJoin(category, eq(category.id, findRequest.categoryId))
    .where(and(...conditions))
    .orderBy(desc(findRequest.createdAt))
    .limit(limit)
}
