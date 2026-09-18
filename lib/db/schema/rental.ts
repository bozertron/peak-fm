/**
 * Rent: agreements, the ROI explorer, and auto-pay contracts.
 *
 * The three creation options from the spec map to three tables:
 *   1. Build Rental          → `listing` (kind 'rental') + `roiModel.listingId`
 *   2. Explore ROI           → `roiModel` standing alone until it exports
 *   3. Auto-Pay Contract     → `autopayContract`
 */
import { pgTable, text, integer, timestamp, jsonb, boolean, index } from 'drizzle-orm/pg-core'
import { id, createdAt, updatedAt, currency } from './_shared'
import { user } from './auth'
import { listing } from './listing'

/**
 * An ROI exploration. Exists BEFORE a listing does — the whole point is that
 * the owner decides whether to do it at all. `listingId` stays null until the
 * model exports into Build Rental, which is the only path that sets it.
 */
export const roiModel = pgTable(
  'roi_model',
  {
    id: id(),
    ownerId: text('ownerId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Null until the model is exported into a rental listing. */
    listingId: text('listingId').references(() => listing.id, { onDelete: 'set null' }),

    assetName: text('assetName').notNull(),
    categoryId: text('categoryId'),

    // --- Inputs the owner supplies ---
    acquisitionCostCents: integer('acquisitionCostCents').notNull().default(0),
    annualMaintenanceCents: integer('annualMaintenanceCents').notNull().default(0),
    annualCarryingCents: integer('annualCarryingCents').notNull().default(0),
    targetRecoupMonths: integer('targetRecoupMonths').notNull().default(24),
    /** Owner's own estimate, 0-100. Compared against observed demand. */
    expectedUtilizationPct: integer('expectedUtilizationPct').notNull().default(30),
    currency: currency(),

    // --- Computed outputs, recomputed on every edit ---
    /** Historical demand actually observed in this market for this category. */
    demandEvidence: jsonb('demandEvidence').notNull().default({}),
    suggestedRateCents: integer('suggestedRateCents'),
    suggestedUnit: text('suggestedUnit').notNull().default('day'),
    breakEvenMonths: integer('breakEvenMonths'),
    /** Full scenario table: [{ rateCents, utilizationPct, monthsToRecoup }] */
    scenarios: jsonb('scenarios').notNull().default([]),

    /** Conditions the owner decided on while exploring, carried into Review. */
    conditions: jsonb('conditions').notNull().default([]),

    /** Set when the model is pushed into Build Rental. */
    exportedAt: timestamp('exportedAt'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('roi_model_owner_idx').on(t.ownerId), index('roi_model_listing_idx').on(t.listingId)],
)

export const rentalAgreement = pgTable(
  'rental_agreement',
  {
    id: id(),
    reference: text('reference').notNull().unique(),

    listingId: text('listingId')
      .notNull()
      .references(() => listing.id),
    ownerId: text('ownerId')
      .notNull()
      .references(() => user.id),
    renterId: text('renterId')
      .notNull()
      .references(() => user.id),

    startAt: timestamp('startAt').notNull(),
    endAt: timestamp('endAt'),
    rateCents: integer('rateCents').notNull(),
    unit: text('unit').notNull().default('day'),
    depositCents: integer('depositCents').notNull().default(0),
    currency: currency(),

    /** Copied from the ROI model at signing so later edits cannot rewrite it. */
    conditions: jsonb('conditions').notNull().default([]),

    status: text('status').notNull().default('draft'),
    signedAt: timestamp('signedAt'),
    endedAt: timestamp('endedAt'),

    threadId: text('threadId'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('rental_agreement_owner_idx').on(t.ownerId, t.status),
    index('rental_agreement_renter_idx').on(t.renterId, t.status),
  ],
)

/**
 * Recurring collection against a rental agreement, executed through the
 * financial integration. `providerRef` points at the provider subscription.
 */
export const autopayContract = pgTable(
  'autopay_contract',
  {
    id: id(),
    agreementId: text('agreementId')
      .notNull()
      .references(() => rentalAgreement.id, { onDelete: 'cascade' }),

    /** 'weekly' | 'biweekly' | 'monthly' */
    cadence: text('cadence').notNull().default('monthly'),
    amountCents: integer('amountCents').notNull(),
    currency: currency(),

    startAt: timestamp('startAt').notNull(),
    endAt: timestamp('endAt'),
    nextRunAt: timestamp('nextRunAt'),

    /** Both parties must consent before any money moves on a schedule. */
    ownerAcceptedAt: timestamp('ownerAcceptedAt'),
    renterAcceptedAt: timestamp('renterAcceptedAt'),
    active: boolean('active').notNull().default(false),

    providerRef: text('providerRef'),
    providerName: text('providerName'),
    status: text('status').notNull().default('pending'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('autopay_agreement_idx').on(t.agreementId),
    index('autopay_next_run_idx').on(t.active, t.nextRunAt),
  ],
)

export type RoiModel = typeof roiModel.$inferSelect
export type RentalAgreement = typeof rentalAgreement.$inferSelect
