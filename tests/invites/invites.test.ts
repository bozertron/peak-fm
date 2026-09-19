/**
 * THE INVITE LEDGER'S OWN TESTS — PEAK-240, unit 240-1.
 *
 * WHAT IS UNDER TEST
 * `lib/invites.ts` is the module that decides whether a beta invite code buys a
 * sign-up, and records that it did. It will be called by the real auth endpoint
 * (unit 240-2) and by any non-Better-Auth caller, so its refusals are asserted
 * EXACTLY and BY NAME: every reason in `InviteRefusal` has a test below, and each
 * one checks the reason value the ticket names, not just "something was refused".
 * A refusal reason that is merely falsy is worthless to a UI and worse to an
 * operator reading a log.
 *
 * THE FIXTURES ARE REAL ROWS
 * Every invite is inserted through the real schema (`db.insert(betaInvite)`) into
 * the per-process scratch schema the harness migrates with the production
 * migration runner, so `NOT NULL`, the unique index on `code` and the foreign keys
 * from `redeemedById` / `actorId` are the database's constraints, not this file's
 * assumptions. `beforeEach(resetTestDatabase)` truncates first, so "no invite with
 * that code" means no rows rather than "none from this test".
 *
 * WHY THE FLAG TESTS LOOK TRIVIAL — AND WHY THEY ARE NOT
 * The scratch schema is truncated between tests, so `feature_flag` starts with NO
 * rows, and `lib/queries/market.ts` documents that an UNKNOWN KEY IS OFF. The
 * first assertion below (`isInviteRequired() === false` with an empty flag table)
 * is therefore the semantics the rest of this wave depends on AND the reason the
 * existing 19 tests keep passing while `beta.invite_only` is seeded ON in the
 * developer database. If a future change made a missing flag row read as enabled,
 * that assertion is what goes red. The second half inserts the real flag row and
 * asserts the gate closes.
 *
 * NO MOCKS. The database is real, `lib/invites.ts` is the shipped module, and the
 * audit row is read back through the schema. A mocked `db` would assert the mock.
 */
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { adminAuditLog, betaInvite, featureFlag } from '@/lib/db/schema'
import { claimInvite, isInviteRequired, redeemInvite, stampInviteRedemption } from '@/lib/invites'
import { closeTestPool, countRows, resetTestDatabase } from '@/tests/helpers/db'
import { createUser } from '@/tests/helpers/factories'

type NewInvite = typeof betaInvite.$inferInsert
type InviteRow = typeof betaInvite.$inferSelect
type AuditRow = typeof adminAuditLog.$inferSelect

/** The alphabet `generateCode` in `app/admin/actions.ts` uses — no I, O, 0 or 1. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * A code in the format the admin UI issues (`/^[A-Z2-9]{8}$/`), unique per call so
 * two tests in one file cannot collide on the unique index on `beta_invite.code`.
 */
function freshCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

/**
 * Insert one invite and return the row Postgres stored. Overrides are spread last,
 * so a test can pin any column — the states below are the states the ledger must
 * refuse, and each is created by writing the real column rather than by describing
 * it in a comment.
 */
async function insertInvite(overrides: Partial<NewInvite> = {}): Promise<InviteRow> {
  const values: NewInvite = { code: freshCode(), ...overrides }
  const [row] = await db.insert(betaInvite).values(values).returning()
  if (row === undefined) {
    throw new Error(
      'insertInvite: INSERT ... RETURNING produced no row, so the fixture the assertions ' +
        'depend on was never written.',
    )
  }
  return row
}

/** Read the invite back from the database — never from the object the insert returned. */
async function readInvite(inviteId: string): Promise<InviteRow> {
  const [row] = await db.select().from(betaInvite).where(eq(betaInvite.id, inviteId)).limit(1)
  if (row === undefined) {
    throw new Error(`readInvite: no beta_invite row with id ${inviteId}.`)
  }
  return row
}

