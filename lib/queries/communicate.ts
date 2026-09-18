import { and, eq, isNull, or, lt, sql, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { thread, threadParticipant } from '@/lib/db/schema'

/**
 * Threads with messages the user has not read.
 *
 * "Unread" is `thread.lastMessageAt > participant.lastReadAt`, with a null
 * `lastReadAt` counting as unread for any thread that has a message at all.
 * Archived and per-user-deleted threads are excluded — the badge must agree
 * with what the inbox actually shows.
 */
export async function countUnreadThreads(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(threadParticipant)
    .innerJoin(thread, eq(thread.id, threadParticipant.threadId))
    .where(
      and(
        eq(threadParticipant.userId, userId),
        isNull(threadParticipant.archivedAt),
        isNull(threadParticipant.deletedAt),
        sql`${thread.lastMessageAt} IS NOT NULL`,
        or(
          isNull(threadParticipant.lastReadAt),
          lt(threadParticipant.lastReadAt, thread.lastMessageAt),
        ),
      ),
    )
  return row?.count ?? 0
}

/** The user's inbox, most recent first. Excludes archived and deleted. */
export async function listThreads(userId: string, limit = 50) {
  return db
    .select({
      id: thread.id,
      title: thread.title,
      subjectType: thread.subjectType,
      subjectId: thread.subjectId,
      lastMessageAt: thread.lastMessageAt,
      lastMessagePreview: thread.lastMessagePreview,
      messageCount: thread.messageCount,
      lastReadAt: threadParticipant.lastReadAt,
      role: threadParticipant.role,
    })
    .from(threadParticipant)
    .innerJoin(thread, eq(thread.id, threadParticipant.threadId))
    .where(
      and(
        eq(threadParticipant.userId, userId),
        isNull(threadParticipant.archivedAt),
        isNull(threadParticipant.deletedAt),
      ),
    )
    .orderBy(desc(thread.lastMessageAt))
    .limit(limit)
}
