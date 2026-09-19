/**
 * Sessions and the authorization assertion — PEAK-206 (test harness, unit 6/10).
 *
 * THREE THINGS A TEST NEEDS, AND WHY EACH IS WRITTEN THE WAY IT IS
 *
 * 1. `registerUser` — a real user, created through Better Auth's own server API
 *    (`auth.api.signUpEmail`, the same endpoint the sign-up form posts to), never
 *    by hand-writing rows. Hand-written rows would drift from what the library
 *    actually writes, which is exactly the drift the harness exists to catch.
 *
 * 2. `signInAs(userId)` — a `Headers` object carrying a REAL session cookie
 *    minted by `auth.api.signInEmail`. A Server Function reaches the session
 *    through `auth.api.getSession({ headers: await headers() })` (see
 *    `app/(app)/account/actions.ts`), so a forged cookie would be a fake wired
 *    into a real code path. The cookie string is built from the sign-in
 *    response's own `set-cookie` headers through Better Auth's own
 *    `applySetCookies` — the identical function its `setCookieToHeader` plugin
 *    uses — so the encoding round trip is the library's, not ours. `signInAs`
 *    then re-reads the session with `getSession` and throws unless it comes back
 *    as the requested user: a session that cannot be read back is not a session.
 *
 * 3. `expectRejects(fn, /pattern/)` — the assertion every future authorization
 *    ticket calls. It accepts a rejection whose message matches, or a resolved
 *    `{ ok: false, error }` whose error matches (`app/(app)/account/actions.ts`
 *    returns that shape). Anything else fails with a message that prints what
 *    was actually received, so a red test says what happened rather than "expected
 *    rejection".
 *
 * WHY THE MODULE IS LOADED LAZILY, THROUGH JITI
 * `lib/auth.ts` imports through the `@/*` alias and is TypeScript, so plain Node
 * resolves neither (measured: `Cannot find package '@/lib/db' imported from
 * .../lib/auth.ts`). `tests/setup/global-db.ts` already loads TypeScript this way
 * for the same reason. It also has to be LAZY: `lib/db/index.ts` reads
 * `process.env.DATABASE_URL` when it is first evaluated, so the scratch-schema URL
 * that `global-db.ts` exports must already be in the environment — which it is by
 * the time a test calls these functions, and is not when this module is parsed.
 *
 * AUTHORITY READ FOR THIS FILE (installed better-auth 1.7.5, the version this
 * repository actually runs — everything below is read from
 * `node_modules/better-auth/`):
 *   - dist/api/routes/sign-up.mjs:264  sign-up calls `setSessionCookie(ctx, ...)`
 *     when `emailAndPassword.autoSignIn` is true (it is: `lib/auth.ts`), so the
 *     sign-up response already carries a session cookie.
 *   - dist/cookies/index.mjs:49        the cookie is named `<prefix>.session_token`.
 *   - dist/cookies/index.mjs:167       `setSessionCookie` writes it onto the
 *     endpoint's response headers.
 *   - dist/api/dispatch.mjs:193,258    with `asResponse: true` the accumulated
 *     headers (the `set-cookie` ones included) are attached to the returned
 *     `Response`.
 *   - dist/api/to-auth-endpoints.mjs:48  `auth.api.*` forwards `asResponse`.
 *   - dist/cookies/index.mjs:190 (cookie-utils) `applySetCookies(target, values)`
 *     parses `set-cookie` values and writes the equivalent `cookie` header.
 */
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applySetCookies } from 'better-auth/cookies'
import { createJiti } from 'jiti'
import type { Jiti } from 'jiti'

/** Repo root, from `tests/helpers/auth.ts`. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * The password `registerUser` uses unless the caller overrides it. Long enough
 * for Better Auth's default minimum (8) with room to spare.
 */
export const DEFAULT_TEST_PASSWORD = 'peak-test-password'

/** Credentials this module minted, keyed by the user id it returned. */
const mintedCredentials = new Map<string, { email: string; password: string }>()