/** The audit rows written for one invite, oldest first. */
async function readAuditRows(inviteId: string): Promise<AuditRow[]> {
  return db
    .select()
    .from(adminAuditLog)
    .where(eq(adminAuditLog.entityId, inviteId))
    .orderBy(adminAuditLog.createdAt)
}

/** Turn on the one flag that gates public sign-up. */
async function enableInviteOnlyFlag(): Promise<void> {
  await db.insert(featureFlag).values({
    key: 'beta.invite_only',
    description: 'Public sign-up requires an invite code.',
    enabled: true,
  })
}

describe('claimInvite — one exact refusal per reason', () => {
  beforeEach(async () => {
    await resetTestDatabase()
  })

  afterAll(async () => {
    await closeTestPool()
  })

  it('claims a valid invite and hands back its id and canonical code', async () => {
    const invite = await insertInvite()

    const result = await claimInvite({ code: invite.code, email: 'someone@peak.test' })

    expect(result).toEqual({ ok: true, inviteId: invite.id, code: invite.code })
    // The claim is a WRITE, not a decision: the counter moved by exactly one.
    expect((await readInvite(invite.id)).redemptionCount).toBe(1)
  })

  it("refuses a revoked code with reason 'revoked' and consumes no use", async () => {
    const invite = await insertInvite({ revokedAt: new Date('2026-01-01T00:00:00Z') })

    const result = await claimInvite({ code: invite.code, email: 'someone@peak.test' })

    expect(result).toEqual({ ok: false, reason: 'revoked' })
    expect((await readInvite(invite.id)).redemptionCount).toBe(0)
  })

  it("refuses an expired code with reason 'expired' and consumes no use", async () => {
    const invite = await insertInvite({
      expiresAt: new Date(Date.now() - 60_000),
    })

    const result = await claimInvite({ code: invite.code, email: 'someone@peak.test' })

    expect(result).toEqual({ ok: false, reason: 'expired' })
    expect((await readInvite(invite.id)).redemptionCount).toBe(0)
  })

  it("refuses an invite that has spent its uses with reason 'exhausted'", async () => {
    const invite = await insertInvite({ maxRedemptions: 1, redemptionCount: 1 })

    const result = await claimInvite({ code: invite.code, email: 'someone@peak.test' })

    expect(result).toEqual({ ok: false, reason: 'exhausted' })
    expect((await readInvite(invite.id)).redemptionCount).toBe(1)
  })

  it("refuses an email-pinned invite for another address with reason 'email-mismatch'", async () => {
    const invite = await insertInvite({ email: 'invited@peak.test' })

    const result = await claimInvite({ code: invite.code, email: 'someone-else@peak.test' })

    expect(result).toEqual({ ok: false, reason: 'email-mismatch' })
    expect((await readInvite(invite.id)).redemptionCount).toBe(0)
  })

  it("refuses a code that was never issued with reason 'missing'", async () => {
    await insertInvite()
    const neverIssued = freshCode()

    const result = await claimInvite({ code: neverIssued, email: 'someone@peak.test' })

    expect(result).toEqual({ ok: false, reason: 'missing' })
    // The control: the refusal is about the code asked for, not about an empty table.
    expect(await countRows('beta_invite')).toBe(1)
  })

  it('accepts an email-pinned invite for the matching address, regardless of case', async () => {
    const invite = await insertInvite({ email: 'Invited@Peak.Test' })

    const result = await claimInvite({ code: invite.code, email: 'invited@peak.test' })

    expect(result).toEqual({ ok: true, inviteId: invite.id, code: invite.code })
    expect((await readInvite(invite.id)).redemptionCount).toBe(1)
  })

  it('accepts a code typed in lower case with surrounding whitespace', async () => {
    const invite = await insertInvite({ code: 'ABCD2345' })

    const result = await claimInvite({ code: '  abcd2345\n', email: 'someone@peak.test' })

    // The canonical stored code comes back, not the spelling the caller used.
    expect(result).toEqual({ ok: true, inviteId: invite.id, code: 'ABCD2345' })
    expect((await readInvite(invite.id)).redemptionCount).toBe(1)
  })

  it('grants one use of a multi-use invite per claim, then refuses the next', async () => {
    const invite = await insertInvite({ maxRedemptions: 2, redemptionCount: 0 })

    const first = await claimInvite({ code: invite.code, email: 'first@peak.test' })
    const second = await claimInvite({ code: invite.code, email: 'second@peak.test' })
    const third = await claimInvite({ code: invite.code, email: 'third@peak.test' })

    expect(first).toEqual({ ok: true, inviteId: invite.id, code: invite.code })
    expect(second).toEqual({ ok: true, inviteId: invite.id, code: invite.code })
    expect(third).toEqual({ ok: false, reason: 'exhausted' })
    expect((await readInvite(invite.id)).redemptionCount).toBe(2)
  })

  it('refuses the second claim on a single-use invite without touching the counter', async () => {
    // The mutation guard for the conditional UPDATE: drop
    // `AND "redemptionCount" < "maxRedemptions"` from the statement in
    // lib/invites.ts and this invite would be handed out twice. See the unit
    // report for what that mutation does and does not make observable here.
    const invite = await insertInvite({ maxRedemptions: 1, redemptionCount: 0 })

    const first = await claimInvite({ code: invite.code, email: 'someone@peak.test' })
    expect(first).toEqual({ ok: true, inviteId: invite.id, code: invite.code })
    expect((await readInvite(invite.id)).redemptionCount).toBe(1)

    const second = await claimInvite({ code: invite.code, email: 'someone@peak.test' })
    expect(second).toEqual({ ok: false, reason: 'exhausted' })

    const stored = await readInvite(invite.id)
    expect(stored.redemptionCount).toBe(1)
    expect(stored.redemptionCount).toBeLessThanOrEqual(stored.maxRedemptions)
  })
})

