/**
 * Find: permanent demand signals.
 *
 * THE INVARIANT: a Find item ends as a Find item. It is never converted into a
 * listing, and nothing in this schema provides a path to do so — there is no
 * `convertedToListingId` column, deliberately. Promoting demand into the Buy
 * catalogue would duplicate supply and clutter the focused buying experience.
 *
 * A Find is created from a [Find] button anywhere in the product. The origin
 * metadata is captured at that moment and kept, because it is what makes
 * matchmaking work: a Find raised from a bathroom-reno Plan carries different
 * context than one raised from a Buy filter that returned nothing.
 */
import { pgTable, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { id, createdAt, updatedAt, currency, type FindStatus } from './_shared'
import { user } from './auth'
import { market, category } from './market'

export const findRequest = pgTable(
  'find_request',
  {
    id: id(),
    seekerId: text('seekerId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    marketId: text('marketId')
      .notNull()
      .references(() => market.id),
    categoryId: text('categoryId').references(() => category.id),

    title: text('title').notNull(),
    details: text('details'),

    /** Optional budget signal, helps matching rank responders. */
    budgetMinCents: integer('budgetMinCents'),
    budgetMaxCents: integer('budgetMaxCents'),
    currency: currency(),

    /** Where the [Find] button was pressed: 'buy' | 'rent' | 'plans' | ... */
    originSurface: text('originSurface').notNull(),
    /** What it was pressed on: 'listing' | 'plan' | 'search' | 'thread'. */
    originEntityType: text('originEntityType'),
    originEntityId: text('originEntityId'),
    /** The metadata snapshot read off the origin at capture time. */
    originMetadata: jsonb('originMetadata').notNull().default({}),

    status: text('status').$type<FindStatus>().notNull().default('open'),
    /** Only ever set by the seeker. A match does not satisfy a Find; the
     *  seeker saying it is satisfied does. */
    satisfiedAt: timestamp('satisfiedAt'),
    satisfiedNote: text('satisfiedNote'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('find_request_market_idx').on(t.marketId, t.status),
    index('find_request_seeker_idx').on(t.seekerId, t.status),
    index('find_request_category_idx').on(t.categoryId, t.status),
  ],
)

/**
 * A proposed answer to a Find, from someone with the means to satisfy it.
 * This is the matchmaker's output. A match may point at a listing, a plan
 * proposal, or a person — never at a converted Find.
 */
export const findMatch = pgTable(
  'find_match',
  {
    id: id(),
    findRequestId: text('findRequestId')
      .notNull()
      .references(() => findRequest.id, { onDelete: 'cascade' }),
    responderId: text('responderId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    /** 'listing' | 'plan_proposal' | 'person' */
    matchKind: text('matchKind').notNull(),
    matchRefId: text('matchRefId'),

    /** 0-100. How the matchmaker ranked this; null when self-offered. */
    score: integer('score'),
    /** Which signals produced the score, so a bad match can be explained. */
    scoreBasis: jsonb('scoreBasis').notNull().default({}),

    message: text('message'),
    /** 'proposed' | 'seen' | 'accepted' | 'declined' | 'withdrawn' */
    status: text('status').notNull().default('proposed'),

    threadId: text('threadId'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('find_match_request_idx').on(t.findRequestId, t.status),
    index('find_match_responder_idx').on(t.responderId, t.status),
  ],
)

export type FindRequest = typeof findRequest.$inferSelect
export type FindMatch = typeof findMatch.$inferSelect
