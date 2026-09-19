/**
 * THE INVITE LEDGER — the single module that decides whether a beta invite code
 * buys a sign-up, and records that it did.
 *
 * WHY THIS MODULE EXISTS
 * `beta.invite_only` is seeded ON and, until now, enforced NOWHERE: anyone who
 * reached the sign-up URL could register. Enforcement has to live at the server,
 * on the real auth endpoint — a hidden form field and a page-level check are not
 * enforcement, because the endpoint is publicly reachable and a direct POST never
 * renders the page. This file is the ledger that endpoint calls. Unit 240-2 wires
 * it into `lib/auth.ts`; unit 240-3 renders the field. Neither of them re-implements
 * validation, and neither of them decides what a refusal means.
 *
 * THE TWO-PHASE CLAIM, AND WHY IT IS TWO PHASES
 * At sign-up time the user row does not exist yet, so the redemption cannot be
 * completed in one statement: `beta_invite."redeemedById"` is a foreign key to
 * `"user"."id"` and there is no id to write. Hence:
 *   `claimInvite`  — consumes one use BEFORE the user exists (no userId), and
 *   `stampInviteRedemption` — completes the record once Better Auth has written
 *                    the user, and appends the audit row.
 * `redeemInvite` is the two of them in order, for callers that already hold a
 * user id (tests, scripts, any non-Better-Auth caller).
 *
 * RACE SAFETY IS IN THE STATEMENT, NOT IN THE TIMING
 * `claimInvite` classifies first, because a distinguishable refusal reason
 * ('revoked' vs 'expired' vs 'exhausted' vs 'email-mismatch') requires reading
 * the row — a bare conditional UPDATE can only say "no". That read is NOT the
 * guard: two processes can read the same redeemable row and both proceed. The
 * guard is the single conditional `UPDATE ... WHERE <every invariant>` below,
 * which Postgres evaluates against the row it is about to write while holding
 * that row's lock. The read's only job is to name the reason; the UPDATE's job is
 * to decide. A zero-row UPDATE is therefore never a success and never assumed
 * "already redeemed" — it re-reads and reports the reason that actually holds, and
 * throws if the row is redeemable *and* the UPDATE changed nothing, which cannot
 * happen and must never pass silently (see `classifyRefusal`).
 */
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { adminAuditLog, betaInvite } from '@/lib/db/schema'
import { isEnabled } from '@/lib/queries/market'

/**
 * Why an invite was refused. A closed vocabulary rather than a message: the
 * caller (and the sign-up form) must be able to distinguish "this code was never
 * issued" from "this code is spent" without parsing prose.
 */
export type InviteRefusal = 'missing' | 'revoked' | 'expired' | 'exhausted' | 'email-mismatch'

/**
 * The outcome of consuming one use of a code. `code` is the CANONICAL code as
 * stored (`beta_invite.code`), not the caller's input — an audit trail must
 * record the code that exists, not the spelling that was typed.
 */
export type ClaimResult =
  | { ok: true; inviteId: string; code: string }
  | { ok: false; reason: InviteRefusal }

type BetaInviteRow = typeof betaInvite.$inferSelect

/** The one flag key that gates public sign-up. Not a parameter: there is one door. */
const INVITE_ONLY_FLAG = 'beta.invite_only'

/**
 * The admin UI generates and accepts codes matching `/^[A-Z2-9]{8}$/` (see
 * `generateCode` in `app/admin/actions.ts`), so a human who retypes a code in
 * lower case, or pastes it with a trailing space from a text message, is typing
 * the SAME code. Normalising before the comparison keeps the storage format
 * canonical and the lookup tolerant.
 */
function normaliseInviteCode(code: string): string {
  return code.trim().toUpperCase()
}

/**
 * Surrounding whitespace on an email is a form artifact, not a different person,
 * so it is trimmed before comparing. Case is handled by the comparison itself
 * (lowercase on both sides, here and in the SQL predicate).
 */
function normaliseEmail(email: string): string {
  return email.trim()
}