/**
 * The slice of the Better Auth server API this file calls. Declared rather than
 * imported because the instance arrives through `jiti` as an untyped module; the
 * methods are asserted to exist at load time, so the declaration cannot quietly
 * become a lie.
 */
type AuthApi = {
  signUpEmail(input: {
    body: { email: string; password: string; name: string }
    asResponse: true
  }): Promise<Response>
  signInEmail(input: {
    body: { email: string; password: string; rememberMe: boolean }
    asResponse: true
  }): Promise<Response>
  getSession(input: { headers: Headers }): Promise<{ user: { id: string } } | null>
}

type AuthInstance = { api: AuthApi }

/** The slice of `lib/db/index.ts` the credential fallback uses. */
type DbModule = {
  pool: { query<R>(text: string, values: unknown[]): Promise<{ rows: R[] }> }
}

let jitiInstance: Jiti | undefined
let authPromise: Promise<AuthInstance> | undefined

/** One loader for every module this file pulls in, so they share a module cache. */
function loader(): Jiti {
  jitiInstance ??= createJiti(import.meta.url, { alias: { '@': REPO_ROOT } })
  return jitiInstance
}

/**
 * Refuse to mint users outside the scratch schema.
 *
 * `tests/setup/db-env.ts` guards the vitest path, but these helpers are also
 * called from plain `node` scripts, where nothing else stops `lib/db/index.ts`
 * from connecting to the developer's working database and writing real users
 * into it. A missing scratch URL is an error, never a fallback.
 */
function assertTestDatabase(): void {
  const schema = process.env.PEAK_TEST_SCHEMA
  const scratchUrl = process.env.PEAK_TEST_DATABASE_URL
  const activeUrl = process.env.DATABASE_URL
  if (!schema || !scratchUrl || activeUrl !== scratchUrl) {
    throw new Error(
      'Refusing to register or sign in a test user: this process is not pointed at a ' +
        `scratch schema (PEAK_TEST_SCHEMA=${schema ?? '(unset)'}, ` +
        `PEAK_TEST_DATABASE_URL=${scratchUrl ? 'set' : '(unset)'}, DATABASE_URL ` +
        `${activeUrl === scratchUrl ? 'matches' : 'does not match'} it). Run the suite ` +
        'through `pnpm test` — tests/setup/global-db.ts creates the scratch schema and ' +
        'exports these variables — or await that global setup from a plain node script ' +
        'before importing this module. Better Auth would otherwise write real users into ' +
        'the developer database.',
    )
  }
}

/** Load `lib/auth.ts` — the one real Better Auth instance — exactly once. */
async function loadAuth(): Promise<AuthInstance> {
  authPromise ??= loadAuthUncached()
  return authPromise
}

async function loadAuthUncached(): Promise<AuthInstance> {
  assertTestDatabase()
  const module = await loader().import<{ auth?: AuthInstance }>(
    resolve(REPO_ROOT, 'lib/auth.ts'),
  )
  const auth = module.auth
  if (!auth?.api) {
    throw new Error(
      'lib/auth.ts did not export an `auth` object with an `api` — the session helpers ' +
        'cannot mint a real session without it.',
    )
  }
  for (const method of ['signUpEmail', 'signInEmail', 'getSession'] as const) {
    if (typeof auth.api[method] !== 'function') {
      throw new Error(
        `better-auth api.${method} is missing from the loaded auth instance ` +
          '(installed version: check node_modules/better-auth/package.json). ' +
          'The session helpers are written against better-auth 1.7.5.',
      )
    }
  }
  return auth
}

/** A response body, kept as text as well as parsed JSON so failures can print it. */
type ResponseBody = { text: string; json: unknown }

async function readBody(response: Response): Promise<ResponseBody> {
  const text = await response.text()
  if (text.trim() === '') return { text, json: null }
  try {
    return { text, json: JSON.parse(text) }
  } catch {
    // Not JSON (an HTML error page, say). The raw text is still evidence, and it
    // is printed by whoever reports the failure — nothing is swallowed.
    return { text, json: null }
  }
}

