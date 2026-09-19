/**
 * THE FINAL USE, UNDER CONCURRENCY — PEAK-240, unit 240-4.
 *
 * WHAT THIS FILE PROVES
 * `redeemInvite` in `lib/invites.ts` is called at the moment a stranger turns an
 * invite code into an account. The failure this file exists to catch is not a
 * crash: it is two redemptions BOTH succeeding against an invite that has one use
 * left. That failure is quiet — nothing throws, no error is logged, the counter
 * just reads 2 against a maximum of 1, and the operator finds out by counting
 * heads. The ticket's own verification evidence names this test for exactly that
 * reason, so the assertions below are about the STORED ROW and the AUDIT TRAIL,
 * never about a return value alone: two winners can both return `{ ok: true }`,
 * but they cannot both leave one `admin_audit_log` row, and they cannot both
 * leave `redemptionCount` equal to `maxRedemptions` when the maximum is 1.
 *
 * THIS IS THE PATTERN FOR EVERY FUTURE RACE IN THIS REPO (PEAK-262).
 * PEAK-262 (two buyers taking the last unit of stock) is the same shape as this
 * one: read a counter, decide, write it. The technique below — two sessions, one
 * locked row, a genuine interleaving — is the technique those tests must copy,
 * and `tests/examples/concurrency.test.ts` is the worked example both this file
 * and PEAK-262 are derived from.
 *
 * WHY TWO INDEPENDENT SESSIONS, AND NEVER TWO STATEMENTS ON ONE
 * A `PoolClient` is one socket to one Postgres backend, and one backend executes
 * one statement at a time: a second statement sent on the same connection is
 * queued behind the first and cannot reach the server until the first answered.
 * Two statements sent that way never overlap, so a one-session version of this
 * test cannot distinguish the real implementation from a broken one that reads
 * the counter in JavaScript, decides, and then writes — because it never attempts
 * the interleaving that breaks that implementation. The guarantee under test
 * ("exactly one of two overlapping redemptions wins the final use") is a property
 * of the DATABASE: the loser blocks on the row lock, and when the winner commits,
 * READ COMMITTED makes Postgres re-evaluate the loser's `WHERE` clause against
 * the new row and skip it. The test must therefore hand Postgres two sessions.
 * `redeemInvite` takes its own connections from the application pool
 * (`lib/db/index.ts`, a `new Pool()` whose default maximum is 10 —
 * node_modules/.pnpm/pg-pool@3.14.0_pg@8.23.0/node_modules/pg-pool/index.js:89),
 * so the two concurrent calls below get two backends without this file touching
 * the pool's configuration. `raceInviteRedemptions` PROVES that they did, rather
 * than assuming it: see the barrier below.
 *
 * HOW THE OVERLAP IS FORCED, AND WHY IT IS NOT FLAKY
 * Firing both calls with `Promise.all` would be a race, but a race whose
 * interleaving is a scheduling accident. This file removes the accident. A
 * separate client holds `SELECT ... FOR UPDATE` on the invite row (an open
 * transaction), the redemption attempts are dispatched, and the test then WAITS
 * until Postgres reports — through `pg_blocking_pids`, straight from
 * `pg_stat_activity` — that every attempt is blocked on that row lock. Only then
 * is the gate committed. So on every run, at least two backends are provably
 * inside the same row's update path at the same moment, and `waitForBlockedBehind`
 * fails loudly if they are not: if a refactor ever left the attempts sharing one
 * connection, the second statement would queue, the blocked count would stay at
 * 1, and this test would fail with an explanation instead of passing vacuously.
 * Every legal interleaving after that point reaches the same answer, because the
 * decision lives in the `UPDATE ... WHERE "redemptionCount" < "maxRedemptions"`
 * predicate, which Postgres evaluates against the row it is about to write while
 * holding that row's lock.
 *
 * THE KILL MUTATION FOR THIS FILE
 * Delete `AND "redemptionCount" < "maxRedemptions"` from the conditional UPDATE in
 * `lib/invites.ts` and this file goes red: both writers succeed, `redemptionCount`
 * lands on 2 against a maximum of 1, and `admin_audit_log` holds two
 * `invite.redeem` rows for one use. Conversely, a SEQUENTIAL version of these
 * calls still passes against the mutated (broken) implementation, because the
 * second call reads the already-incremented counter and refuses from the read
 * phase — which is precisely why the two-session barrier, and not merely
 * "call it twice", is the load-bearing part of this test.
 *
 * NO MOCKS. The scratch schema is the production migration, `redeemInvite` is the
 * shipped module, and every assertion reads back through `db`/`testPool`. A
 * mocked database would only assert the mock.
 */
