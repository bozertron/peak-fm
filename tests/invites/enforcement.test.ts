/**
 * PEAK-240, unit 240-2 — THE ENFORCEMENT POINT.
 *
 * WHAT IS UNDER TEST, AND WHY IT IS ATTACKED THROUGH THE REAL ENDPOINT
 * `beta.invite_only` was seeded ON and enforced NOWHERE, so anyone who reached the
 * sign-up URL could register. The fix lives in `lib/auth.ts`, on Better Auth's
 * user-creation hook pair. A test that called `lib/invites.ts` directly, or that
 * rendered the form and looked for a missing field, would prove neither half of the
 * claim this ticket makes — the ledger's own tests (unit 240-1) already cover the
 * ledger, and a hidden field is presentation. So every request below goes through
 * the object the application actually serves:
 *
 *   `auth.handler(request)` — the exported property that `/api/auth/[...all]`
 *   hands the incoming `Request` to (`better-auth/dist/auth/base.mjs:54-55`
 *   returns `{ handler, fetch: handler, ... }`, and the repository's route
 *   forwards to it). Installed version: better-auth 1.7.5.
 *
 * A `Request` is built by hand — JSON body, `content-type`, a trusted `origin`,
 * and the `x-peak-invite-code` header — which is exactly what a direct POST from
 * outside the app looks like. That is the attack the ticket describes, and it is
 * the only shape of test that can tell enforcement apart from decoration.
 *
 * THE ASSERTION THAT IS THE POINT
 * For every refusal: the response is a 403 AND `countRows('user')` is unchanged.
 * A refusal that still leaves a user row is not enforcement; it is a redirect with
 * extra steps. The row count is read from the scratch schema, so it is the
 * database's answer, not the handler's.
 *
 * REFERENCES READ FOR THIS FILE (installed packages, never guessed):
 *   - `@better-auth/core/dist/types/init-options.d.mts:1263` `databaseHooks`,
 *     `:1274` `user.create.before`, `:1280` `user.create.after`.
 *   - `better-auth/dist/db/with-hooks.mjs:8` — one `context` per creation, closed
 *     over by both hooks (`:17` before, `:39` after).
 *   - `better-auth/dist/api/routes/sign-up.mjs:233` — `if (isAPIError(e)) throw e`,
 *     which is why a refusal thrown from the hook reaches the client with its
 *     `code` and `reason` instead of being folded into `FAILED_TO_CREATE_USER`.
 *   - `better-auth/dist/api/dispatch.mjs:195,231` — the endpoint context carries a
 *     copy of the request's `Headers`, which is where the hook reads the code.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { adminAuditLog, betaInvite, featureFlag, user } from '@/lib/db/schema'
import { DEFAULT_TEST_PASSWORD } from '@/tests/helpers/auth'
import { closeTestPool, countRows, resetTestDatabase } from '@/tests/helpers/db'

type NewInvite = typeof betaInvite.$inferInsert
type InviteRow = typeof betaInvite.$inferSelect
type UserRow = typeof user.$inferSelect

/** The one flag key the gate reads. Mirrors `lib/invites.ts`'s `INVITE_ONLY_FLAG`. */
const INVITE_ONLY_FLAG = 'beta.invite_only'

/**
 * The wire name the SERVER reads — `INVITE_CODE_HEADER` in `lib/auth.ts`. It is
 * duplicated in this file on purpose, so the assertion in the "wire contract"
 * test below compares two independent copies rather than a constant with itself.
 */
const SERVER_INVITE_HEADER = 'x-peak-invite-code'

/** The alphabet `generateCode` in `app/admin/actions.ts` uses — no I, O, 0 or 1. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** The sign-up path the client posts to, relative to the configured origin. */
const SIGN_UP_PATH = '/api/auth/sign-up/email'

/**
 * The origin every request is sent from, read from configuration rather than
 * hardcoded: `lib/auth.ts` trusts `BETTER_AUTH_URL` in every environment, so a
 * deployment that reconfigures the origin does not have to edit this file. A
 * missing value is an error — inventing one would test a baseURL the app does not
 * have.
 */
function authOrigin(): string {
  const origin = process.env.BETTER_AUTH_URL
  if (!origin) {
    throw new Error(
      'BETTER_AUTH_URL is not set, so there is no origin the auth endpoint would call ' +
        'trusted. Run the suite through `pnpm test`, which loads .env.local. Refusing to ' +
        'invent a base URL the application is not configured with.',
    )
  }
  return origin
}

