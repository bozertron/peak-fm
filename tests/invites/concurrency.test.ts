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
 * Two separate things make this a race proof rather than a scheduling accident,
 * and they are worth keeping apart:
 *
 *   THE CONSTRUCTION. A third connection (the gate) takes the invite row's lock
 *   with `SELECT id FROM beta_invite WHERE id = $1 FOR UPDATE` inside an open
 *   transaction BEFORE either attempt is dispatched. A contender that gets past
 *   phase 1 can then not commit, not be refused, and not reach
 *   `stampInviteRedemption` until the gate opens: its conditional UPDATE has
 *   nowhere to go but the row-lock queue. "Two attempts are in flight at the same
 *   moment" is therefore a fact about how the test is built, not an observation
 *   about timing.
 *
 *   THE BARRIER. The gate is committed only once the barrier has SEEN that queue,
 *   and it reads the queue out of `pg_locks` — the lock manager's own view, which
 *   is the authority on who is waiting. Measured on this repository's PostgreSQL
 *   16.8 with one `FOR UPDATE` holder and several waiters on the same row: the
 *   FIRST waiter holds an ungranted `transactionid` lock whose `transactionid` is
 *   the gate's own xid (it holds the tuple lock and waits for the holder to
 *   finish), and every waiter BEHIND it holds an ungranted `tuple` lock on
 *   `beta_invite`. Neither shape can be produced by the phase-1 `SELECT`: a plain
 *   read takes no row-level lock at all, so `sessionsQueuedOnInviteRow` matches
 *   only sessions that have reached the conditional UPDATE. The queue cannot
 *   drain while the gate is open, so the barrier waits for a state that persists
 *   until the barrier itself ends it, and a deadline that fires says what it saw.
 *   Every legal interleaving after that point reaches the same answer, because the
 *   decision lives in the `UPDATE ... WHERE "redemptionCount" < "maxRedemptions"`
 *   predicate, which Postgres evaluates against the row it is about to write while
 *   holding that row's lock.
 *
 * WHAT THE PREVIOUS BARRIER GOT WRONG, AND WHY THIS ONE CANNOT REPEAT IT.
 * The previous version held the same gate but read the queue out of
 * `pg_stat_activity`: it waited for the first reading in which the number of
 * sessions "blocked behind" the gate reached the number of attempts, and then
 * asserted that the `query` column OF THAT SAME READING was the invite UPDATE.
 * One full-suite run failed inside it, reporting a session as blocked while its
 * statement was the phase-1 `SELECT ... FROM beta_invite WHERE code = $1 LIMIT
 * $2` — a pairing no row lock can produce, because a plain SELECT never waits on
 * one. The lesson is not "wait longer"; it is that the two fields that barrier
 * read are not one fact. `pg_blocking_pids` is evaluated from live lock-manager
 * state session by session, while the statement text is the status a backend last
 * reported for itself, so a single reading can disagree with itself about what a
 * session is doing — and the old barrier turned one reading into a verdict and
 * gave up in a window the construction guarantees to close within a poll or two.
 * This barrier takes its evidence from the LOCK MANAGER only, which cannot lag
 * behind the wait it is reporting, and it waits for that evidence instead of
 * judging the first reading. Statement text still appears, but only inside the
 * FAILURE MESSAGES — the queued-session listing below and `describeWaitState` —
 * and it decides nothing there: the barrier counts lock-manager rows, and never
 * turns what a backend said it was doing into a pass or a failure.
 *
 * THE KILL MUTATIONS FOR THIS FILE
 * 1. Delete `AND "redemptionCount" < "maxRedemptions"` from the conditional
 *    UPDATE in `lib/invites.ts` and this file goes red: both writers succeed,
 *    `redemptionCount` lands on 2 against a maximum of 1, and `admin_audit_log`
 *    holds two `invite.redeem` rows for one use. Conversely, a SEQUENTIAL version
 *    of these calls still passes against the mutated (broken) implementation,
 *    because the second call reads the already-incremented counter and refuses
 *    from the read phase — which is precisely why the two-session barrier, and not
 *    merely "call it twice", is the load-bearing part of this test.
 * 2. Serialise the attempts: dispatch each `redeemInvite` and await it before
 *    dispatching the next. The first cannot finish while the gate holds the row
 *    lock, so at most one session ever queues, the barrier never reaches its
 *    target, and every racing test fails on a deadline that names how many
 *    sessions it saw. A barrier that let that pass would be decoration, so this
 *    mutation is run as part of the unit's evidence, not merely asserted here.
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

/** One session holding a lock that only a queued row-lock attempt can hold. */
type QueuedSession = {
  pid: number
  state: string | null
  waitEventType: string | null
  waitEvent: string | null
  /**
   * The statement the backend last reported. Carried for the FAILURE MESSAGE
   * only, never for the decision — see the module header on why this field is not
   * evidence that a session is queued.
   */
  query: string
}

