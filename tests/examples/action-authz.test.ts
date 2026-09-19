/**
 * WORKED EXAMPLE — proving a Server Action (Server Function) refuses an
 * unauthenticated caller (PEAK-206, test harness unit 8/10).
 *
 * THE BUG THIS PATTERN EXISTS TO CATCH
 * `app/(app)/account/actions.ts` says it in its own header: "Server Functions are
 * reachable by direct POST, not only through the UI, so every one of them
 * re-checks the session itself." The expensive failure is a guard that lives only
 * in the page component — the redirect that hides the form — while the action
 * behind it trusts whoever calls it. A `curl` to the action's endpoint then edits
 * somebody else's row. This file is the copyable proof that the guard is in the
 * ACTION: no session cookie in, refusal out, and the target row untouched.
 *
 * The refusal is asserted as the action's OWN value — `{ ok: false, error: 'You
 * are not signed in.' }` — rather than merely "something failed", because a
 * null dereference, a thrown `TypeError` or an empty `catch` would all "fail"
 * the request too while being the bug, not the defence.
 *
 * WHAT IS MOCKED, AND WHY NOTHING ELSE IS
 * The action reaches the session through two Next.js request-scoped APIs, and
 * both are framework seams rather than Peak logic:
 *
 *   1. `headers()` from `next/headers`. The action calls
 *      `auth.api.getSession({ headers: await headers() })`, so the session cookie
 *      arrives through this call. Outside a Next server there is no incoming
 *      request and no request storage — the real function throws — so the seam is
 *      replaced by a `Headers` object this test controls, exactly the shape
 *      `tests/helpers/auth.ts:signInAs` returns.
 *   2. `revalidatePath()` from `next/cache`. It writes into Next's static
 *      generation store, which also only exists inside a render/action request.
 *      It is replaced by a `vi.fn()` no-op that is then ASSERTED to have been
 *      called, which is how Test 2 proves the action ran to its success path
 *      instead of the mock hiding an early return.
 *
 * Nothing else is mocked. The action itself, `lib/auth.ts` (a real Better Auth
 * instance, `signUpEmail`/`signInEmail`/`getSession`), `lib/db` (the real
 * `pg` pool), the database in the scratch schema and the session cookie
 * `signInAs` mints are all live. That is the whole point of the example: a test
 * that mocked the action, the db or auth would assert against its own fake and
 * would keep passing on the day the guard was deleted.
 *
 * `vi.hoisted` is not decoration. `vi.mock` factories are hoisted above the
 * imports, so a factory may not close over an ordinary top-level `let` — the
 * variable would still be in its temporal dead zone when the mocked module is
 * first imported. `vi.hoisted` moves the container itself up with the factories,
 * so the same object the factories read is the one the tests write.
 *
 * WHY registerUser AND NOT createUser IN THE SESSION TESTS
 * `createUser` (tests/helpers/factories.ts) inserts a `user` row and nothing
 * else. Better Auth signs in against the `account` row that holds the password
 * hash — a row only its own sign-up endpoint writes — so a factory-made user has
 * no credentials to sign in with, and hand-writing a hash is precisely the fake
 * `tests/helpers/auth.ts` refuses to build (its header says why). The two tests
 * that need a session therefore create their user through `registerUser` (Better
 * Auth's real sign-up), and the test that does NOT need a session uses the
 * factory, where a bare real row is exactly the fixture wanted.
 *
 * STATUS: real implementation. It runs against the scratch schema that
 * `tests/setup/global-db.ts` creates; `beforeEach` truncates and `afterAll`
 * closes the pool.
 */

import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { updateProfile } from '@/app/(app)/account/actions'
import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { expectRejects, registerUser, signInAs } from '@/tests/helpers/auth'
import { closeTestPool, resetTestDatabase } from '@/tests/helpers/db'
import { createUser } from '@/tests/helpers/factories'

/**
 * The two mocked seams, held in one hoisted container.
 *
 * `requestHeaders` is the `Headers` the mocked `headers()` reports: empty,
 * except in the tests that set it from `signInAs`.
 */