/** A code in the format the admin UI issues (`/^[A-Z2-9]{8}$/`), unique per call. */
function freshCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

/** A fresh address per call, so no two tests collide on `user.email`'s unique index. */
function freshEmail(): string {
  return `invite-${crypto.randomUUID()}@peak.test`
}

/**
 * Insert one invite through the real schema and return the row Postgres stored.
 * `overrides` is spread last, so each refusal state below is created by writing
 * the real column rather than by describing it in a comment.
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

/** Read an invite back — never from the object the insert returned. */
async function readInvite(inviteId: string): Promise<InviteRow> {
  const [row] = await db.select().from(betaInvite).where(eq(betaInvite.id, inviteId)).limit(1)
  if (row === undefined) {
    throw new Error(`readInvite: no beta_invite row with id ${inviteId}.`)
  }
  return row
}

/** The rows of `user` for an address, straight out of the scratch schema. */
async function readUsersByEmail(email: string): Promise<UserRow[]> {
  return db.select().from(user).where(eq(user.email, email))
}

/** The audit rows written for one invite, oldest first. */
async function readAuditRows(inviteId: string) {
  return db
    .select()
    .from(adminAuditLog)
    .where(eq(adminAuditLog.entityId, inviteId))
    .orderBy(adminAuditLog.createdAt)
}

/** Turn on the one flag that gates public sign-up, as the admin dashboard would. */
async function enableInviteOnly(): Promise<void> {
  await db.insert(featureFlag).values({
    key: INVITE_ONLY_FLAG,
    description: 'Public sign-up requires an invite code.',
    enabled: true,
  })
}

/** The response body, kept as text as well as parsed JSON so failures can print it. */
type ParsedBody = { text: string; json: Record<string, unknown> | null }

async function parseBody(response: Response): Promise<ParsedBody> {
  const text = await response.text()
  if (text.trim() === '') return { text, json: null }
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed !== null && typeof parsed === 'object') {
      return { text, json: parsed as Record<string, unknown> }
    }
    return { text, json: null }
  } catch {
    // Not JSON. The raw text is still evidence and is printed by the caller; there
    // is nothing to swallow here.
    return { text, json: null }
  }
}

/**
 * Build the request a direct POST makes, and send it through the REAL handler.
 *
 * `headers` lets a test put the code on an arbitrary header name — used to prove
 * the server reads exactly one name, and to drive the header the CLIENT file
 * declares. Nothing is mocked: the handler, the pool, the schema and the hooks are
 * the shipped code.
 */