/** The alphabet `generateCode` in `app/admin/actions.ts` uses — no I, O, 0 or 1. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** How long to wait for the redemption attempts to reach the row lock. */
const RACE_WAIT_TIMEOUT_MS = 15_000

/** How often to ask the lock manager which sessions are queued on the row lock. */
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
 * The backend pid behind a client: the gate's pid is what the barrier excludes
 * when it asks the lock manager who is queued. `pg_backend_pid()` is a database
 * fact; reading it beats assuming the pool gave us a distinct session.
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
 * The gate transaction's own id, as text — the thing a queued session waits ON.
 *
 * `pg_locks.transactionid` on a waiting session names the transaction it is
 * waiting for, so this string is how the HEAD of the row-lock queue is picked out
 * of `pg_locks`. Compared as text because `xid` and `xid8` are different widths
 * and a cast between them could silently compare the wrong numbers; `txid_current()`
 * hands back the 32-bit id as a bigint, formatted exactly as
 * `pg_locks.transactionid::text` formats the column it must match (measured on
 * the PostgreSQL 16.8 in this repository). The row lock the gate already took has
 * assigned the transaction an id, which is why reading it here cannot be what
 * gives the gate its id.
 */
async function gateTransactionId(client: PoolClient): Promise<string> {
  const { rows } = await client.query<{ xid: string | null }>('SELECT txid_current()::text AS xid')
  const xid = rows[0]?.xid
  if (typeof xid !== 'string' || xid.length === 0) {
    throw new Error(
      `txid_current() did not return a transaction id (got ${String(xid)}); the head of the ` +
        'row-lock queue cannot be identified, so the barrier cannot prove the race staged.',
    )
  }
  return xid
}

/**
 * The sessions queued on the invite row lock the gate holds.
 *
 * TWO LOCK SHAPES, ONE QUEUE. `pg_locks` reports the head of a row-lock queue and
 * the sessions behind it differently (measured here with one `FOR UPDATE` holder
 * and several waiters on the same row): the head holds an ungranted
 * `transactionid` lock whose target is the gate's xid, and each waiter behind the
 * head holds an ungranted `tuple` lock on `beta_invite`. Matching BOTH is what
 * makes the predicate complete, and matching them in `pg_locks` is what makes it
 * immune to the reported-statement lag that broke the previous barrier: the lock
 * manager is the authority on who is waiting for what.
 *
 * WHAT THIS CANNOT MATCH. A plain `SELECT` takes no row-level lock, so the
 * phase-1 `readInviteByCode` in `lib/invites.ts` cannot put a session in this
 * set. The statement that can is the conditional
 * `UPDATE ... WHERE "redemptionCount" < "maxRedemptions"` — or the
 * `SELECT ... FOR UPDATE` inside `stampInviteRedemption`, which a contender
 * cannot reach while the gate is open, because reaching it requires the claim it
 * just queued behind.
 *
 * `DISTINCT ON (l.pid)` because the barrier counts SESSIONS, and one session can
 * hold more than one matching row (the head holds a granted tuple lock and waits
 * on the transaction id).
 */
async function sessionsQueuedOnInviteRow(
  gatePid: number,
  gateXid: string,
): Promise<QueuedSession[]> {
  const { rows } = await testPool().query<QueuedSession>(
    `SELECT DISTINCT ON (l.pid)
            l.pid,
            a.state,
            a.wait_event_type AS "waitEventType",
            a.wait_event AS "waitEvent",
            a.query
       FROM pg_locks l
       JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE l.granted = false
        AND l.pid <> $1
        AND ( (l.locktype = 'transactionid' AND l.transactionid::text = $2)
           OR (l.locktype = 'tuple' AND l.relation = 'beta_invite'::regclass) )
      ORDER BY l.pid`,
    [gatePid, gateXid],
  )
  return rows
}

/**
 * What the barrier could see at the moment it gave up, as text for the failure
 * message: every session that is active or waiting, what is blocking it, and the
 * statement it last reported. This is the ONLY place a statement is read, and it
 * only ever writes prose into an error — it cannot turn a bad reading into a pass
 * or a failure of its own.
 */
