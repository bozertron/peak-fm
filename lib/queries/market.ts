import { cache } from 'react'
import { eq, asc, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { market, category, featureFlag } from '@/lib/db/schema'

/**
 * `cache()` dedupes within a single request render, so a layout and its page
 * asking for the active market hit Postgres once rather than twice.
 */

export const getActiveMarkets = cache(async () =>
  db.select().from(market).where(eq(market.active, true)).orderBy(asc(market.name)),
)

export const getAllMarkets = cache(async () =>
  db.select().from(market).orderBy(asc(market.name)),
)

export const getMarketBySlug = cache(async (slug: string) => {
  const [row] = await db.select().from(market).where(eq(market.slug, slug)).limit(1)
  return row ?? null
})

/**
 * The market a request is operating in.
 *
 * Resolution order is: the caller's explicit choice, then the first active
 * market. Returns null when no market is active at all, which is a real state
 * — a fresh database before `pnpm db:seed` — and callers must handle it rather
 * than assume Big White exists.
 */
export const getCurrentMarket = cache(async (slug?: string) => {
  if (slug) {
    const chosen = await getMarketBySlug(slug)
    if (chosen) return chosen
  }
  const [first] = await db
    .select()
    .from(market)
    .where(eq(market.active, true))
    .orderBy(asc(market.name))
    .limit(1)
  return first ?? null
})

export const getCategories = cache(async (appliesTo?: string) => {
  const rows = await db.select().from(category).orderBy(asc(category.position))
  if (!appliesTo) return rows
  return rows.filter((c) => c.appliesTo.includes(appliesTo))
})

export const getFeatureFlags = cache(async () => {
  const rows = await db.select().from(featureFlag).orderBy(asc(featureFlag.key))
  return new Map(rows.map((r) => [r.key, r]))
})

/**
 * Whether a surface is switched on. Unknown keys are OFF: a flag that was
 * never seeded must not read as enabled, or a half-built surface opens itself.
 */
export async function isEnabled(key: string): Promise<boolean> {
  const flags = await getFeatureFlags()
  return flags.get(key)?.enabled ?? false
}

/** Row counts used by the landing pitch and the admin dashboard. */
export const countRows = cache(async (table: string): Promise<number> => {
  const { rows } = await db.execute(
    sql`SELECT count(*)::int AS count FROM ${sql.identifier(table)}`,
  )
  return (rows[0] as { count: number } | undefined)?.count ?? 0
})