/**
 * Whether the invite is currently redeemable by this email, and if not, why.
 *
 * PRECEDENCE IS THE TICKET'S, IN THE TICKET'S ORDER: exists, not revoked, not
 * expired, `redemptionCount < maxRedemptions`, then the email pin. When a code is
 * both revoked and spent, the operator's action (revocation) is the more useful
 * answer, and it is the one this returns.
 *
 * The `expiresAt` comparison mirrors the SQL predicate exactly — `expiresAt > now()`
 * passes, so `expiresAt <= now()` is expired — because a classifier that disagrees
 * with the statement that does the enforcing would return reasons that contradict
 * the outcome.
 */
function classifyRefusal(
  row: BetaInviteRow,
  email: string,
  now: Date = new Date(),
): InviteRefusal | null {
  if (row.revokedAt !== null) return 'revoked'
  if (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()) return 'expired'
  if (row.redemptionCount >= row.maxRedemptions) return 'exhausted'
  if (row.email !== null && row.email.toLowerCase() !== email.toLowerCase()) return 'email-mismatch'
  return null
}

/** The row for a code, or null. The code was normalised by the caller. */
async function readInviteByCode(code: string): Promise<BetaInviteRow | null> {
  const [row] = await db.select().from(betaInvite).where(eq(betaInvite.code, code)).limit(1)
  return row ?? null
}

/**
 * `rowCount` is `number | null` in the pg types; an UPDATE always reports a count.
 * Returning `?? 0` here would let a driver anomaly read as "somebody else took the
 * last use" — a confident, wrong refusal instead of a loud failure.
 */
function affectedRowCount(rowCount: number | null, inviteId: string): number {
  if (typeof rowCount !== 'number') {
    throw new Error(
      `claimInvite: the conditional UPDATE for beta_invite ${inviteId} reported ` +
        `rowCount = ${String(rowCount)}; an UPDATE always reports the number of rows it ` +
        'changed. Refusing to treat a missing count as "changed nothing".',
    )
  }
  return rowCount
}

/**
 * Whether a public sign-up must carry an invite code.
 *
 * Delegates to the repo's single flag reader rather than querying
 * `feature_flag` itself, because that reader owns the convention that matters:
 * an UNKNOWN KEY IS OFF. A second implementation could drift into treating a
 * missing row as on, and every gate would open at once.
 */
export async function isInviteRequired(): Promise<boolean> {
  return isEnabled(INVITE_ONLY_FLAG)
}

/**
 * Atomically claim one use of a code. No userId: at sign-up time the user does
 * not exist.
 *
 * Phase 1 reads the row to name a refusal (a distinguishable reason cannot come
 * out of a predicate that only answers yes/no). Phase 2 is the claim itself: ONE
 * statement carrying every invariant in its own `WHERE`, so the decision and the
 * write happen under the same row lock and the same snapshot. The comparison is
 * done by Postgres, not by JavaScript, which is what makes a concurrent pair
 * unable to both win the final use.
 */
export async function claimInvite(input: { code: string; email: string }): Promise<ClaimResult> {
  const code = normaliseInviteCode(input.code)
  const email = normaliseEmail(input.email)

  const candidate = await readInviteByCode(code)
  if (candidate === null) return { ok: false, reason: 'missing' }

  const refusal = classifyRefusal(candidate, email)
  if (refusal !== null) return { ok: false, reason: refusal }

  const result = await db.execute<{ code: string }>(sql`
    UPDATE beta_invite
       SET "redemptionCount" = "redemptionCount" + 1
     WHERE id = ${candidate.id}
       AND "redemptionCount" < "maxRedemptions"
       AND "revokedAt" IS NULL
       AND ("expiresAt" IS NULL OR "expiresAt" > now())
       AND (email IS NULL OR lower(email) = lower(${email}))
    RETURNING *
  `)

  const affected = affectedRowCount(result.rowCount, candidate.id)
  if (affected === 0) {
    // The row was redeemable when read and not redeemable when written: someone
    // else committed the last use in between, or an operator revoked/expired the
    // code. Re-read, and report the state that actually holds NOW — this is what
    // separates "you lost the race for the final use" from "that code is not a
    // code", and what keeps a lost race from being reported as an invalid code.
    const current = await readInviteByCode(code)
    if (current === null) return { ok: false, reason: 'missing' }

    const currentRefusal = classifyRefusal(current, email)
    if (currentRefusal !== null) return { ok: false, reason: currentRefusal }

    throw new Error(
      `claimInvite: the conditional UPDATE changed 0 rows for beta_invite ` +
        `${candidate.id}, yet re-reading it shows a redeemable invite ` +
        `(redemptionCount ${current.redemptionCount} < maxRedemptions ` +
        `${current.maxRedemptions}, not revoked, not expired, email matches). ` +
        'Those two facts cannot both be true, so the claim is neither accepted ' +
        'nor reported as a refusal, and no use of the code was consumed. Nothing ' +
        'above this line may be treated as a successful claim.',
    )
  }

  // The predicate addresses one primary key, so exactly one row is the only
  // possible outcome of a successful UPDATE. Anything else means the statement
  // did not do what it says it does, and a claim that cannot be accounted for
  // must not be handed to the auth endpoint as a success.
  if (affected !== 1) {
    throw new Error(
      `claimInvite: the conditional UPDATE for beta_invite ${candidate.id} reported ` +
        `${affected} changed rows; the statement addresses one primary key, so it must ` +
        'change exactly one row.',
    )
  }

  const claimed = result.rows[0]
  if (claimed === undefined) {
    throw new Error(
      `claimInvite: the conditional UPDATE reported ${affected} changed row for ` +
        `beta_invite ${candidate.id}, but RETURNING handed back no row, so the code that ` +
        'was actually claimed cannot be reported. Refusing to return a claim the database ' +
        'did not hand back.',
    )
  }

  return { ok: true, inviteId: candidate.id, code: claimed.code }
}

