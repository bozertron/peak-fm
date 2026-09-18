/**
 * Markets and categories.
 *
 * A market is the local unit the whole product is organised around — Big White
 * first. Every listing, find request, plan and thread belongs to exactly one
 * market, because "local" is the pitch and it has to be enforced in data, not
 * just in copy.
 */
import { pgTable, text, boolean, integer, doublePrecision, index } from 'drizzle-orm/pg-core'
import { id, createdAt, updatedAt } from './_shared'

export const market = pgTable(
  'market',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    region: text('region').notNull(),
    country: text('country').notNull().default('CA'),

    /** Map centring and "near me" ranking. */
    centerLat: doublePrecision('centerLat').notNull(),
    centerLng: doublePrecision('centerLng').notNull(),
    radiusKm: integer('radiusKm').notNull().default(40),

    /** Markets are opened deliberately, one at a time. */
    active: boolean('active').notNull().default(false),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('market_active_idx').on(t.active)],
)

export const category = pgTable(
  'category',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    parentId: text('parentId'),

    /**
     * Which surfaces may use this category, e.g. ['sale','rental'].
     * Buy's row-based browse is built from the top level of this tree.
     */
    appliesTo: text('appliesTo').array().notNull(),

    /** Display order within a parent. */
    position: integer('position').notNull().default(0),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('category_parent_idx').on(t.parentId)],
)