const seams = vi.hoisted(() => ({
  requestHeaders: new Headers(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/headers', () => ({
  // Async, like the real one (docs/01-app/.../04-functions/headers.md: since
  // v15 `headers` returns a promise). The action awaits it.
  headers: () => Promise.resolve(seams.requestHeaders),
}))

vi.mock('next/cache', () => ({
  revalidatePath: seams.revalidatePath,
}))

/** The name every target row starts with. */
const NAME_BEFORE = 'Before Name'

/** The name the action is asked to write. */
const NAME_AFTER = 'After Name'

/** The exact refusal `updateProfile` returns for a caller with no session. */
const NOT_SIGNED_IN = { ok: false, error: 'You are not signed in.' }

/** The exact refusal for a name shorter than the action's 2-character minimum. */
const NAME_TOO_SHORT = { ok: false, error: 'Name must be at least 2 characters.' }

/** Point the mocked `headers()` at a new set of request headers. */
function setRequestHeaders(headers: Headers): void {
  seams.requestHeaders = headers
}

/**
 * The `FormData` the account form posts. `avatarKind` is absent on purpose: the
 * action defaults it to 'initials', which is one of its allowed values, so these
 * tests exercise the same path the form does when only the name changes.
 */
function profileForm(name: string): FormData {
  const form = new FormData()
  form.set('name', name)
  return form
}

/**
 * Read the stored profile straight out of the real database.
 *
 * `updatedAt` is read as well as `name`: an unauthorized write that happened to
 * write the same name back would be invisible in `name` alone, but it would still
 * move the row's timestamp. A missing row throws rather than being reported as an
 * empty object — a fixture that vanished must not read as "unchanged".
 */
async function readProfile(userId: string): Promise<{
  name: string
  avatarKind: string
  updatedAt: Date
}> {
  const [row] = await db
    .select({ name: user.name, avatarKind: user.avatarKind, updatedAt: user.updatedAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (!row) {
    throw new Error(
      `readProfile(${userId}): no such row in the scratch schema, so the test cannot ` +
        'read back what the action did. The fixture was lost, not left unchanged.',
    )
  }
  return row
}

beforeEach(async () => {
  await resetTestDatabase()
  // No request scope, and no session, unless a test supplies one. Without this,
  // Test 1 would depend on whatever the previous test left in `seams`, and could
  // pass for the wrong reason when the suite runs in a different order.
  setRequestHeaders(new Headers())
})

afterAll(async () => {
  await closeTestPool()
})

describe('updateProfile refuses callers without a session (PEAK-206 worked example)', () => {
  it('refuses an unauthenticated caller with its own error, and writes nothing', async () => {
    // A real row that a caller reaching past the UI would be trying to edit.
    const target = await createUser({ name: NAME_BEFORE })
    const before = await readProfile(target.id)

    // No cookie: `signInAs` is never called, so `headers()` reports nothing and
    // the action has no session to find.
    expect(seams.requestHeaders.get('cookie')).toBeNull()

    const result = await updateProfile(profileForm(NAME_AFTER))

    // The action's own refusal value, asserted exactly. `toEqual` fails on any
    // other error text, on a thrown non-value, and on `{ ok: true }`.
    expect(result).toEqual(NOT_SIGNED_IN)

    // The same refusal through the shared matcher every future authorization
    // ticket calls, driven by a genuine second call of the action. Repeating the
    // call is safe precisely because this is the path under test: the guard
    // returns before the UPDATE, which the read-back below proves.
    await expectRejects(() => updateProfile(profileForm(NAME_AFTER)), /^You are not signed in\.$/)

    const after = await readProfile(target.id)
    expect(after.name).toBe(NAME_BEFORE)
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime())
  })

  it('applies the change for a caller carrying a real session cookie', async () => {
    // Better Auth's own sign-up: it writes the `account` row that makes a
    // sign-in possible, which a bare factory insert does not.
    const account = await registerUser({ name: NAME_BEFORE })
    const before = await readProfile(account.userId)
    expect(before.name).toBe(NAME_BEFORE)

    // A real session, minted by the real endpoint and read back by the helper
    // before it returns; `signInAs` throws rather than returning empty Headers.
    setRequestHeaders(await signInAs(account.userId))

    const result = await updateProfile(profileForm(NAME_AFTER))

    expect(result).toEqual({ ok: true })

    const after = await readProfile(account.userId)
    expect(after.name).toBe(NAME_AFTER)

    // Proof the mocked framework seam was on the success path rather than hiding
    // an early return: the action revalidates /account after the write.
    expect(seams.revalidatePath).toHaveBeenCalledWith('/account')
  })

  it('refuses a too-short name with that rule’s own message, and writes nothing', async () => {
    const account = await registerUser({ name: NAME_BEFORE })
    setRequestHeaders(await signInAs(account.userId))

    // One character: the action's minimum is two. This caller IS authorized, so
    // the refusal proves the checks are per-field and not one blanket gate.
    const result = await updateProfile(profileForm('A'))

    expect(result).toEqual(NAME_TOO_SHORT)
    await expectRejects(
      () => updateProfile(profileForm('A')),
      /^Name must be at least 2 characters\.$/,
    )

    const after = await readProfile(account.userId)
    expect(after.name).toBe(NAME_BEFORE)
  })
})