/**
 * Complete the redemption once the user exists: fill `redeemedById` /
 * `redeemedAt` and append ONE `admin_audit_log` row.
 *
 * Transactional because "the invite says who redeemed it" and "the log says who
 * redeemed it" are one fact with two homes: a stamp that commits without its
 * audit row is a redemption nobody can account for. The row is locked `FOR
 * UPDATE` so the `before` snapshot in the audit entry is the state this stamp
 * actually replaced, not a value another writer moved underneath it.
 *
 * APPEND-ONLY: this function only ever INSERTs into `admin_audit_log`. Nothing in
 * this module updates or deletes an audit row — a log that can be rewritten is
 * not a log. The `before`/`after` pair carries the redemption count, so the
 * entry records which use of the code this was.
 *
 * Throws if the invite does not exist: a stamp against a missing row is a bug in
 * the caller, never a no-op.
 */
export async function stampInviteRedemption(input: {
  inviteId: string
  userId: string
  actorEmail: string
}): Promise<void> {
  const { inviteId, userId, actorEmail } = input

  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(betaInvite)
      .where(eq(betaInvite.id, inviteId))
      .limit(1)
      .for('update')

    if (before === undefined) {
      throw new Error(
        `stampInviteRedemption: no beta_invite row has id ${inviteId}, so the redemption ` +
          'cannot be completed. A stamp is written only against an invite that was claimed.',
      )
    }

    const redeemedAt = new Date()

    await tx
      .update(betaInvite)
      .set({ redeemedById: userId, redeemedAt })
      .where(eq(betaInvite.id, inviteId))

    await tx.insert(adminAuditLog).values({
      actorId: userId,
      actorEmail,
      action: 'invite.redeem',
      entityType: 'beta_invite',
      entityId: inviteId,
      before: {
        redemptionCount: before.redemptionCount,
        redeemedById: before.redeemedById,
        redeemedAt: before.redeemedAt,
      },
      after: {
        redemptionCount: before.redemptionCount,
        redeemedById: userId,
        redeemedAt,
      },
    })
  })
}

/**
 * Claim then stamp: the whole redemption for a caller that already has a user id.
 *
 * A refusal from `claimInvite` is returned untouched and nothing is stamped. A
 * failure in `stampInviteRedemption` is NOT caught here — the use has been
 * consumed and the record is incomplete, and swallowing that would leave a
 * redemption the ledger cannot explain.
 */
export async function redeemInvite(input: {
  code: string
  userId: string
  email: string
}): Promise<ClaimResult> {
  const claimed = await claimInvite({ code: input.code, email: input.email })
  if (!claimed.ok) return claimed

  await stampInviteRedemption({
    inviteId: claimed.inviteId,
    userId: input.userId,
    actorEmail: input.email,
  })

  return claimed
}