/** Print a value for a failure message without ever throwing on a weird value. */
function describeValue(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value)
      return json === undefined ? Object.prototype.toString.call(value) : json
    } catch {
      // Circular or BigInt-bearing values cannot be serialised; the object tag is
      // still more informative than '[object Object]' would be from String().
      return Object.prototype.toString.call(value)
    }
  }
  return String(value)
}

/** The text an unknown thrown value should be matched against. */
function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' ? message : String(error)
}

/**
 * Turn a response into the `Headers` a browser would send for it: every
 * `set-cookie` value the response carries, replayed as a `cookie` header by the
 * library's own parser. `getSetCookie()` is preferred because `Headers.get()`
 * folds multiple cookies into one comma-joined string that cannot be split
 * unambiguously (Expires dates contain commas).
 */
function cookieHeadersFrom(response: Response, context: string): Headers {
  const setCookies = response.headers.getSetCookie()
  if (setCookies.length === 0) {
    throw new Error(
      `${context}: Better Auth returned HTTP ${response.status} with no set-cookie header, ` +
        `so no session can be carried. Headers present: ` +
        `${[...response.headers.keys()].join(', ') || '(none)'}.`,
    )
  }
  const headers = new Headers()
  applySetCookies(headers, setCookies)
  const cookie = headers.get('cookie')
  if (!cookie) {
    throw new Error(
      `${context}: the ${setCookies.length} set-cookie value(s) parsed to an empty cookie ` +
        'header, so the session cannot be carried.',
    )
  }
  return headers
}

/**
 * Create a real user through Better Auth's own sign-up endpoint and return the
 * id it assigned plus the credentials used.
 *
 * The email is unique per call by default, so two tests — or two runs — never
 * collide on the unique index.
 */
export async function registerUser(
  overrides: { email?: string; password?: string; name?: string } = {},
): Promise<{ userId: string; email: string; password: string }> {
  const email = overrides.email ?? `peak-test-${randomUUID()}@example.test`
  const password = overrides.password ?? DEFAULT_TEST_PASSWORD
  const name = overrides.name ?? 'Peak Test User'

  const auth = await loadAuth()
  const response = await auth.api.signUpEmail({
    body: { email, password, name },
    asResponse: true,
  })
  const body = await readBody(response)
  const context = `registerUser(${email})`
  if (!response.ok) {
    throw new Error(
      `${context}: Better Auth refused the sign-up with HTTP ${response.status}. ` +
        `Response body: ${body.text || '(empty)'}`,
    )
  }

  const user = (body.json as { user?: { id?: unknown } } | null)?.user
  if (typeof user?.id !== 'string' || user.id === '') {
    throw new Error(
      `${context}: the sign-up response carried no user id, so the helper cannot report one. ` +
        `Response body: ${body.text || '(empty)'}`,
    )
  }

  mintedCredentials.set(user.id, { email, password })
  return { userId: user.id, email, password }
}

/**
 * Resolve the credentials for a user id: the ones `registerUser` used, or — for a
 * user created some other way — the email from the database paired with
 * `DEFAULT_TEST_PASSWORD`. A user id that does not exist is an error, not a
 * silent `null` that would surface later as a confusing 401.
 */
async function resolveCredentials(userId: string): Promise<{ email: string; password: string }> {
  const minted = mintedCredentials.get(userId)
  if (minted) return minted

  assertTestDatabase()
  const { pool } = await loader().import<DbModule>(resolve(REPO_ROOT, 'lib/db/index.ts'))
  const { rows } = await pool.query<{ email: string }>(
    'SELECT "email" FROM "user" WHERE "id" = $1 LIMIT 1',
    [userId],
  )
  const email = rows[0]?.email
  if (!email) {
    throw new Error(
      `signInAs(${userId}): no user with that id exists in the scratch schema ` +
        `(${process.env.PEAK_TEST_SCHEMA ?? 'unset'}), and this helper never minted ` +
        'credentials for it. Create the user with registerUser().',
    )
  }
  return { email, password: DEFAULT_TEST_PASSWORD }
}