import { and, eq } from 'drizzle-orm'
import type { PoolClient } from 'pg'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/db'
import { adminAuditLog, betaInvite } from '@/lib/db/schema'
import type { ClaimResult } from '@/lib/invites'
import { redeemInvite } from '@/lib/invites'
import { closeTestPool, countRows, resetTestDatabase, testPool } from '@/tests/helpers/db'
import { createUser } from '@/tests/helpers/factories'

type NewInvite = typeof betaInvite.$inferInsert
type InviteRow = typeof betaInvite.$inferSelect
type AuditRow = typeof adminAuditLog.$inferSelect

/** The refusal the ledger names for a code with no uses left. */
const EXHAUSTED = 'exhausted' as const

/** The audit action `stampInviteRedemption` writes for a completed redemption. */
const INVITE_REDEEM_ACTION = 'invite.redeem'

/** One redemption attempt as the test makes it — the arguments `redeemInvite` takes. */
type RedemptionAttempt = { code: string; userId: string; email: string }

/** One row of `pg_stat_activity`, for a backend waiting on a lock. */
type BlockedBackend = {
  pid: number
  state: string | null
  waitEventType: string | null
  query: string
}

/** The alphabet `generateCode` in `app/admin/actions.ts` uses — no I, O, 0 or 1. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** How long to wait for the redemption attempts to reach the row lock. */
const RACE_WAIT_TIMEOUT_MS = 15_000

/** How often to ask Postgres which backends are waiting. */
const RACE_POLL_INTERVAL_MS = 10

/** Generous per-test timeout: the barrier polls, the pool opens connections. */
const RACE_TEST_TIMEOUT_MS = 30_000

/**
 * A code in the format the admin UI issues (`/^[A-Z2-9]{8}$/`), random per call so
 * two tests in one file cannot collide on the unique index on `beta_invite.code`.
 */
function freshCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

/**
 * Insert one invite through the real schema and return the row Postgres stored.
 * Overrides are spread last, so a test pins any column it needs; the base case is
 * a single-use, unused code, which is the shape the race is about.
 */
async function insertInvite(overrides: Partial<NewInvite> = {}): Promise<InviteRow> {
  const values: NewInvite = {
    code: freshCode(),
    maxRedemptions: 1,
    redemptionCount: 0,
    ...overrides,
  }
  const [row] = await db.insert(betaInvite).values(values).returning()
  if (row === undefined) {
    throw new Error(
      'insertInvite: INSERT ... RETURNING produced no row, so the fixture every ' +
        'assertion below depends on was never written.',
    )
  }
  return row
}

/** Read the invite back from the database. Assertions never use the fixture object. */
async function readInvite(inviteId: string): Promise<InviteRow> {
  const [row] = await db.select().from(betaInvite).where(eq(betaInvite.id, inviteId)).limit(1)
  if (row === undefined) {
    throw new Error(
      `readInvite: no beta_invite row with id ${inviteId}, so nothing can be asserted ` +
        'about it. The fixture insert failed, or a concurrent reset removed it.',
    )
  }
  return row
}

/** The `invite.redeem` audit rows for one invite — one per completed redemption. */
async function readRedemptionAudits(inviteId: string): Promise<AuditRow[]> {
  return db
    .select()
    .from(adminAuditLog)
    .where(
      and(eq(adminAuditLog.action, INVITE_REDEEM_ACTION), eq(adminAuditLog.entityId, inviteId)),
    )
    .orderBy(adminAuditLog.createdAt)
}

