/**
 * WORKED EXAMPLE — concurrency (PEAK-206, the test harness, unit 9 of 10).
 *
 * THIS IS THE PATTERN FOR EVERY FUTURE RACE IN THIS REPO. PEAK-240 (two people
 * redeeming the final use of one invite code) and PEAK-262 (two buyers taking the
 * last unit of stock) are both "read a counter, decide, then write it", and both
 * are broken unless the check and the write are ONE statement the database
 * performs under a row lock. This file proves the harness can express that race
 * against real rows, on the real `beta_invite` table, through real connections.
 *
 * WHY TWO POOL CLIENTS, AND NEVER TWO QUERIES ON ONE
 * A `PoolClient` is one socket to one Postgres backend, and a socket carries one
 * statement at a time: a second `query()` on the SAME client is queued behind the
 * first and cannot reach the server until the first has answered. Two statements
 * sent that way never overlap in the database, so a one-client version of this
 * test would pass even against an implementation that reads in JavaScript,
 * decides, then writes — because it never attempts the interleaving that breaks
 * that implementation. The guarantee under test ("exactly one of two overlapping
 * redemptions wins") is a property of the DATABASE: the loser blocks on the row
 * lock, and when the winner commits, READ COMMITTED makes Postgres re-evaluate
 * the loser's `WHERE` against the new row and skip it. The test must therefore
 * hand Postgres two sessions. Hence two clients from `testPool()`, two backend
 * PIDs, one row.
 *
 * WHY IT IS NOT FLAKY
 * The winner's statement is awaited to completion INSIDE an open transaction — it
 * holds the row lock — and only then is the loser's statement issued on the second
 * client, while that lock is still held. The overlap is a certainty on every run
 * rather than a scheduling accident, and every possible interleaving reaches the
 * same answer: the two `rowCount`s sum to exactly 1 and the stored counter is
 * exactly 1. The second test repeats the identical statement twice in a row, with
 * no concurrency at all, to show the guarantee comes from the predicate rather
 * than from timing luck.
 *
 * The kill-mutation for this file is to drop `AND "redemptionCount" <
 * "maxRedemptions"` from `REDEEM_SQL`: both attempts then succeed, the counters
 * sum to 2, and both tests go red. That is the mutation this example exists to
 * catch.
 */
import type { PoolClient } from 'pg'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeTestPool, resetTestDatabase, testPool } from '@/tests/helpers/db'

/**
 * One redemption attempt — the exact statement PEAK-240 must run at sign-up.
 *
 * Every condition lives in the `WHERE`, so Postgres evaluates it against the row
 * it is about to update, while holding that row's lock. There is deliberately no
 * `SELECT` before it: a separate read is a separate snapshot, and the gap between
 * the two is the bug this pattern removes. `RETURNING` makes the winning attempt
 * hand back the counter it committed, so the test can assert the write, not just
 * the row count.
 */
const REDEEM_SQL = `UPDATE beta_invite
   SET "redemptionCount" = "redemptionCount" + 1
 WHERE id = $1
   AND "redemptionCount" < "maxRedemptions"
   AND "revokedAt" IS NULL
RETURNING "redemptionCount"`

type RedeemOutcome = {
  /** Rows the UPDATE actually changed: 1 = this attempt won, 0 = it lost. */
  affected: number
  /** The counter `RETURNING` handed back, or null when no row was changed. */
  redemptionCount: number | null
}

type InviteCounterRow = { redemptionCount: number; maxRedemptions: number }
type BackendPidRow = { pid: number }

/**
 * `rowCount` is `number | null` in the pg types, and for an UPDATE Postgres always
 * reports a count — so a null here means the driver answered something other than
 * what the statement guarantees. Throwing beats `?? 0`, which would let a broken
 * statement read as "the row was already redeemed" and turn a real failure into a
 * confident pass.
 */
function affectedRows(rowCount: number | null): number {
  if (typeof rowCount !== 'number') {
    throw new Error(
      `beta_invite redemption UPDATE returned rowCount = ${String(rowCount)}; an ` +
        'UPDATE always reports the number of rows it changed. Refusing to treat ' +
        'a missing count as "changed nothing".',
    )
  }
  return rowCount
}

async function attemptRedemption(client: PoolClient, inviteId: string): Promise<RedeemOutcome> {
  const result = await client.query<InviteCounterRow>(REDEEM_SQL, [inviteId])
  const changed = result.rows[0]
  return {
    affected: affectedRows(result.rowCount),
    redemptionCount: changed === undefined ? null : changed.redemptionCount,
  }
}

