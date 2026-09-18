'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { user, market, USER_ROLES } from '@/lib/db/schema'

/**
 * Server Functions are reachable by direct POST, not only through the UI, so
 * every one of them re-checks the session itself. Never trust the caller.
 */

const ALLOWED_AVATAR_KINDS = new Set(['initials', 'ridge'])

export type AccountActionResult = { ok: true } | { ok: false; error: string }

export async function updateProfile(formData: FormData): Promise<AccountActionResult> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { ok: false, error: 'You are not signed in.' }

  const name = String(formData.get('name') ?? '').trim()
  if (name.length < 2) return { ok: false, error: 'Name must be at least 2 characters.' }
  if (name.length > 80) return { ok: false, error: 'Name must be 80 characters or fewer.' }

  const avatarKind = String(formData.get('avatarKind') ?? 'initials')
  if (!ALLOWED_AVATAR_KINDS.has(avatarKind)) {
    return { ok: false, error: 'That profile graphic is not one of the available options.' }
  }

  const avatarSeedRaw = String(formData.get('avatarSeed') ?? '').trim()
  const avatarSeed = avatarSeedRaw.slice(0, 64) || null

  const marketIdRaw = String(formData.get('marketId') ?? '').trim()
  let marketId: string | null = null
  if (marketIdRaw) {
    // Verify the market exists rather than storing whatever was posted.
    const [row] = await db.select({ id: market.id }).from(market).where(eq(market.id, marketIdRaw)).limit(1)
    if (!row) return { ok: false, error: 'That market does not exist.' }
    marketId = row.id
  }

  // `role` is deliberately absent. It is not settable from this form, and a
  // posted `role` field is ignored rather than trusted.
  await db
    .update(user)
    .set({ name, avatarKind, avatarSeed, marketId, updatedAt: new Date() })
    .where(eq(user.id, session.user.id))

  revalidatePath('/account')
  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Role changes are an admin action and live here only so that the one place
 * roles can change is auditable. Requires an existing admin.
 */
export async function setUserRole(targetUserId: string, role: string): Promise<AccountActionResult> {
  const session = await auth.api.getSession({ headers: await headers() })
  const actor = session?.user as { id: string; role?: string } | undefined
  if (!actor) return { ok: false, error: 'You are not signed in.' }
  if (actor.role !== 'admin') return { ok: false, error: 'Only an admin can change roles.' }
  if (!USER_ROLES.includes(role as (typeof USER_ROLES)[number])) {
    return { ok: false, error: `Role must be one of: ${USER_ROLES.join(', ')}.` }
  }
  if (actor.id === targetUserId && role !== 'admin') {
    return { ok: false, error: 'You cannot remove your own admin role — you would lock yourself out.' }
  }

  await db
    .update(user)
    .set({ role: role as (typeof USER_ROLES)[number], updatedAt: new Date() })
    .where(eq(user.id, targetUserId))

  revalidatePath('/admin')
  return { ok: true }
}
