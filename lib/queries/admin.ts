import { desc, eq, sql, inArray, type SQL } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db'
import {
  user,
  listing,
  order,
  findRequest,
  plan,
  thread,
  message,
  moderationReport,
  betaInvite,
  betaFeedback,
  adminAuditLog,
  featureFlag,
  market,
} from '@/lib/db/schema'

/**
 * Every number on the admin dashboard is a live count. Nothing is cached and
 * nothing is estimated — an operator watching a beta needs to trust that what
 * the screen says is what the database holds right now.
 */
export async function getDashboardStats() {
  const [
    members,
    admins,
    listings,
    activeListings,
    orders,
    paidOrders,
    grossCents,
    finds,
    openFinds,
    plans,
    threads,
    messages,
    openReports,
    invitesIssued,
    invitesRedeemed,
    feedbackNew,
  ] = await Promise.all([
    count(user),
    count(user, eq(user.role, 'admin')),
    count(listing),
    count(listing, eq(listing.status, 'active')),
    count(order),
    count(order, inArray(order.status, ['paid', 'fulfilled'])),
    sumOrderGross(),
    count(findRequest),
    count(findRequest, eq(findRequest.status, 'open')),
    count(plan),
    count(thread),
    count(message),
    count(moderationReport, eq(moderationReport.status, 'open')),
    count(betaInvite),
    count(betaInvite, sql`${betaInvite.redeemedAt} IS NOT NULL`),
    count(betaFeedback, eq(betaFeedback.status, 'new')),
  ])

  return {
    members,
    admins,
    listings,
    activeListings,
    orders,
    paidOrders,
    grossCents,
    finds,
    openFinds,
    plans,
    threads,
    messages,
    openReports,
    invitesIssued,
    invitesRedeemed,
    feedbackNew,
  }
}

/** `SELECT count(*)` over a table, with an optional predicate. */
async function count(table: PgTable, where?: SQL): Promise<number> {
  const query = db.select({ n: sql<number>`count(*)::int` }).from(table)
  const [row] = where ? await query.where(where) : await query
  return row?.n ?? 0
}

async function sumOrderGross() {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${order.totalCents}), 0)::int` })
    .from(order)
    .where(inArray(order.status, ['paid', 'fulfilled']))
  return row?.total ?? 0
}

/** Listings broken down by kind and status — where supply actually is. */
export async function getListingBreakdown() {
  return db
    .select({ kind: listing.kind, status: listing.status, n: sql<number>`count(*)::int` })
    .from(listing)
    .groupBy(listing.kind, listing.status)
    .orderBy(listing.kind)
}

export async function getMembers(limit = 50) {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarKind: user.avatarKind,
      avatarSeed: user.avatarSeed,
      createdAt: user.createdAt,
      marketName: market.name,
    })
    .from(user)
    .leftJoin(market, eq(market.id, user.marketId))
    .orderBy(desc(user.createdAt))
    .limit(limit)
}

export async function getFlags() {
  return db.select().from(featureFlag).orderBy(featureFlag.key)
}

export async function getInvites(limit = 50) {
  return db.select().from(betaInvite).orderBy(desc(betaInvite.createdAt)).limit(limit)
}

export async function getOpenReports(limit = 25) {
  return db
    .select()
    .from(moderationReport)
    .where(eq(moderationReport.status, 'open'))
    .orderBy(desc(moderationReport.createdAt))
    .limit(limit)
}

export async function getRecentFeedback(limit = 25) {
  return db
    .select({
      id: betaFeedback.id,
      surface: betaFeedback.surface,
      kind: betaFeedback.kind,
      body: betaFeedback.body,
      status: betaFeedback.status,
      createdAt: betaFeedback.createdAt,
      userName: user.name,
    })
    .from(betaFeedback)
    .leftJoin(user, eq(user.id, betaFeedback.userId))
    .orderBy(desc(betaFeedback.createdAt))
    .limit(limit)
}

export async function getAuditLog(limit = 40) {
  return db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).limit(limit)
}

export async function getMarkets() {
  return db.select().from(market).orderBy(market.name)
}