async function describeWaitState(gatePid: number): Promise<string> {
  const { rows } = await testPool().query<{
    pid: number
    state: string | null
    waitEventType: string | null
    waitEvent: string | null
    blockers: number[]
    query: string
  }>(
    `SELECT a.pid,
            a.state,
            a.wait_event_type AS "waitEventType",
            a.wait_event AS "waitEvent",
            pg_blocking_pids(a.pid) AS blockers,
            left(a.query, 160) AS query
       FROM pg_stat_activity a
      WHERE a.pid <> $1
        AND (a.state <> 'idle' OR pg_blocking_pids(a.pid) <> '{}')
      ORDER BY a.pid`,
    [gatePid],
  )
  if (rows.length === 0) return '  (no other session was active or waiting)'
  return rows
    .map(
      (row) =>
        `  pid ${row.pid}: state=${String(row.state)} ` +
        `wait=${String(row.waitEventType)}/${String(row.waitEvent)} ` +
        `blockedBy=[${row.blockers.join(',')}] ` +
        `statement=${JSON.stringify(row.query)}`,
    )
    .join('\n')
}

/**
 * The queued sessions as prose for a failure message: pid, what each is waiting
 * on, and the statement it last reported. This is DIAGNOSTIC ONLY — it feeds the
 * two failure messages below and is read on no other path — which is why the
 * barrier can afford to carry fields it does not decide on. A deadline that says
 * "only 1 of 4 queued" without naming the one it saw leaves the next reader
 * guessing which session stalled where; this does not.
 */
function describeQueuedSessions(queued: QueuedSession[]): string {
  if (queued.length === 0) return '  (no session was queued on the invite row lock)'
  return queued
    .map(
      (session) =>
        `  pid ${session.pid}: state=${String(session.state)} ` +
        `wait=${String(session.waitEventType)}/${String(session.waitEvent)} ` +
        `statement=${JSON.stringify(session.query)}`,
    )
    .join('\n')
}

/**
 * Wait until at least `expected` sessions are queued on the invite row lock the
 * gate holds, and return them.
 *
 * A deadline is a FAILURE that reports what it saw — never a silent pass, and
 * never a verdict drawn from a single reading taken mid-transition. It can only
 * fire when the attempts did not reach the row as separate sessions: a serialised
 * pair, or two statements handed to one connection, never queues the second, and
 * a queue that never forms would make every assertion below meaningless.
 */
async function waitForQueuedOnInviteRow(
  gatePid: number,
  gateXid: string,
  expected: number,
): Promise<QueuedSession[]> {
  const deadline = Date.now() + RACE_WAIT_TIMEOUT_MS
  for (;;) {
    const queued = await sessionsQueuedOnInviteRow(gatePid, gateXid)
    if (queued.length >= expected) {
      if (queued.length > expected) {
        throw new Error(
          `${queued.length} sessions are queued on the invite row lock, but this race staged ` +
            `${expected} attempt(s). The guarantee under test is about THIS file's attempts, ` +
            'so a queue containing a session this test did not dispatch means the barrier ' +
            'cannot say which redemptions it queued. Refusing to commit the gate and call ' +
            `that a race. The queue it saw:\n${describeQueuedSessions(queued)}`,
        )
      }
      return queued
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `after ${RACE_WAIT_TIMEOUT_MS} ms only ${queued.length} of ${expected} redemption ` +
          'attempt(s) had queued on the invite row lock the gate holds. The race under test is ' +
          'a property of independent Postgres sessions: a second statement on one session, or a ' +
          'serialised pair (the first attempt awaited before the second is dispatched), never ' +
          'queues here — which is the situation in which a broken read-then-write implementation ' +
          'would pass vacuously. Refusing to release the gate into a race that never staged. ' +
          `The ${queued.length} session(s) it did see queued on the row lock:\n` +
          `${describeQueuedSessions(queued)}\nEvery session active or waiting:\n` +
          `${await describeWaitState(gatePid)}`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, RACE_POLL_INTERVAL_MS))
  }
}

/**
 * Run every attempt concurrently against ONE row, with the overlap forced.
 *
 * The gate (a separate client from `testPool()`) takes the row lock FIRST, before
 * any attempt is dispatched. Every `redeemInvite` call is then issued before any
 * of them is awaited — the synchronous `map` starts each call's first query
 * straight away — and the barrier waits until the lock manager reports that all
 * of them are queued on that row lock. Committing the gate releases them
 * together, so they contend for the row in the database rather than in this
 * process, and the queue's existence is what makes it a race instead of a
 * sequence. See the module header for why the queue is read from `pg_locks` and
 * not from the statements the sessions happen to be reporting.
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
    const gateXid = await gateTransactionId(gate)

    // Dispatch first, await later: every call is in flight before the gate opens,
    // and the gate already holds the row lock, so a call that gets past phase 1
    // has nowhere to go but this row's queue and stays there until the commit
    // below. The barrier waits for that queue rather than for a window in which
    // two calls happen to be close together.
    inFlight = attempts.map((attempt) => redeemInvite(attempt))
    await waitForQueuedOnInviteRow(gatePid, gateXid, attempts.length)

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