async function postSignUp(input: {
  email: string
  password?: string
  name?: string
  inviteCode?: string
  inviteHeader?: string
  extraHeaders?: Record<string, string>
}): Promise<{ response: Response; body: ParsedBody }> {
  const headers = new Headers({
    'content-type': 'application/json',
    origin: authOrigin(),
  })
  if (input.inviteCode !== undefined) {
    headers.set(input.inviteHeader ?? SERVER_INVITE_HEADER, input.inviteCode)
  }
  for (const [key, value] of Object.entries(input.extraHeaders ?? {})) {
    headers.set(key, value)
  }

  const request = new Request(`${authOrigin()}${SIGN_UP_PATH}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: input.name ?? 'Invite Test User',
      email: input.email,
      password: input.password ?? DEFAULT_TEST_PASSWORD,
    }),
  })

  const response = await auth.handler(request)
  return { response, body: await parseBody(response) }
}

beforeEach(async () => {
  await resetTestDatabase()
})

afterAll(async () => {
  await closeTestPool()
})

describe('the gate is closed (flag ON)', () => {
  it('refuses a sign-up with NO invite header, and no user row is created (240.A1)', async () => {
    await enableInviteOnly()
    const email = freshEmail()

    const { response, body } = await postSignUp({ email })

    expect(response.status).toBe(403)
    expect(body.json?.code).toBe('INVITE_REFUSED')
    expect(body.json?.reason).toBe('missing')
    // The refusal is the server's, from the hook — not a framework 404 or a CSRF
    // rejection that happened to be red.
    expect(String(body.json?.message).length).toBeGreaterThan(0)

    // THE ASSERTION THAT DISTINGUISHES ENFORCEMENT FROM A GUARD IN THE PAGE: a
    // refused sign-up leaves no row behind, so the refusal happened BEFORE the
    // INSERT rather than after it.
    expect(await countRows('user')).toBe(0)
    expect(await readUsersByEmail(email)).toHaveLength(0)
    expect(await countRows('account')).toBe(0)
    expect(await countRows('session')).toBe(0)
  })

  it('refuses a code that was never issued, names the reason, and consumes nothing', async () => {
    await enableInviteOnly()
    // A real, redeemable invite exists — so `missing` is an answer about the code
    // that was sent, not an artifact of an empty table.
    const control = await insertInvite()
    const email = freshEmail()

    const { response, body } = await postSignUp({ email, inviteCode: freshCode() })

    expect(response.status).toBe(403)
    expect(body.json?.reason).toBe('missing')
    expect(await countRows('user')).toBe(0)

    const untouched = await readInvite(control.id)
    expect(untouched.redemptionCount).toBe(0)
    expect(untouched.redeemedById).toBeNull()
    expect(await countRows('admin_audit_log')).toBe(0)
  })

  it('refuses a blank header exactly as it refuses a missing one', async () => {
    await enableInviteOnly()

    const { response, body } = await postSignUp({ email: freshEmail(), inviteCode: '   ' })

    expect(response.status).toBe(403)
    expect(body.json?.reason).toBe('missing')
    expect(await countRows('user')).toBe(0)
  })

  /**
   * cl-2 — THE REFUSAL MUST STAY VISIBLE TO THE CLIENT.
   *
   * Every other refusal assertion in this file is about the DATABASE (no `user`
   * row, no consumed use, no audit entry) or about the handler's parsed result.
   * This one is about what a browser actually receives, because that is what the
   * caller acts on: `components/auth-form.tsx` branches on `result.error`.
   *
   * UPSTREAM BRANCH UNDER GUARD — `node_modules/better-auth/dist/api/routes/sign-up.mjs:234`:
   *
   *   if (e.statusCode === 403 && shouldReturnGenericDuplicateResponse) return buildGenericDuplicateResponse()
   *
   * where `shouldReturnGenericDuplicateResponse` (sign-up.mjs:162) is TRUE when
   * `emailAndPassword.requireEmailVerification` is set OR `autoSignIn === false`.
   * `lib/auth.ts` sets `autoSignIn: true` and no `requireEmailVerification`, so the
   * flag is false today and the 403 built by `inviteRefusal` is rethrown through
   * `sign-up.mjs:233` untouched. If either knob were flipped, a REFUSED sign-up
   * would instead come back as HTTP 200 carrying the synthetic shape from
   * `buildGenericDuplicateResponse` (`sign-up.mjs:166-197`):
   * `{ token: null, user: <a user object with a generated id that was never
   * inserted> }`. The assertions below exist so that configuration change breaks
   * THIS TEST rather than the refusal — including the `token` key, which is
   * present-but-`null` in the synthetic body, so `toBeUndefined` is what tells
   * "no synthetic token" apart from "a null synthetic token".
   */
  it('keeps an uninvited sign-up a client-visible 403 and never the synthetic-duplicate success (cl2.A1/A2)', async () => {
    await enableInviteOnly()
    const email = freshEmail()
    const usersBefore = await countRows('user')

    const { response, body } = await postSignUp({ email })

    // ── 1. The status a browser receives. Flipping `autoSignIn` to false turns
    // this into a 200 and fails here first.
    expect(response.status).toBe(403)

    // ── 2. The client-visible refusal itself: the exact message `lib/auth.ts`
    // produces for the `missing` reason, plus its stable code and reason.
    expect(body.json?.code, body.text).toBe('INVITE_REFUSED')
    expect(body.json?.reason, body.text).toBe('missing')
    expect(body.json?.message, body.text).toBe(
      'A beta invite code is required to create an account while Peak is in closed beta.',
    )

    // ── 3. The synthetic-duplicate SUCCESS shape must be absent. `token` and the
    // fabricated `user` object are exactly what sign-up.mjs:166-197 returns in
    // place of the refusal once the branch at :234 is live.
    const keys = Object.keys(body.json ?? {})
    expect(keys).not.toContain('token')
    expect(keys).not.toContain('user')
    expect(body.json?.token).toBeUndefined()
    expect(body.json?.user).toBeUndefined()
    expect(body.text).not.toContain('"token"')

    // ── 4. And nothing was created: the refusal is not a success with a hidden
    // row. The count is read from the scratch schema, which `beforeEach` reset.
    expect(usersBefore).toBe(0)
    expect(await countRows('user')).toBe(usersBefore)
    expect(await readUsersByEmail(email)).toHaveLength(0)
    expect(await countRows('session')).toBe(0)
  })

  it('refuses revoked, expired, exhausted and mis-addressed codes with their OWN reason', async () => {
    await enableInviteOnly()

    // One row per reason in `InviteRefusal`, created in the state the reason names.
    // Order matters only for readability: `classifyRefusal` decides precedence.
    const revoked = await insertInvite({ revokedAt: new Date('2026-01-01T00:00:00Z') })
    const expired = await insertInvite({ expiresAt: new Date(Date.now() - 60_000) })
    const exhausted = await insertInvite({ maxRedemptions: 1, redemptionCount: 1 })
    const pinned = await insertInvite({ email: 'invited-someone-else@peak.test' })

    const cases = [
      { invite: revoked, expected: 'revoked' },
      { invite: expired, expected: 'expired' },
      { invite: exhausted, expected: 'exhausted' },
      { invite: pinned, expected: 'email-mismatch' },
    ]

    for (const { invite, expected } of cases) {
      const { response, body } = await postSignUp({
        email: freshEmail(),
        inviteCode: invite.code,
      })

      expect(response.status).toBe(403)
      expect(body.json?.reason).toBe(expected)

      // The code is a credential: it must not come back to the caller in any form.
      expect(body.text).not.toContain(invite.code)

      const stored = await readInvite(invite.id)
      expect(stored.redemptionCount).toBe(invite.redemptionCount)
      expect(stored.redeemedById).toBeNull()
    }

    // Four refusals, four refusals' worth of nothing: no account, no use consumed,
    // no audit entry.
    expect(await countRows('user')).toBe(0)
    expect(await countRows('admin_audit_log')).toBe(0)
  })

  it('accepts a valid code: the row exists, the invite records the redemption, and the audit row is written (240.A5)', async () => {
    await enableInviteOnly()
    const invite = await insertInvite()
    const email = freshEmail()

    const { response, body } = await postSignUp({ email, inviteCode: invite.code })

    // ── 1. The sign-up itself succeeded.
    expect(response.status).toBe(200)
    const createdUser = (body.json as { user?: { id?: unknown } } | null)?.user
    const userId = createdUser?.id
    if (typeof userId !== 'string' || userId === '') {
      throw new Error(
        `the gated sign-up returned HTTP ${response.status} without a user id. Body: ` +
          `${body.text || '(empty)'}`,
      )
    }

    // The code never comes back.
    expect(body.text).not.toContain(invite.code)

    // ── 2. A real row exists, and it is the row the response named.
    expect(await countRows('user')).toBe(1)
    const rows = await readUsersByEmail(email)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(userId)

    // ── 3. `redeemedById` references that row: the two-phase claim was COMPLETED,
    // not merely claimed. This is the assertion kill-mutation (b) breaks.
    const stored = await readInvite(invite.id)
    expect(stored.redemptionCount).toBe(1)
    expect(stored.redeemedById).toBe(userId)
    expect(stored.redeemedAt).toBeInstanceOf(Date)

    // ── 4. Exactly one append-only audit row, attributable to the new account.
    expect(await countRows('admin_audit_log')).toBe(1)
    const auditRows = await readAuditRows(invite.id)
    expect(auditRows).toHaveLength(1)
    const entry = auditRows[0]
    if (entry === undefined) throw new Error('no audit row was read back')
    expect(entry.action).toBe('invite.redeem')
    expect(entry.entityType).toBe('beta_invite')
    expect(entry.entityId).toBe(invite.id)
    expect(entry.actorId).toBe(userId)
    expect(entry.actorEmail).toBe(email)

    // ── 5. The gated sign-up still produced a session (autoSignIn is on), so the
    // gate did not cost the caller their session.
    expect(response.headers.getSetCookie().length).toBeGreaterThan(0)
  })

  it('consumes exactly one use of a multi-use code per sign-up, and records each', async () => {
    await enableInviteOnly()
    const invite = await insertInvite({ maxRedemptions: 2 })

    const first = await postSignUp({ email: freshEmail(), inviteCode: invite.code })
    const second = await postSignUp({ email: freshEmail(), inviteCode: invite.code })
    const third = await postSignUp({ email: freshEmail(), inviteCode: invite.code })

    expect(first.response.status).toBe(200)
    expect(second.response.status).toBe(200)
    expect(third.response.status).toBe(403)
    expect(third.body.json?.reason).toBe('exhausted')

    expect(await countRows('user')).toBe(2)
    const stored = await readInvite(invite.id)
    expect(stored.redemptionCount).toBe(2)
    expect(stored.redeemedById).not.toBeNull()
    // Two redemptions, two audit rows — append-only, one per redemption.
    expect(await readAuditRows(invite.id)).toHaveLength(2)
  })
})

describe('the gate is open (no flag row — the default state of the scratch schema)', () => {
  it('signs up with no code at all (240.A6)', async () => {
    // No `enableInviteOnly()`, and `resetTestDatabase()` ran in `beforeEach`, so
    // `feature_flag` is empty and `isEnabled` — "an unknown key is OFF" — is false.
    expect(await countRows('feature_flag')).toBe(0)

    const email = freshEmail()
    const { response, body } = await postSignUp({ email })

    expect(response.status).toBe(200)
    const userId = (body.json as { user?: { id?: unknown } } | null)?.user?.id
    expect(typeof userId).toBe('string')
    expect(await countRows('user')).toBe(1)
    expect(await readUsersByEmail(email)).toHaveLength(1)
    // Nothing was redeemed and nothing was logged, because nothing was enforced.
    expect(await countRows('admin_audit_log')).toBe(0)
  })

  it('ignores a code that happens to ride along while the gate is open', async () => {
    // A caller may still hold a code in a form's state. With the flag off it must
    // not be consumed: the flag decides, not the presence of a header.
    const invite = await insertInvite()

    const { response } = await postSignUp({ email: freshEmail(), inviteCode: invite.code })

    expect(response.status).toBe(200)
    const stored = await readInvite(invite.id)
    expect(stored.redemptionCount).toBe(0)
    expect(stored.redeemedById).toBeNull()
    expect(await countRows('admin_audit_log')).toBe(0)
  })

  it('keeps existing accounts signing in after the gate is closed', async () => {
    // The gate lives on `user.create`. Whatever it does, sign-in is a different
    // path and must be untouched — this is the safety net in the other direction:
    // an account created while the beta was open still gets in when it closes.
    const email = freshEmail()
    const created = await postSignUp({ email })
    expect(created.response.status).toBe(200)

    await enableInviteOnly()

    const signIn = await auth.handler(
      new Request(`${authOrigin()}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: authOrigin() },
        body: JSON.stringify({ email, password: DEFAULT_TEST_PASSWORD }),
      }),
    )

    expect(signIn.status).toBe(200)
    expect(signIn.headers.getSetCookie().length).toBeGreaterThan(0)
    // The gate did not stamp anything on the way past.
    expect(await countRows('admin_audit_log')).toBe(0)
  })
})

