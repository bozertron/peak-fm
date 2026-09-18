/**
 * Communicate: the hub for all communication between users, on all topics.
 *
 * A thread is polymorphic over its subject (`subjectType` + `subjectId`) so a
 * conversation about a listing, a Find, a plan proposal or an order is the same
 * object with the same archive, delete and action affordances. This is what
 * lets the transaction happen inside the chat: an `offer` or `checkout` message
 * carries its payload in `payload`, and the order row points back at
 * `threadId`.
 */
import { pgTable, text, timestamp, boolean, jsonb, integer, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { id, createdAt, updatedAt } from './_shared'
import { user } from './auth'
import { market } from './market'

export const thread = pgTable(
  'thread',
  {
    id: id(),
    /** 'direct' | 'listing' | 'find' | 'plan' | 'order' | 'community' */
    subjectType: text('subjectType').notNull().default('direct'),
    subjectId: text('subjectId'),

    marketId: text('marketId').references(() => market.id),
    title: text('title'),

    /** Denormalised for inbox ordering without a join on every row. */
    lastMessageAt: timestamp('lastMessageAt'),
    lastMessagePreview: text('lastMessagePreview'),
    messageCount: integer('messageCount').notNull().default(0),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('thread_subject_idx').on(t.subjectType, t.subjectId),
    index('thread_recent_idx').on(t.lastMessageAt),
  ],
)

/**
 * Per-participant state. Archive and delete are per-person, not per-thread —
 * one party archiving must not remove the other party's copy.
 */
export const threadParticipant = pgTable(
  'thread_participant',
  {
    id: id(),
    threadId: text('threadId')
      .notNull()
      .references(() => thread.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    /** 'buyer' | 'seller' | 'seeker' | 'provider' | 'member' */
    role: text('role').notNull().default('member'),

    lastReadAt: timestamp('lastReadAt'),
    archivedAt: timestamp('archivedAt'),
    mutedAt: timestamp('mutedAt'),
    /** Soft delete: hides the thread for this user only. */
    deletedAt: timestamp('deletedAt'),

    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('thread_participant_unique').on(t.threadId, t.userId),
    index('thread_participant_inbox_idx').on(t.userId, t.archivedAt, t.deletedAt),
  ],
)

export const message = pgTable(
  'message',
  {
    id: id(),
    threadId: text('threadId')
      .notNull()
      .references(() => thread.id, { onDelete: 'cascade' }),
    senderId: text('senderId').references(() => user.id, { onDelete: 'set null' }),

    /**
     * 'text'      — ordinary message
     * 'offer'     — a trade offer or price proposal rendered as a card
     * 'checkout'  — the in-chat commerce step; payload carries the order ref
     * 'question'  — a buyer question set posted to the seller
     * 'system'    — status change written by the platform, no sender
     */
    kind: text('kind').notNull().default('text'),
    body: text('body'),
    payload: jsonb('payload'),

    editedAt: timestamp('editedAt'),
    deletedAt: timestamp('deletedAt'),
    createdAt: createdAt(),
  },
  (t) => [index('message_thread_idx').on(t.threadId, t.createdAt)],
)

export const messageAttachment = pgTable(
  'message_attachment',
  {
    id: id(),
    messageId: text('messageId')
      .notNull()
      .references(() => message.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    contentType: text('contentType').notNull(),
    byteSize: integer('byteSize'),
    fileName: text('fileName'),
    createdAt: createdAt(),
  },
  (t) => [index('message_attachment_message_idx').on(t.messageId)],
)

/**
 * The market bulletin: one-to-many local posts, as opposed to threads which
 * are conversations. Replies to a bulletin post open a normal thread.
 */
export const bulletinPost = pgTable(
  'bulletin_post',
  {
    id: id(),
    marketId: text('marketId')
      .notNull()
      .references(() => market.id),
    authorId: text('authorId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    pinned: boolean('pinned').notNull().default(false),
    status: text('status').notNull().default('published'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('bulletin_market_idx').on(t.marketId, t.status, t.createdAt)],
)

export type Thread = typeof thread.$inferSelect
export type Message = typeof message.$inferSelect