/** The successful outcomes, typed so `reason` is unreachable on them. */
function acceptedResults(results: ClaimResult[]): Extract<ClaimResult, { ok: true }>[] {
  return results.filter((result): result is Extract<ClaimResult, { ok: true }> => result.ok)
}

/** The refusals, typed so `reason` is available without a cast. */
function refusedResults(results: ClaimResult[]): Extract<ClaimResult, { ok: false }>[] {
  return results.filter((result): result is Extract<ClaimResult, { ok: false }> => !result.ok)
}

/**
 * A thrown value as text. `unknown` is what a `catch` hands over, and `String(error)`
 * on an `Error` prints `Error: message` while dropping the stack — this keeps the
 * message readable inside the cleanup report and never prints `[object Object]`.
 */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * The backend pid behind a client, for the `pg_blocking_pids` filter below.
 * `pg_backend_pid()` is a database fact; reading it beats assuming the pool gave
 * us a distinct session.
 */
async function backendPid(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
  const pid = rows[0]?.pid
  if (typeof pid !== 'number') {
    throw new Error(
      `pg_backend_pid() did not return a number (got ${String(pid)}); the race cannot be ` +
        'proven to involve a second session without it.',
    )
  }
  return pid
}

/**
 * Every backend in the WAITING SUBTREE behind `blockerPid`, with the statement
 * each one is waiting on.
 *
 * THE SUBTREE, NOT JUST THE DIRECT WAITERS, and why that matters here. Postgres
 * runs a row-lock wait queue: the first statement to find the row locked becomes
 * the queue's head and holds the tuple lock, and the statements that arrive after
 * it wait on THAT waiter — so `pg_blocking_pids()` reports the gate pid for the
 * first attempt only, and the next attempt as the blocker for the ones after it.
 * A test that counted only direct waiters would see 1, conclude the race never
 * happened, and be wrong about the very thing it exists to measure. The recursive
 * walk below follows that queue back to the gate, which is the honest answer to
 * "who is queued behind this row lock".
 */
async function blockedBehind(blockerPid: number): Promise<BlockedBackend[]> {
  const { rows } = await testPool().query<BlockedBackend>(
    `WITH RECURSIVE waiting(pid) AS (
       SELECT pid FROM pg_stat_activity WHERE $1 = ANY (pg_blocking_pids(pid))
       UNION
       SELECT a.pid
         FROM pg_stat_activity a
         JOIN waiting w ON w.pid = ANY (pg_blocking_pids(a.pid))
     )
     SELECT a.pid,
            a.state,
            a.wait_event_type AS "waitEventType",
            a.query
       FROM pg_stat_activity a
       JOIN waiting w ON w.pid = a.pid
      ORDER BY a.pid`,
    [blockerPid],
  )
  return rows
}

/**
 * Wait until `expected` backends are blocked behind the gate's row lock, then
 * return them — this is what turns "two calls at nearly the same time" into "two
 * sessions provably inside the row's update path at once".
 *
 * A timeout is a FAILURE with an explanation, never a silent pass. The only way
 * it happens is if the attempts did not reach the server as separate sessions
 * (e.g. one pooled connection serialising them), which is exactly the situation
 * that would make the rest of the assertions meaningless.
 */
async function waitForBlockedBehind(
  blockerPid: number,
  expected: number,
): Promise<BlockedBackend[]> {
  const deadline = Date.now() + RACE_WAIT_TIMEOUT_MS
  let blocked: BlockedBackend[] = []
  for (;;) {
    blocked = await blockedBehind(blockerPid)
    if (blocked.length >= expected) return blocked
    if (Date.now() >= deadline) {
      throw new Error(
        `only ${blocked.length} of ${expected} redemption attempt(s) were waiting on the ` +
          `invite row lock after ${RACE_WAIT_TIMEOUT_MS} ms. The race under test is a ` +
          'property of two independent Postgres sessions: two statements on one session ' +
          'are executed one after the other and never overlap, which would let a broken ' +
          'read-then-write implementation pass. Refusing to assert on an interleaving ' +
          'that never happened.',
      )
    }
    await new Promise((resolve) => setTimeout(resolve, RACE_POLL_INTERVAL_MS))
  }
}