describe('stampInviteRedemption — completing the record', () => {
  beforeEach(async () => {
    await resetTestDatabase()
  })

  afterAll(async () => {
    await closeTestPool()
  })

  it('writes redeemedById, redeemedAt and exactly one audit row for the redemption', async () => {
    const member = await createUser()
    const invite = await insertInvite()
    const claimed = await claimInvite({ code: invite.code, email: member.email })
    if (!claimed.ok) {
      throw new Error(
        `the fixture invite should be claimable, but claimInvite refused it with ` +
          `'${claimed.reason}'. Nothing below can be asserted about a claim that never happened.`,
      )
    }

    await stampInviteRedemption({
      inviteId: claimed.inviteId,
      userId: member.id,
      actorEmail: member.email,
    })

    // (1) the counter the claim moved, (2) who redeemed, (3) when.
    const stored = await readInvite(invite.id)
    expect(stored.redemptionCount).toBe(1)
    expect(stored.redeemedById).toBe(member.id)
    expect(stored.redeemedAt).toBeInstanceOf(Date)

    // (4) exactly one audit row, with the fields the operator reads.
    expect(await countRows('admin_audit_log')).toBe(1)
    const auditRows = await readAuditRows(invite.id)
    expect(auditRows).toHaveLength(1)
    const entry = auditRows[0]
    if (entry === undefined) throw new Error('no audit row was read back')

    expect(entry.action).toBe('invite.redeem')
    expect(entry.entityType).toBe('beta_invite')
    expect(entry.entityId).toBe(invite.id)
    expect(entry.actorId).toBe(member.id)
    expect(entry.actorEmail).toBe(member.email)

    const after = entry.after as { redemptionCount: number; redeemedById: string } | null
    expect(after?.redemptionCount).toBe(1)
    expect(after?.redeemedById).toBe(member.id)
    const before = entry.before as { redeemedById: string | null } | null
    // Append-only means this entry replaced the un-redeemed state; it is the record
    // of the transition, so the `before` side must show an unattributed invite.
    expect(before?.redeemedById).toBeNull()
  })

  it('appends a second audit row rather than replacing the first', async () => {
    const member = await createUser()
    const invite = await insertInvite({ maxRedemptions: 2 })
    const firstClaim = await claimInvite({ code: invite.code, email: member.email })
    if (!firstClaim.ok) throw new Error(`claim refused: ${firstClaim.reason}`)
    await stampInviteRedemption({
      inviteId: invite.id,
      userId: member.id,
      actorEmail: member.email,
    })

    const other = await createUser()
    const secondClaim = await claimInvite({ code: invite.code, email: other.email })
    if (!secondClaim.ok) throw new Error(`claim refused: ${secondClaim.reason}`)
    await stampInviteRedemption({
      inviteId: invite.id,
      userId: other.id,
      actorEmail: other.email,
    })

    const auditRows = await readAuditRows(invite.id)
    // TWO rows, one per redemption — the first was not overwritten. Compared as a
    // set of actors rather than in `createdAt` order, because two rows written
    // microseconds apart by defaultNow() are not ordered by a timestamp comparison
    // the test can rely on.
    expect(auditRows).toHaveLength(2)
    expect(auditRows.map((row) => row.actorId).sort()).toEqual([member.id, other.id].sort())
    expect((await readInvite(invite.id)).redeemedById).toBe(other.id)
  })

  it('throws rather than silently no-op when the invite does not exist', async () => {
    const member = await createUser()

    await expect(
      stampInviteRedemption({
        inviteId: crypto.randomUUID(),
        userId: member.id,
        actorEmail: member.email,
      }),
    ).rejects.toThrow(/no beta_invite row has id/)

    // Nothing was logged for a redemption that did not happen.
    expect(await countRows('admin_audit_log')).toBe(0)
  })
})

