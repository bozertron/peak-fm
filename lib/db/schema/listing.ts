/**
 * The listing spine shared by Buy, Sell, Rent and Trade.
 *
 * One table, discriminated by `kind`. Buy and Sell are two views of the same
 * `kind: 'sale'` row — the seller's view and the buyer's view. Rent and Trade
 * add their own satellite tables rather than forking the spine, so a filter,
 * a media gallery or a block written once works on all four surfaces.
 */
import {
  pgTable,
  text,
  integer,
  boolean,
  doublePrecision,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import {
  id,
  createdAt,
  updatedAt,
  currency,
  type ListingKind,
  type ListingStatus,
  type OfferingType,
} from './_shared'
import { user } from './auth'
import { market, category } from './market'

export const listing = pgTable(
  'listing',
  {
    id: id(),
    kind: text('kind').$type<ListingKind>().notNull(),
    offeringType: text('offeringType').$type<OfferingType>().notNull().default('goods'),
    status: text('status').$type<ListingStatus>().notNull().default('draft'),

    sellerId: text('sellerId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    marketId: text('marketId')
      .notNull()
      .references(() => market.id),
    categoryId: text('categoryId').references(() => category.id),

    title: text('title').notNull(),
    summary: text('summary'),
    description: text('description'),

    /**
     * For 'sale' this is the asking price. For 'rental' it is the rate per
     * `pricingUnit`. For 'trade' it is nullable: a Trade listing carries no
     * fixed price, because "Bid as Sale" lets a bidder name any amount.
     */
    priceCents: integer('priceCents'),
    currency: currency(),
    pricingUnit: text('pricingUnit'),

    /**
     * Trade only. When true a bidder may offer cash instead of, or alongside,
     * an item. This is set once at creation and is NOT negotiable afterwards.
     */
    bidAsSale: boolean('bidAsSale').notNull().default(false),

    locationName: text('locationName'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),

    /** Denormalised counters, maintained by the surfaces that own them. */
    viewCount: integer('viewCount').notNull().default(0),
    saveCount: integer('saveCount').notNull().default(0),

    publishedAt: timestamp('publishedAt'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('listing_browse_idx').on(t.marketId, t.kind, t.status),
    index('listing_seller_idx').on(t.sellerId),
    index('listing_category_idx').on(t.categoryId),
    index('listing_published_idx').on(t.publishedAt),
  ],
)

export const listingMedia = pgTable(
  'listing_media',
  {
    id: id(),
    listingId: text('listingId')
      .notNull()
      .references(() => listing.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    kind: text('kind').notNull().default('image'),
    alt: text('alt'),
    position: integer('position').notNull().default(0),

    /**
     * True when the photo came from the in-app camera rather than a file
     * picker. Presentation quality scoring treats these differently.
     */
    capturedInApp: boolean('capturedInApp').notNull().default(false),

    createdAt: createdAt(),
  },
  (t) => [index('listing_media_listing_idx').on(t.listingId, t.position)],
)

/**
 * Typed, filterable facets. Buy's "really great filtering" reads this table,
 * which is why filters are data rather than hardcoded per category.
 */
export const listingAttribute = pgTable(
  'listing_attribute',
  {
    id: id(),
    listingId: text('listingId')
      .notNull()
      .references(() => listing.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    valueText: text('valueText'),
    valueNumber: doublePrecision('valueNumber'),
    valueBool: boolean('valueBool'),
  },
  (t) => [
    uniqueIndex('listing_attribute_unique').on(t.listingId, t.key),
    index('listing_attribute_filter_idx').on(t.key, t.valueText),
  ],
)

/**
 * Per-listing visibility removal. This is what Trade's "remove visibility from
 * that user" compiles down to, and it is reused wherever a seller needs to
 * stop dealing with someone without a platform-wide block.
 */
export const listingBlock = pgTable(
  'listing_block',
  {
    id: id(),
    listingId: text('listingId')
      .notNull()
      .references(() => listing.id, { onDelete: 'cascade' }),
    blockedUserId: text('blockedUserId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('listing_block_unique').on(t.listingId, t.blockedUserId)],
)

/**
 * The Product Widget. Optional for a physical product, MANDATORY for a service
 * product presentation. It renders at the top level of the listing as service
 * overview + pricing + booking tool, so a house-cleaning service is bookable
 * without drilling in.
 */
export const serviceWidget = pgTable(
  'service_widget',
  {
    id: id(),
    listingId: text('listingId')
      .notNull()
      .unique()
      .references(() => listing.id, { onDelete: 'cascade' }),

    headline: text('headline').notNull(),
    overview: text('overview').notNull(),

    /** 'request' = seller confirms; 'instant' = slot is booked immediately. */
    bookingMode: text('bookingMode').notNull().default('request'),
    leadTimeHours: integer('leadTimeHours').notNull().default(24),
    serviceAreaKm: integer('serviceAreaKm').notNull().default(25),

    /**
     * 'llm' when the LLM-assisted creator drafted it, 'manual' when hand
     * written. Recorded so drafts can be re-run and so LLM output is never
     * silently presented as the seller's own words.
     */
    generatedBy: text('generatedBy').notNull().default('manual'),
    /** Full generation transcript: prompt, model, revisions the seller kept. */
    generationLog: jsonb('generationLog'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
)

export const servicePricingTier = pgTable(
  'service_pricing_tier',
  {
    id: id(),
    widgetId: text('widgetId')
      .notNull()
      .references(() => serviceWidget.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    description: text('description'),
    priceCents: integer('priceCents').notNull(),
    /** 'flat' | 'hour' | 'visit' | 'sqft' — the unit the price is quoted in. */
    unit: text('unit').notNull().default('flat'),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('service_pricing_tier_widget_idx').on(t.widgetId, t.position)],
)

export const serviceBooking = pgTable(
  'service_booking',
  {
    id: id(),
    widgetId: text('widgetId')
      .notNull()
      .references(() => serviceWidget.id, { onDelete: 'cascade' }),
    tierId: text('tierId').references(() => servicePricingTier.id),
    customerId: text('customerId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    startAt: timestamp('startAt').notNull(),
    endAt: timestamp('endAt'),
    status: text('status').notNull().default('requested'),
    note: text('note'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('service_booking_widget_idx').on(t.widgetId, t.startAt),
    index('service_booking_customer_idx').on(t.customerId),
  ],
)

export type Listing = typeof listing.$inferSelect
export type ListingMedia = typeof listingMedia.$inferSelect