describe('the wire contract with the client', () => {
  it('honours the exact header name components/auth-form.tsx sends', async () => {
    // The header name is declared twice — once in `lib/auth.ts` (the server) and
    // once in `components/auth-form.tsx` (the client) — because that component is a
    // `'use client'` file and importing the server module into it would pull the pg
    // pool into the browser bundle. Duplication that no test compares is drift
    // waiting to happen, so the client's own declaration is read here and used to
    // sign a real user up. If either side is renamed, this fails.
    const clientSource = await readFile(resolve(process.cwd(), 'components/auth-form.tsx'), 'utf8')
    const declared = /INVITE_CODE_HEADER\s*=\s*'([^']+)'/.exec(clientSource)?.[1]
    if (declared === undefined) {
      throw new Error(
        'components/auth-form.tsx no longer declares `INVITE_CODE_HEADER = \'...\'`, so the ' +
          'header the client sends cannot be compared with the one the server reads. The ' +
          'two halves of PEAK-240 are no longer provably the same wire.',
      )
    }
    expect(declared).toBe(SERVER_INVITE_HEADER)

    await enableInviteOnly()
    const invite = await insertInvite()

    const { response } = await postSignUp({
      email: freshEmail(),
      inviteCode: invite.code,
      inviteHeader: declared,
    })

    expect(response.status).toBe(200)
    expect((await readInvite(invite.id)).redemptionCount).toBe(1)
  })

  it('reads one header name and no other — a code on a different name is not a code', async () => {
    await enableInviteOnly()
    const invite = await insertInvite()

    const { response, body } = await postSignUp({
      email: freshEmail(),
      inviteCode: invite.code,
      inviteHeader: 'x-some-other-header',
    })

    expect(response.status).toBe(403)
    expect(body.json?.reason).toBe('missing')
    expect(await countRows('user')).toBe(0)
    expect((await readInvite(invite.id)).redemptionCount).toBe(0)
  })
})
