/**
 * Plans: Personal, Business, Community.
 *
 * The three scopes share one table because the worked example in the spec
 * crosses them: a homeowner's Personal "Bathroom Reno" plan raises a Find; a
 * plumber sees that Find and answers with a Business plan carrying price,
 * timeline and guarantees. Same shape, different scope, one join.
 *
 * Community is the third scope: local events and government announcements
 * seeking citizen feedback.
 */
import { pgTable, text, integer, timestamp, boolean, jsonb, index } from 'drizzle-orm/pg-core'
import { id, createdAt, updatedAt, currency, type PlanScope } from './_shared'
import { user } from './auth'
import { market } from './market'
import { findRequest } from './find'

export const plan = pgTable(
  'plan',
  {
    id: id(),
    scope: text('scope').$type<PlanScope>().notNull(),
    ownerId: text('ownerId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    marketId: text('marketId')
      .notNull()
      .references(() => market.id),

    title: text('title').notNull(),
    summary: text('summary'),
    description: text('description'),

    budgetCents: integer('budgetCents'),
    currency: currency(),
    startAt: timestamp('startAt'),
    endAt: timestamp('endAt'),

    /** 'private' | 'market' | 'public' */
    visibility: text('visibility').notNull().default('private'),
    status: text('status').notNull().default('draft'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('plan_owner_idx').on(t.ownerId, t.scope, t.status),
    index('plan_market_idx').on(t.marketId, t.scope, t.visibility),
  ],
)

export const planStep = pgTable(
  'plan_step',
  {
    id: id(),
    planId: text('planId')
      .notNull()
      .references(() => plan.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    title: text('title').notNull(),
    description: text('description'),
    durationDays: integer('durationDays'),
    costCents: integer('costCents'),
    completedAt: timestamp('completedAt'),
  },
  (t) => [index('plan_step_plan_idx').on(t.planId, t.position)],
)

/**
 * A Business plan offered in answer to a Find. This is the plumber's reply:
 * plan + price + timeline + guarantees, sent to the person trying to find help.
 */
export const planProposal = pgTable(
  'plan_proposal',
  {
    id: id(),
    planId: text('planId')
      .notNull()
      .references(() => plan.id, { onDelete: 'cascade' }),
    /** The Find this answers. Null for an unsolicited proposal. */
    findRequestId: text('findRequestId').references(() => findRequest.id, {
      onDelete: 'set null',
    }),
    providerId: text('providerId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    recipientId: text('recipientId').references(() => user.id, { onDelete: 'cascade' }),

    priceCents: integer('priceCents').notNull(),
    currency: currency(),
    /** [{ label, startOffsetDays, durationDays }] */
    timeline: jsonb('timeline').notNull().default([]),
    guaranteeText: text('guaranteeText'),
    validUntil: timestamp('validUntil'),

    /** 'sent' | 'seen' | 'accepted' | 'declined' | 'expired' | 'withdrawn' */
    status: text('status').notNull().default('sent'),
    respondedAt: timestamp('respondedAt'),

    threadId: text('threadId'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('plan_proposal_find_idx').on(t.findRequestId, t.status),
    index('plan_proposal_provider_idx').on(t.providerId, t.status),
    index('plan_proposal_recipient_idx').on(t.recipientId, t.status),
  ],
)

/**
 * Community scope content: local events and government announcements, the
 * latter often looking for citizen feedback.
 */
export const communityItem = pgTable(
  'community_item',
  {
    id: id(),
    marketId: text('marketId')
      .notNull()
      .references(() => market.id),
    /** 'event' | 'announcement' | 'consultation' */
    kind: text('kind').notNull(),

    /** Null for an item posted by the operator rather than a member. */
    authorId: text('authorId').references(() => user.id, { onDelete: 'set null' }),
    /** e.g. "RDCO", "District of Big White" — shown when there is no author. */
    sourceName: text('sourceName'),
    sourceUrl: text('sourceUrl'),

    title: text('title').notNull(),
    body: text('body').notNull(),
    locationName: text('locationName'),

    startsAt: timestamp('startsAt'),
    endsAt: timestamp('endsAt'),

    /** Consultations collect feedback; events and announcements may not. */
    feedbackOpen: boolean('feedbackOpen').notNull().default(false),
    feedbackClosesAt: timestamp('feedbackClosesAt'),

    status: text('status').notNull().default('published'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('community_item_market_idx').on(t.marketId, t.kind, t.status),
    index('community_item_starts_idx').on(t.startsAt),
  ],
)

export const communityFeedback = pgTable(
  'community_feedback',
  {
    id: id(),
    itemId: text('itemId')
      .notNull()
      .references(() => communityItem.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    /** 'support' | 'oppose' | 'neutral' — optional explicit stance. */
    stance: text('stance'),
    createdAt: createdAt(),
  },
  (t) => [index('community_feedback_item_idx').on(t.itemId)],
)

export type Plan = typeof plan.$inferSelect
export type PlanProposal = typeof planProposal.$inferSelect
export type CommunityItem = typeof communityItem.$inferSelect