/**
 * Run every attempt concurrently against ONE row, with the overlap forced.
 *
 * The gate (a separate client from `testPool()`) takes the row lock first. Every
 * `redeemInvite` call is then dispatched before any of them is awaited — the
 * synchronous `map` issues each call's first query straight away — and the test
 * waits until Postgres reports all of them blocked behind that lock. Committing
 * the gate releases them together, so they contend for the row in the database
 * rather than in this process.
 *
 * Results come back in attempt order (`Promise.all` preserves it), which is how a
 * test maps a winning outcome to the user who won it.
 */
async function raceInviteRedemptions(
  inviteId: string,
  attempts: RedemptionAttempt[],
): Promise<ClaimResult[]> {
  if (attempts.length < 2) {
    throw new Error(
      `raceInviteRedemptions: ${attempts.length} attempt(s) is not a race. Pass at least ` +
        'two, or the test asserts nothing about concurrency.',
    )
  }

  const gate = await testPool().connect()
  let inFlight: Promise<ClaimResult>[] | null = null
  let gateCommitted = false
  let stagingError: unknown = null
  let results: ClaimResult[] | null = null

  try {
    await gate.query('BEGIN')
    const locked = await gate.query<{ id: string }>(
      'SELECT id FROM beta_invite WHERE id = $1 FOR UPDATE',
      [inviteId],
    )
    if (locked.rowCount !== 1) {
      throw new Error(
        `raceInviteRedemptions: the gate locked ${String(locked.rowCount)} row(s) of ` +
          `beta_invite ${inviteId}, expected exactly 1. A race cannot be staged on a row ` +
          'that does not exist.',
      )
    }
    const gatePid = await backendPid(gate)

    // Dispatch first, await later: every call is in flight before the gate opens.
    inFlight = attempts.map((attempt) => redeemInvite(attempt))

    const blocked = await waitForBlockedBehind(gatePid, attempts.length)
    for (const backend of blocked) {
      if (!/update\s+(?:"?[a-z_]+"?\.)?"?beta_invite"?/i.test(backend.query)) {
        throw new Error(
          `backend ${backend.pid} is blocked behind the gate, but not on the invite update — ` +
            `its statement is ${JSON.stringify(backend.query)}. The race staged here only ` +
            'means something if the blocked statement is the redemption.',
        )
      }
    }

    await gate.query('COMMIT')
    gateCommitted = true
    results = await Promise.all(inFlight)
  } catch (error) {
    stagingError = error
  }

  // Cleanup runs OUTSIDE a `finally` block, and each step reports its own failure
  // into `cleanupFailures` rather than throwing: a throw from a `finally` would
  // replace the error that explains what actually went wrong, and a swallowed
  // failure here would leave the pooled connection holding this test's row lock.
  const cleanupFailures: string[] = []
  if (!gateCommitted) {
    // Never leave an open transaction on a pooled connection: it would carry the row
    // lock into whatever test receives that connection next.
    try {
      await gate.query('ROLLBACK')
    } catch (error) {
      cleanupFailures.push(`ROLLBACK failed: ${describeError(error)}`)
    }
    // The attempts were dispatched and are waiting on the lock the rollback just
    // released. Settle them so a rejection surfaces in this test rather than as an
    // unhandled rejection somewhere else.
    if (inFlight !== null) {
      const outcomes = await Promise.allSettled(inFlight)
      const fatal = outcomes.filter((outcome) => outcome.status === 'rejected')
      if (fatal.length > 0) {
        cleanupFailures.push(
          `${fatal.length} of ${outcomes.length} redemption attempt(s) failed after the ` +
            `race was abandoned: ${fatal.map((outcome) => describeError(outcome.reason)).join('; ')}`,
        )
      }
    }
  }
  try {
    gate.release()
  } catch (error) {
    cleanupFailures.push(`releasing the gate connection failed: ${describeError(error)}`)
  }

  if (stagingError !== null) {
    throw new Error(
      `raceInviteRedemptions: the race did not complete: ${describeError(stagingError)}` +
        (cleanupFailures.length > 0 ? ` (and ${cleanupFailures.join('; ')})` : ''),
      { cause: stagingError },
    )
  }
  if (cleanupFailures.length > 0) {
    throw new Error(
      `raceInviteRedemptions: the race completed but its cleanup failed: ` +
        cleanupFailures.join('; '),
    )
  }
  if (results === null) {
    // Unreachable: every path above either assigned `results` or set `stagingError`.
    // It is here so this function can never hand a caller `undefined` as a race outcome.
    throw new Error(
      'raceInviteRedemptions: no staging error and no results, so the outcome of the race ' +
        'cannot be reported.',
    )
  }
  return results
}