/**
 * Sign a user in through Better Auth's real sign-in endpoint and return `Headers`
 * carrying the session cookie exactly as the response set it.
 *
 * Throws — with the response status and body — if the sign-in fails, if no
 * cookie comes back, or if the cookie cannot be read back as that user. There is
 * no path that returns empty `Headers`.
 */
export async function signInAs(userId: string): Promise<Headers> {
  const { email, password } = await resolveCredentials(userId)
  const auth = await loadAuth()
  const response = await auth.api.signInEmail({
    body: { email, password, rememberMe: true },
    asResponse: true,
  })
  const body = await readBody(response)
  const context = `signInAs(${userId})`
  if (!response.ok) {
    throw new Error(
      `${context}: Better Auth refused the sign-in for ${email} with HTTP ` +
        `${response.status}. Response body: ${body.text || '(empty)'}`,
    )
  }

  const headers = cookieHeadersFrom(response, context)
  const session = await auth.api.getSession({ headers })
  if (session?.user?.id !== userId) {
    throw new Error(
      `${context}: the sign-in returned HTTP ${response.status}, but reading the session back ` +
        `with auth.api.getSession returned ${describeValue(session)} instead of ${userId}. ` +
        `Cookies sent: ${headers.get('cookie') ?? '(none)'}. ` +
        `Sign-in body: ${body.text || '(empty)'}`,
    )
  }
  return headers
}

/**
 * Assert that an authorization guard refused.
 *
 * Passes when the call rejects with a message matching `pattern`, or resolves to
 * `{ ok: false, error }` whose error matches it — the two shapes this codebase
 * uses for a refusal. Anything else throws an Error describing exactly what was
 * received, because "expected a rejection" is not enough to debug from.
 */
export async function expectRejects(fn: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  // A `g` pattern carries `lastIndex` between calls and would make the same
  // assertion pass and fail alternately; the flags are stripped so it cannot.
  const match = (text: string): boolean =>
    new RegExp(pattern.source, pattern.flags.replaceAll('g', '')).test(text)

  let resolved: unknown
  try {
    resolved = await fn()
  } catch (error) {
    const message = errorText(error)
    if (match(message)) return
    throw new Error(
      `expectRejects: the call threw, but the error did not match ${pattern}.\n` +
        `  pattern       : ${pattern}\n` +
        `  error message : ${message}\n` +
        `  error value   : ${describeValue(error)}\n` +
        `  thrown as     : ${error instanceof Error ? error.name : typeof error}`,
      { cause: error },
    )
  }

  const value = resolved as { ok?: unknown; error?: unknown } | null
  if (value !== null && typeof value === 'object' && value.ok === false) {
    const reported = value.error
    let text: string | undefined
    if (typeof reported === 'string') text = reported
    else if (reported instanceof Error) text = reported.message

    if (text !== undefined && match(text)) return
    const complaint =
      text === undefined
        ? 'is not a string or an Error, so no pattern can ever match it'
        : 'did not match the pattern'
    throw new Error(
      `expectRejects: the call refused with { ok: false }, but its \`error\` ${complaint}.\n` +
        `  pattern     : ${pattern}\n` +
        `  error field : ${describeValue(reported)}\n` +
        `  error text  : ${text ?? '(none)'}\n` +
        `  whole value : ${describeValue(resolved)}`,
    )
  }

  throw new Error(
    'expectRejects: the call was ALLOWED — it neither rejected nor returned ' +
      `{ ok: false, error } — so no authorization check fired.\n` +
      `  pattern  : ${pattern}\n` +
      `  resolved : ${describeValue(resolved)}`,
  )
}