/**
 * The fixture: one invite code with a single remaining use. `id` has NO database
 * default — the schema declares it with drizzle's `$defaultFn`, which runs in
 * JavaScript, not in Postgres — so a bare `INSERT ... (code)` would fail on the
 * primary key. Supplying it here is what makes the row addressable afterwards.
 */
async function insertFinalUseInvite(): Promise<string> {
  const inviteId = crypto.randomUUID()
  await testPool().query(
    `INSERT INTO beta_invite (id, code, "maxRedemptions", "redemptionCount")
     VALUES ($1, $2, 1, 0)`,
    [inviteId, `race-${inviteId}`],
  )
  return inviteId
}

/** Read the row back through the pool, so assertions come from the database. */
async function readInvite(inviteId: string): Promise<InviteCounterRow> {
  const { rows } = await testPool().query<InviteCounterRow>(
    `SELECT "redemptionCount", "maxRedemptions" FROM beta_invite WHERE id = $1`,
    [inviteId],
  )
  const row = rows[0]
  if (row === undefined) {
    throw new Error(
      `beta_invite row ${inviteId} does not exist, so nothing can be asserted ` +
        'about it. The fixture insert or a concurrent reset removed it.',
    )
  }
  return row
}

/**
 * The backend pid behind a client. Asserting that the two clients report
 * DIFFERENT pids is what keeps this test honest: if a refactor ever handed the
 * same pooled connection to both attempts, the two statements would serialise and
 * the race being tested would not exist.
 */
async function backendPid(client: PoolClient): Promise<number> {
  const { rows } = await client.query<BackendPidRow>('SELECT pg_backend_pid() AS pid')
  const pid = rows[0]?.pid
  if (typeof pid !== 'number') {
    throw new Error(
      `pg_backend_pid() did not return a number (got ${String(pid)}); the two ` +
        'sessions cannot be proven distinct without it.',
    )
  }
  return pid
}

describe('concurrency — the final use of one invite code (PEAK-206 worked example)', () => {
  beforeEach(async () => {
    await resetTestDatabase()
  })

  afterAll(async () => {
    await closeTestPool()
  })

  it('lets exactly one of two overlapping redemptions through', async () => {
    const inviteId = await insertFinalUseInvite()
    expect((await readInvite(inviteId)).maxRedemptions).toBe(1)

    const winnerSession = await testPool().connect()
    const loserSession = await testPool().connect()
    let winnerCommitted = false
    try {
      // Two sessions, not one. A shared connection queues the second statement
      // behind the first and nothing below would be a race at all.
      expect(await backendPid(winnerSession)).not.toBe(await backendPid(loserSession))

      await winnerSession.query('BEGIN')
      const winner = await attemptRedemption(winnerSession, inviteId)

      // The loser is issued while the winner still holds the row lock, uncommitted,
      // so it must wait in Postgres and re-check the predicate against the row the
      // winner is about to commit. The overlap is forced, not hoped for.
      const loserInFlight = attemptRedemption(loserSession, inviteId)
      await winnerSession.query('COMMIT')
      winnerCommitted = true
      const loser = await loserInFlight

      // The invariant: exactly one of the two statements changed the row.
      expect(winner.affected + loser.affected).toBe(1)
      expect(winner.affected).toBe(1)
      expect(winner.redemptionCount).toBe(1)
      expect(loser.affected).toBe(0)
      expect(loser.redemptionCount).toBeNull()

      const stored = await readInvite(inviteId)
      expect(stored.redemptionCount).toBe(1)
    } finally {
      // A pooled connection handed back with an open transaction carries it into
      // whatever test gets that connection next, so the transaction is closed
      // before the release — always, including on an assertion failure.
      if (!winnerCommitted) await winnerSession.query('ROLLBACK')
      winnerSession.release()
      loserSession.release()
    }
  })

  it('refuses the second attempt when the two calls are sequential', async () => {
    const inviteId = await insertFinalUseInvite()

    const client = await testPool().connect()
    try {
      const first = await attemptRedemption(client, inviteId)
      const second = await attemptRedemption(client, inviteId)

      expect(first.affected).toBe(1)
      expect(first.redemptionCount).toBe(1)
      expect(second.affected).toBe(0)
      expect(second.redemptionCount).toBeNull()

      const stored = await readInvite(inviteId)
      expect(stored.redemptionCount).toBe(1)
    } finally {
      client.release()
    }
  })
})
