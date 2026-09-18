import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bulletinPost, user } from '@/lib/db/schema'

/** Published bulletin posts for a market, pinned first then newest. */
export async function listBulletin(marketId: string, limit = 20) {
  return db
    .select({
      id: bulletinPost.id,
      title: bulletinPost.title,
      body: bulletinPost.body,
      pinned: bulletinPost.pinned,
      createdAt: bulletinPost.createdAt,
      authorName: user.name,
    })
    .from(bulletinPost)
    .innerJoin(user, eq(user.id, bulletinPost.authorId))
    .where(and(eq(bulletinPost.marketId, marketId), eq(bulletinPost.status, 'published')))
    .orderBy(desc(bulletinPost.pinned), desc(bulletinPost.createdAt))
    .limit(limit)
}
