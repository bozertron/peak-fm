/**
 * Trade offers, including "Bid as Sale".
 *
 * A bidder may offer an item, an amount of money, or both. The owner may
 * accept, counter, or remove visibility from that user — the third of which is
 * a `listing_block` row rather than anything stored here, so a blocked bidder's
 * existing offers stay auditable instead of vanishing.
 *
 * Counters are modelled as offers with a `parentOfferId`, giving a full
 * negotiation chain rather than a mutable single row.
 */
import { pgTable, text, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { id, createdAt, updatedAt, currency } from './_shared'
import { user } from './auth'
import { listing } from './listing'

export const tradeOffer = pgTable(
  'trade_offer',
  {
    id: id(),
    listingId: text('listingId')
      .notNull()
      .references(() => listing.id, { onDelete: 'cascade' }),
    offererId: text('offererId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    /** Set when this offer is a counter to an earlier one. */
    parentOfferId: text('parentOfferId'),

    /** 'item' | 'cash' | 'mixed' */
    offerKind: text('offerKind').notNull(),

    /** Cash leg. Present for 'cash' and 'mixed'. */
    cashCents: integer('cashCents'),
    currency: currency(),

    /** Item leg: either one of the offerer's own listings, or free text. */
    offeredListingId: text('offeredListingId').references(() => listing.id, {
      onDelete: 'set null',
    }),
    offeredDescription: text('offeredDescription'),

    message: text('message'),

    /** 'open' | 'accepted' | 'countered' | 'declined' | 'withdrawn' */
    status: text('status').notNull().default('open'),
    respondedAt: timestamp('respondedAt'),

    threadId: text('threadId'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('trade_offer_listing_idx').on(t.listingId, t.status),
    index('trade_offer_offerer_idx').on(t.offererId),
    index('trade_offer_parent_idx').on(t.parentOfferId),
  ],
)

export type TradeOffer = typeof tradeOffer.$inferSelect
