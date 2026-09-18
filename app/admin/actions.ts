'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { eq, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  featureFlag,
  betaInvite,
  moderationReport,
  adminAuditLog,
  market,
  user,
  USER_ROLES,
} from '@/lib/db/schema'

export type AdminResult = { ok: true; message?: string } | { ok: false; error: string }

/**
 * Every admin Server Function starts here.
 *
 * Server Functions are reachable by direct POST, not only through the UI, so
 * the role check cannot live in the page that renders the button. It lives in
 * the function that does the work.
 */
async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })
  const actor = session?.user as { id: string; email: string; role?: string } | undefined
  if (!actor) throw new Error('Not signed in.')
  if (actor.role !== 'admin') throw new Error('Admin role required.')
  return actor
}

/** Append-only. Every privileged mutation below writes one of these. */
async function audit(
  actor: { id: string; email: string },
  action: string,
  entityType: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
) {
  await db.insert(adminAuditLog).values({
    actorId: actor.id,
    actorEmail: actor.email,
    action,
    entityType,
    entityId,
    before: before as never,
    after: after as never,
  })
}

export async function toggleFlag(key: string, enabled: boolean): Promise<AdminResult> {
  try {
    const actor = await requireAdmin()
    const [before] = await db.select().from(featureFlag).where(eq(featureFlag.key, key)).limit(1)
    if (!before) return { ok: false, error: `No such flag: ${key}` }

    await db
      .update(featureFlag)
      .set({ enabled, updatedById: actor.id, updatedAt: new Date() })
      .where(eq(featureFlag.key, key))

    await audit(actor, enabled ? 'flag.enable' : 'flag.disable', 'feature_flag', key,
      { enabled: before.enabled }, { enabled })

    revalidatePath('/admin')
    revalidatePath('/', 'layout')
    return { ok: true, message: `${key} is now ${enabled ? 'on' : 'off'}.` }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error.' }
  }
}

export async function setMarketActive(marketId: string, active: boolean): Promise<AdminResult> {
  try {
    const actor = await requireAdmin()
    const [before] = await db.select().from(market).where(eq(market.id, marketId)).limit(1)
    if (!before) return { ok: false, error: 'No such market.' }

    await db.update(market).set({ active, updatedAt: new Date() }).where(eq(market.id, marketId))
    await audit(actor, active ? 'market.open' : 'market.close', 'market', marketId,
      { active: before.active }, { active })

    revalidatePath('/admin')
    revalidatePath('/', 'layout')
    return { ok: true, message: `${before.name} is now ${active ? 'open' : 'closed'}.` }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error.' }
  }
}

/** Beta invite codes are short, unambiguous, and uppercase. */
function generateCode(): string {
  // No I, O, 0 or 1 — these get read aloud and typed by hand.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export async function createInvite(formData: FormData): Promise<AdminResult> {
  try {
    const actor = await requireAdmin()
    const email = String(formData.get('email') ?? '').trim() || null
    const note = String(formData.get('note') ?? '').trim() || null
    const maxRedemptions = Math.max(1, Math.min(100, Number(formData.get('maxRedemptions') ?? 1)))

    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { ok: false, error: 'That does not look like an email address.' }
    }

    const code = generateCode()
    await db.insert(betaInvite).values({
      code,
      email,
      note,
      maxRedemptions,
      issuedById: actor.id,
    })

    await audit(actor, 'invite.create', 'beta_invite', code, null, { email, maxRedemptions })
    revalidatePath('/admin')
    return { ok: true, message: `Invite code ${code} created.` }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error.' }
  }
}

export async function revokeInvite(inviteId: string): Promise<AdminResult> {
  try {
    const actor = await requireAdmin()
    const [before] = await db.select().from(betaInvite).where(eq(betaInvite.id, inviteId)).limit(1)
    if (!before) return { ok: false, error: 'No such invite.' }
    if (before.redeemedAt) return { ok: false, error: 'That invite has already been redeemed.' }

    await db.update(betaInvite).set({ revokedAt: new Date() }).where(eq(betaInvite.id, inviteId))
    await audit(actor, 'invite.revoke', 'beta_invite', before.code, { revokedAt: null }, { revokedAt: new Date() })
    revalidatePath('/admin')
    return { ok: true, message: `Invite ${before.code} revoked.` }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error.' }
  }
}

export async function changeRole(targetUserId: string, role: string): Promise<AdminResult> {
  try {
    const actor = await requireAdmin()
    if (!USER_ROLES.includes(role as (typeof USER_ROLES)[number])) {
      return { ok: false, error: `Role must be one of: ${USER_ROLES.join(', ')}.` }
    }
    const [before] = await db.select().from(user).where(eq(user.id, targetUserId)).limit(1)
    if (!before) return { ok: false, error: 'No such member.' }

    if (actor.id === targetUserId && role !== 'admin') {
      return { ok: false, error: 'You cannot remove your own admin role — you would lock yourself out.' }
    }

    // Never let the last admin be demoted; that locks everyone out of /admin.
    if (before.role === 'admin' && role !== 'admin') {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(user)
        .where(eq(user.role, 'admin'))
      if (n <= 1) return { ok: false, error: 'This is the only admin. Promote someone else first.' }
    }

    await db
      .update(user)
      .set({ role: role as (typeof USER_ROLES)[number], updatedAt: new Date() })
      .where(eq(user.id, targetUserId))

    await audit(actor, 'user.role', 'user', targetUserId, { role: before.role }, { role })
    revalidatePath('/admin')
    return { ok: true, message: `${before.name} is now ${role}.` }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error.' }
  }
}

export async function resolveReport(
  reportId: string,
  status: 'actioned' | 'dismissed',
  note: string,
): Promise<AdminResult> {
  try {
    const actor = await requireAdmin()
    const [before] = await db
      .select()
      .from(moderationReport)
      .where(eq(moderationReport.id, reportId))
      .limit(1)
    if (!before) return { ok: false, error: 'No such report.' }

    await db
      .update(moderationReport)
      .set({
        status,
        resolvedById: actor.id,
        resolutionNote: note || null,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(moderationReport.id, reportId))

    await audit(actor, `report.${status}`, 'moderation_report', reportId,
      { status: before.status }, { status, note })
    revalidatePath('/admin')
    return { ok: true, message: `Report ${status}.` }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error.' }
  }
}
