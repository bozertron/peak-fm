/**
 * Shared column builders and status vocabularies.
 *
 * Money is always integer cents in `currency` minor units — never a float.
 * Status columns are `text` with a CHECK constraint applied in the generated
 * migration, plus a TypeScript union via `$type<>()`. We deliberately avoid
 * `pgEnum`: every new status value would otherwise need an ALTER TYPE
 * migration, and these vocabularies are still moving.
 */
import { text, timestamp } from 'drizzle-orm/pg-core'

/** Primary key shared by every domain table. */
export const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

export const createdAt = () => timestamp('createdAt').notNull().defaultNow()
export const updatedAt = () => timestamp('updatedAt').notNull().defaultNow()

/** ISO 4217. Single-market for now, but never assume it. */
export const currency = () => text('currency').notNull().default('CAD')

// --- Status vocabularies -------------------------------------------------

export const LISTING_KINDS = ['sale', 'rental', 'trade'] as const
export type ListingKind = (typeof LISTING_KINDS)[number]

export const OFFERING_TYPES = ['goods', 'service'] as const
export type OfferingType = (typeof OFFERING_TYPES)[number]

export const LISTING_STATUSES = [
  'draft',
  'active',
  'paused',
  'completed',
  'withdrawn',
] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]

export const ORDER_STATUSES = [
  'pending',
  'authorized',
  'paid',
  'fulfilled',
  'cancelled',
  'refunded',
  'disputed',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/**
 * Find requests are permanent opportunities. They resolve to `satisfied` or
 * `withdrawn` and are never converted into a listing — see PEAK-205.
 */
export const FIND_STATUSES = ['open', 'matched', 'satisfied', 'withdrawn'] as const
export type FindStatus = (typeof FIND_STATUSES)[number]

export const PLAN_SCOPES = ['personal', 'business', 'community'] as const
export type PlanScope = (typeof PLAN_SCOPES)[number]

export const USER_ROLES = ['member', 'moderator', 'admin'] as const
export type UserRole = (typeof USER_ROLES)[number]
