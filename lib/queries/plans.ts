import { and, desc, eq, or, gte, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { plan, planProposal, communityItem, user } from '@/lib/db/schema'
import type { PlanScope } from '@/lib/db/schema'

/** A user's own plans in one scope. */
export async function listMyPlans(ownerId: string, scope: PlanScope, limit = 50) {
  return db
    .select()
    .from(plan)
    .where(and(eq(plan.ownerId, ownerId), eq(plan.scope, scope)))
    .orderBy(desc(plan.updatedAt))
    .limit(limit)
}

/** Proposals sent to a user, e.g. a plumber's quote answering their Find. */
export async function listProposalsForRecipient(recipientId: string, limit = 50) {
  return db
    .select({
      id: planProposal.id,
      planTitle: plan.title,
      providerName: user.name,
      priceCents: planProposal.priceCents,
      currency: planProposal.currency,
      guaranteeText: planProposal.guaranteeText,
      status: planProposal.status,
      validUntil: planProposal.validUntil,
      createdAt: planProposal.createdAt,
    })
    .from(planProposal)
    .innerJoin(plan, eq(plan.id, planProposal.planId))
    .innerJoin(user, eq(user.id, planProposal.providerId))
    .where(eq(planProposal.recipientId, recipientId))
    .orderBy(desc(planProposal.createdAt))
    .limit(limit)
}

/** Proposals a provider has sent out. */
export async function listProposalsByProvider(providerId: string, limit = 50) {
  return db
    .select({
      id: planProposal.id,
      planTitle: plan.title,
      priceCents: planProposal.priceCents,
      currency: planProposal.currency,
      status: planProposal.status,
      createdAt: planProposal.createdAt,
    })
    .from(planProposal)
    .innerJoin(plan, eq(plan.id, planProposal.planId))
    .where(eq(planProposal.providerId, providerId))
    .orderBy(desc(planProposal.createdAt))
    .limit(limit)
}

/**
 * The community board for a market: upcoming events, announcements, and
 * consultations still open for feedback. Past events are excluded; an
 * announcement with no date always shows.
 */
export async function listCommunityItems(marketId: string, limit = 50) {
  const now = new Date()
  return db
    .select()
    .from(communityItem)
    .where(
      and(
        eq(communityItem.marketId, marketId),
        eq(communityItem.status, 'published'),
        or(isNull(communityItem.endsAt), gte(communityItem.endsAt, now)),
      ),
    )
    .orderBy(desc(communityItem.startsAt))
    .limit(limit)
}
