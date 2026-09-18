/**
 * Orders, buyer questions, and the Accounting Package.
 *
 * Payment execution lives behind the PaymentProvider seam (see
 * `docs/PEAK-COMMERCE.md`). These tables record what Peak knows; the provider
 * records what the money did. `providerRef` is the join between them.
 */
import { pgTable, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { id, createdAt, updatedAt, currency, type OrderStatus, type ListingKind } from './_shared'
import { user } from './auth'
import { listing } from './listing'

/**
 * Buyer-authored questions attached to a listing before committing.
 *
 * "The user clicks the add, and if they're interested, they can set up
 * questions for the seller to answer." Questions belong to the buyer/listing
 * pair, not to the listing, so two buyers never see each other's diligence.
 */
export const buyerQuestion = pgTable(
  'buyer_question',
  {
    id: id(),
    listingId: text('listingId')
      .notNull()
      .references(() => listing.id, { onDelete: 'cascade' }),
    buyerId: text('buyerId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    position: integer('position').notNull().default(0),
    question: text('question').notNull(),
    answer: text('answer'),
    answeredAt: timestamp('answeredAt'),

    /** Set once the question has been posted into the Communicate thread. */
    threadId: text('threadId'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('buyer_question_listing_buyer_idx').on(t.listingId, t.buyerId, t.position)],
)

export const order = pgTable(
  'order',
  {
    id: id(),
    /** Human-facing reference, e.g. PK-2026-000184. Shown on the package. */
    reference: text('reference').notNull().unique(),

    listingId: text('listingId').references(() => listing.id),
    kind: text('kind').$type<ListingKind>().notNull(),
    status: text('status').$type<OrderStatus>().notNull().default('pending'),

    buyerId: text('buyerId')
      .notNull()
      .references(() => user.id),
    sellerId: text('sellerId')
      .notNull()
      .references(() => user.id),

    subtotalCents: integer('subtotalCents').notNull(),
    taxCents: integer('taxCents').notNull().default(0),
    feeCents: integer('feeCents').notNull().default(0),
    totalCents: integer('totalCents').notNull(),
    currency: currency(),

    /** Which thread the transaction happened inside. Commerce is in-chat. */
    threadId: text('threadId'),

    /** Opaque provider identifier — Stripe PaymentIntent id, etc. */
    providerRef: text('providerRef'),
    providerName: text('providerName'),

    placedAt: timestamp('placedAt'),
    completedAt: timestamp('completedAt'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('order_buyer_idx').on(t.buyerId, t.status),
    index('order_seller_idx').on(t.sellerId, t.status),
    index('order_listing_idx').on(t.listingId),
  ],
)

export const orderLine = pgTable(
  'order_line',
  {
    id: id(),
    orderId: text('orderId')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitPriceCents: integer('unitPriceCents').notNull(),
    taxCents: integer('taxCents').notNull().default(0),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('order_line_order_idx').on(t.orderId, t.position)],
)

/**
 * The Accounting Package row — one per order, generated on demand and then
 * frozen. Buy History and Sell History both export from here; `perspective`
 * is what contextualises the same order as a purchase or a sale.
 *
 * On tax content: `taxTreatment` and `reliefNotes` are RESEARCH OUTPUT, not
 * advice. `researchSources` must be non-empty whenever `reliefNotes` is set,
 * and `confidence` must be recorded. A package that cannot cite a source says
 * so on its face rather than asserting a write-off.
 */
export const accountingRecord = pgTable(
  'accounting_record',
  {
    id: id(),
    orderId: text('orderId')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),

    /** 'buyer' | 'seller' — the same order exports two different packages. */
    perspective: text('perspective').notNull(),

    itemDescription: text('itemDescription').notNull(),
    /** What it is FOR. The field that makes the package worth downloading. */
    itemPurpose: text('itemPurpose'),

    costCents: integer('costCents').notNull(),
    currency: currency(),

    /** [{ jurisdiction, label, rate, amountCents }] */
    taxAllocations: jsonb('taxAllocations').notNull().default([]),

    /** Optional double-entry hints, only when the user opted into tracking. */
    accountFrom: text('accountFrom'),
    accountTo: text('accountTo'),

    taxTreatment: text('taxTreatment'),
    reliefNotes: text('reliefNotes'),
    /** [{ title, url, retrievedAt, jurisdiction }] — required with reliefNotes. */
    researchSources: jsonb('researchSources').notNull().default([]),
    /** 'high' | 'medium' | 'low' | 'unsupported' */
    confidence: text('confidence').notNull().default('unsupported'),

    generatedAt: timestamp('generatedAt').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index('accounting_record_order_idx').on(t.orderId, t.perspective)],
)

export type Order = typeof order.$inferSelect
export type AccountingRecord = typeof accountingRecord.$inferSelect