describe('the final use of one invite code, under concurrency (PEAK-240)', () => {
  beforeEach(async () => {
    await resetTestDatabase()
  })

  afterAll(async () => {
    await closeTestPool()
  })

  it(
    'lets exactly one of two concurrent redemptions win the final use',
    async () => {
      const alice = await createUser()
      const bob = await createUser()
      const invite = await insertInvite({ maxRedemptions: 1, redemptionCount: 0 })
      // The invite names no email, so the email rule cannot be what decides this
      // test's outcome. The pinned-email case has its own test below.
      expect(invite.email).toBeNull()

      const attempts: RedemptionAttempt[] = [
        { code: invite.code, userId: alice.id, email: alice.email },
        { code: invite.code, userId: bob.id, email: bob.email },
      ]
      const results = await raceInviteRedemptions(invite.id, attempts)
      const accepted = acceptedResults(results)
      const refused = refusedResults(results)

      // Exactly one winner and one refusal — the whole point of the test.
      expect(accepted).toHaveLength(1)
      expect(refused).toHaveLength(1)

      const winnerIndex = results.findIndex((result) => result.ok)
      const winner = attempts[winnerIndex]
      if (winner === undefined) {
        throw new Error(
          `results[${winnerIndex}] is not an attempt, so the winner of the race cannot be ` +
            'identified and the stored redeemedById cannot be checked against it.',
        )
      }

      // The winner's outcome is the claim, addressed to the code that was asked for.
      expect(accepted[0]?.inviteId).toBe(invite.id)
      expect(accepted[0]?.code).toBe(invite.code)
      // Not a generic failure: the loser lost the FINAL USE, and the ledger says so.
      expect(refused[0]?.reason).toBe(EXHAUSTED)

      const stored = await readInvite(invite.id)
      expect(stored.redemptionCount).toBe(1)
      expect(stored.maxRedemptions).toBe(1)
      expect(stored.redemptionCount).toBe(stored.maxRedemptions)
      expect(stored.redeemedById).toBe(winner.userId)
      expect(stored.redeemedAt).toBeInstanceOf(Date)

      // TWO SUCCESSES WOULD SHOW AS TWO ROWS. This is the assertion a return value
      // cannot make, and the one that catches a quiet double-spend.
      expect(await countRows('admin_audit_log')).toBe(1)
      const audits = await readRedemptionAudits(invite.id)
      expect(audits).toHaveLength(1)
      expect(audits[0]?.actorId).toBe(winner.userId)
      expect(audits[0]?.actorEmail).toBe(winner.email)
      expect(audits[0]?.entityType).toBe('beta_invite')
    },
    RACE_TEST_TIMEOUT_MS,
  )

  it(
    'lets exactly one of two concurrent redemptions win when the invite pins the email',
    async () => {
      // Same person, two overlapping submissions (a double-tap on the sign-up form).
      // Both attempts pass the email rule, so the ONLY thing standing between them
      // and two accounts from one code is the conditional UPDATE.
      const member = await createUser()
      const invite = await insertInvite({
        maxRedemptions: 1,
        redemptionCount: 0,
        email: member.email,
      })

      const attempts: RedemptionAttempt[] = [
        { code: invite.code, userId: member.id, email: member.email },
        { code: invite.code, userId: member.id, email: member.email },
      ]
      const results = await raceInviteRedemptions(invite.id, attempts)
      const accepted = acceptedResults(results)
      const refused = refusedResults(results)

      expect(accepted).toHaveLength(1)
      expect(refused).toHaveLength(1)
      expect(refused[0]?.reason).toBe(EXHAUSTED)

      const stored = await readInvite(invite.id)
      expect(stored.redemptionCount).toBe(1)
      expect(stored.maxRedemptions).toBe(1)
      expect(stored.redeemedById).toBe(member.id)
      expect(await countRows('admin_audit_log')).toBe(1)
      expect(await readRedemptionAudits(invite.id)).toHaveLength(1)
    },
    RACE_TEST_TIMEOUT_MS,
  )

  it(
    'refuses the second claim when one invite is claimed twice in a row',
    async () => {
      // The same guarantee, with no concurrency at all: it must come from the
      // predicate in the statement, not from timing luck. This is also the check
      // that a matching pinned email is accepted once and only once.
      const member = await createUser()
      const invite = await insertInvite({
        maxRedemptions: 1,
        redemptionCount: 0,
        email: member.email,
      })

      const first = await redeemInvite({
        code: invite.code,
        userId: member.id,
        email: member.email,
      })
      const second = await redeemInvite({
        code: invite.code,
        userId: member.id,
        email: member.email,
      })

      expect(first).toEqual({ ok: true, inviteId: invite.id, code: invite.code })
      expect(second).toEqual({ ok: false, reason: EXHAUSTED })

      const stored = await readInvite(invite.id)
      expect(stored.redemptionCount).toBe(1)
      expect(stored.maxRedemptions).toBe(1)
      expect(stored.redeemedById).toBe(member.id)
      expect(stored.redeemedAt).toBeInstanceOf(Date)
      expect(await countRows('admin_audit_log')).toBe(1)
      expect(await readRedemptionAudits(invite.id)).toHaveLength(1)
    },
    RACE_TEST_TIMEOUT_MS,
  )

  it(
    'admits exactly maxRedemptions of four concurrent attempts',
    async () => {
      // The counter is not a boolean: with three uses, three of four concurrent
      // claimants must get in and the fourth must be told the code is spent.
      const members = await Promise.all([createUser(), createUser(), createUser(), createUser()])
      const invite = await insertInvite({ maxRedemptions: 3, redemptionCount: 0 })

      const attempts: RedemptionAttempt[] = members.map((member) => ({
        code: invite.code,
        userId: member.id,
        email: member.email,
      }))
      const results = await raceInviteRedemptions(invite.id, attempts)
      const accepted = acceptedResults(results)
      const refused = refusedResults(results)

      expect(accepted).toHaveLength(3)
      expect(refused).toHaveLength(1)
      expect(refused[0]?.reason).toBe(EXHAUSTED)

      const stored = await readInvite(invite.id)
      expect(stored.redemptionCount).toBe(3)
      expect(stored.maxRedemptions).toBe(3)

      const winnerIds = attempts
        .filter((_, index) => results[index]?.ok === true)
        .map((attempt) => attempt.userId)
      expect(winnerIds).toHaveLength(3)

      const loserIndex = results.findIndex((result) => !result.ok)
      const loser = attempts[loserIndex]
      if (loser === undefined) {
        throw new Error(
          `results[${loserIndex}] is not an attempt, so the claimant who was refused ` +
            'cannot be identified and the stored redeemedById cannot be checked against the winners.',
        )
      }

      // `redeemedById` can only name one redeemer (the last stamp wins), so it must
      // name one of the three who were admitted — never the claimant who was refused.
      expect(winnerIds).toContain(stored.redeemedById)
      expect(loser.userId).not.toBe(stored.redeemedById)

      // Three admitted redemptions, three audit rows. A fourth row would mean four
      // redemptions against three uses.
      expect(await countRows('admin_audit_log')).toBe(3)
      const audits = await readRedemptionAudits(invite.id)
      expect(audits).toHaveLength(3)
      expect(audits.map((row) => row.actorId).sort()).toEqual([...winnerIds].sort())
    },
    RACE_TEST_TIMEOUT_MS,
  )
})