describe('redeemInvite — claim then stamp, for a caller that already has a user', () => {
  beforeEach(async () => {
    await resetTestDatabase()
  })

  afterAll(async () => {
    await closeTestPool()
  })

  it('claims, stamps and audits in one call', async () => {
    const member = await createUser()
    const invite = await insertInvite()

    const result = await redeemInvite({
      code: invite.code,
      userId: member.id,
      email: member.email,
    })

    expect(result).toEqual({ ok: true, inviteId: invite.id, code: invite.code })
    const stored = await readInvite(invite.id)
    expect(stored.redemptionCount).toBe(1)
    expect(stored.redeemedById).toBe(member.id)
    expect(stored.redeemedAt).toBeInstanceOf(Date)
    expect(await countRows('admin_audit_log')).toBe(1)
  })

  it('returns the refusal untouched and writes nothing when the code is spent', async () => {
    const member = await createUser()
    const invite = await insertInvite({ maxRedemptions: 1, redemptionCount: 1 })

    const result = await redeemInvite({
      code: invite.code,
      userId: member.id,
      email: member.email,
    })

    expect(result).toEqual({ ok: false, reason: 'exhausted' })
    const stored = await readInvite(invite.id)
    expect(stored.redemptionCount).toBe(1)
    expect(stored.redeemedById).toBeNull()
    expect(stored.redeemedAt).toBeNull()
    expect(await countRows('admin_audit_log')).toBe(0)
  })
})

describe('isInviteRequired — the flag, read through the repo convention', () => {
  beforeEach(async () => {
    await resetTestDatabase()
  })

  afterAll(async () => {
    await closeTestPool()
  })

  it('is false on a schema with no flag row, then true once the flag row exists', async () => {
    // The empty state is the state every other test in this repo runs in, and it is
    // what keeps the existing suite green: an unknown flag key is OFF.
    expect(await countRows('feature_flag')).toBe(0)
    expect(await isInviteRequired()).toBe(false)

    await enableInviteOnlyFlag()

    expect(await countRows('feature_flag')).toBe(1)
    expect(await isInviteRequired()).toBe(true)
  })

  it('is false when the flag row exists but is disabled', async () => {
    await db.insert(featureFlag).values({
      key: 'beta.invite_only',
      description: 'Public sign-up requires an invite code.',
      enabled: false,
    })

    expect(await isInviteRequired()).toBe(false)
  })
})
