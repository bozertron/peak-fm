import { APIError, betterAuth } from 'better-auth'
import { pool } from '@/lib/db'
import { claimInvite, isInviteRequired, stampInviteRedemption } from '@/lib/invites'
import type { InviteRefusal } from '@/lib/invites'

/**
 * ── PEAK-240 · THE ENFORCEMENT POINT ────────────────────────────────────────
 *
 * `beta.invite_only` was seeded ON and enforced NOWHERE: anyone who reached the
 * sign-up URL could register. This is the enforcement, and it lives here, on the
 * real auth endpoint, because the endpoint (`/api/auth/[...all]` → `auth.handler`)
 * is publicly reachable. A field in the form and a check on the page are
 * presentation: a direct POST never renders either one. `components/auth-form.tsx`
 * hides the field and `app/sign-up/page.tsx` asks the same question, but neither
 * of them is a guard.
 *
 * WHY A `user.create` HOOK PAIR, AND NOT A MIDDLEWARE
 * The rule to enforce is "a user row must not come into existence without a
 * redeemable invite". Better Auth 1.7.5's database hooks are the only seam that
 * sits on BOTH sides of that event (installed-package authority:
 * `@better-auth/core/dist/types/init-options.d.mts:1263` declares `databaseHooks`,
 * lines 1274 and 1280 the `user.create.before` / `user.create.after` signatures;
 * `better-auth/dist/db/with-hooks.mjs` is where `createWithHooks` runs them —
 * line 17 `toRun(actualData, context)` before the INSERT and line 39
 * `toRun(created, context)` after it). A `before` hook that returns `false`
 * (with-hooks.mjs:19) would cancel the INSERT *silently* — the endpoint would go
 * on to throw `FAILED_TO_CREATE_USER` — so a refusal THROWS instead, carrying its
 * reason.
 *
 * THE TWO PHASES, AND WHERE THE INVITE ID LIVES BETWEEN THEM
 * `beta_invite."redeemedById"` is a foreign key to `user.id`, so the redemption
 * cannot be recorded in one statement: there is no user id before the INSERT.
 * `lib/invites.ts` therefore splits it (`claimInvite` consumes a use before the
 * user exists; `stampInviteRedemption` fills in the record and the audit row
 * after), and this hook pair is exactly those two moments.
 *
 * The claim's invite id has to survive from phase 1 to phase 2. It is kept in
 * `pendingInviteDecisions`, a WeakMap keyed on the ENDPOINT CONTEXT OBJECT —
 * because `createWithHooks` reads that object ONCE (with-hooks.mjs:8
 * `const context = tryGetCurrentAuthEndpointContext()`) and closes over the same
 * object for both hooks of one creation (lines 17 and 39). That object is
 * per-request, so two concurrent sign-ups never see each other's claim; a
 * module-level variable or a Map keyed on email would be a race, and a Map
 * keyed on email would also leak. Weak: the entry dies with the request.
 *
 * IF THE HOOK PAIR EVER STOPS BEING HANDED THE SAME OBJECT, THE FAILURE IS LOUD —
 * the `after` hook finds no recorded decision and throws `INVITE_DECISION_MISSING`
 * rather than skipping the stamp, because an un-stamped redemption is a silently
 * broken feature (rule 2).
 *
 * WHAT IS UNCHANGED WHEN THE FLAG IS OFF
 * `isInviteRequired()` is `isEnabled('beta.invite_only')`, and an unknown key is
 * OFF. With no flag row there is no header read, no claim, no stamp — sign-up,
 * sign-in and sessions behave exactly as before, which is why the existing suite
 * (whose scratch schema has no `feature_flag` rows) still passes untouched.
 */

/**
 * The wire name the beta code arrives on — a HEADER, not a body field, because
 * the code is a gate rather than user data and a body field would have to be
 * declared on the user schema (a column and a migration) to survive sign-up.
 *
 * `components/auth-form.tsx` sends this exact name through Better Auth's client
 * `fetchOptions`. It is duplicated there and deliberately not exported from this
 * module: that component is a `'use client'` file, and importing from here would
 * pull the `pg` pool into the browser bundle. `tests/invites/enforcement.test.ts`
 * reads the client file and asserts the two names are still the same string, so
 * the duplication cannot drift unnoticed.
 */
const INVITE_CODE_HEADER = 'x-peak-invite-code'

/**
 * The refusal message per reason. Typed as a `Record<InviteRefusal, string>` so a
 * new reason in `lib/invites.ts` is a compile error here rather than a refusal
 * that reaches the client with no explanation.
 */
const INVITE_REFUSAL_MESSAGES: Record<InviteRefusal, string> = {
  missing: 'A beta invite code is required to create an account while Peak is in closed beta.',
  revoked: 'That beta invite code has been revoked.',
  expired: 'That beta invite code has expired.',
  exhausted: 'That beta invite code has already been used the maximum number of times.',
  'email-mismatch': 'That beta invite code was issued to a different email address.',
}

/**
 * A refusal the client can act on: 403, a stable `code`, and the machine-readable
 * `reason` from `lib/invites.ts`'s closed vocabulary, so a caller can say WHICH
 * rule bit without parsing prose.
 *
 * Thrown, not returned as `false`. `createWithHooks` treats a `false` return as
 * "skip the INSERT" and says nothing about why (with-hooks.mjs:19), and
 * `signUpEmail` then reports a generic `FAILED_TO_CREATE_USER`. A thrown
 * `APIError` is recognised by the sign-up route's own catch
 * (`better-auth/dist/api/routes/sign-up.mjs:233`, `if (isAPIError(e)) throw e`)
 * and reaches the client with its message, code and reason intact.
 */
function inviteRefusal(reason: InviteRefusal): APIError {
  return new APIError('FORBIDDEN', {
    message: INVITE_REFUSAL_MESSAGES[reason],
    code: 'INVITE_REFUSED',
    reason,
  })
}

/** What the `before` hook decided, waiting for that same creation's `after` hook. */
type InviteDecision =
  | { kind: 'open'; email: string }
  | { kind: 'claimed'; inviteId: string; email: string }

/**
 * Pending decisions, keyed on the endpoint context object. A queue rather than a
 * single slot: if one request ever created two users, both decisions are held and
 * consumed in creation order, instead of the second silently reusing the first's
 * claim. See the block comment above `databaseHooks` for why the key is stable.
 */
const pendingInviteDecisions = new WeakMap<object, InviteDecision[]>()

/** Record what the `before` hook decided for one user creation. */
function rememberInviteDecision(context: object, decision: InviteDecision): void {
  const queue = pendingInviteDecisions.get(context)
  if (queue === undefined) pendingInviteDecisions.set(context, [decision])
  else queue.push(decision)
}

/**
 * Take the oldest decision recorded for this request, and drop the entry once it
 * is empty. Returns `undefined` when the `before` hook recorded nothing for this
 * context — which is an inconsistency the caller must report, never skip.
 */
function takeInviteDecision(context: object): InviteDecision | undefined {
  const queue = pendingInviteDecisions.get(context)
  if (queue === undefined) return undefined
  const decision = queue.shift()
  if (queue.length === 0) pendingInviteDecisions.delete(context)
  return decision
}

/**
 * The request headers of the endpoint context, or `null` when there are none.
 *
 * `context.headers` is the request's own `Headers` (the dispatcher copies them:
 * `better-auth/dist/api/dispatch.mjs:195`), and `context.request.headers` is the
 * original request — read in that order, because the copy is what the endpoint
 * was handed.
 */
function requestHeadersOf(context: {
  headers?: Headers
  request?: { headers?: Headers }
}): Headers | null {
  return context.headers ?? context.request?.headers ?? null
}

/**
 * The beta code on this request, trimmed, or `null` when no usable one arrived.
 * A blank header counts as absent: an empty string is not a code, and passing it
 * on would report 'missing' from a slightly later place with no more information.
 * The code is never logged, never echoed and never persisted in plain text.
 */
function inviteCodeOf(context: {
  headers?: Headers
  request?: { headers?: Headers }
}): string | null {
  const headers = requestHeadersOf(context)
  if (headers === null) return null
  const raw = headers.get(INVITE_CODE_HEADER)
  if (raw === null) return null
  const code = raw.trim()
  return code === '' ? null : code
}

/**
 * The email a claim is checked against, as a string. `user.email` is required by
 * the schema and the endpoint validates it before this point, so a non-string
 * here means the hook contract changed; refusing to invent one surfaces that
 * instead of silently skipping the email pin on a pinned invite.
 */
function emailOf(user: { email?: unknown }): string {
  if (typeof user.email !== 'string') {
    throw new Error(
      'lib/auth.ts invite enforcement: the user-creation hook was handed a user with no ' +
        `string email (got ${typeof user.email}), so an email-pinned invite cannot be ` +
        'checked and the redemption cannot be recorded against an address.',
    )
  }
  return user.email
}

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
  emailAndPassword: { enabled: true, autoSignIn: true },

  /**
   * Columns Peak adds to Better Auth's `user` table.
   *
   * `app/admin/page.tsx` has always read `session.user.role`, but nothing ever
   * declared or wrote that column, so the admin route redirected everyone —
   * including real admins. Registering the fields here is what creates them in
   * the migration AND surfaces them on the session object.
   *
   * `input: false` means a field cannot be set by the client during sign-up.
   * Nobody self-assigns `role: 'admin'` through the registration form.
   */
  user: {
    additionalFields: {
      role: { type: 'string', required: false, defaultValue: 'member', input: false },
      avatarKind: { type: 'string', required: false, defaultValue: 'initials', input: true },
      avatarSeed: { type: 'string', required: false, input: true },
      marketId: { type: 'string', required: false, input: true },
    },
  },

  /**
   * The invite gate, on both sides of the INSERT. Read the block comment above
   * `INVITE_CODE_HEADER` for the whole argument; the two hooks below are its
   * implementation.
   */
  databaseHooks: {
    user: {
      create: {
        /**
         * Phase 1 — BEFORE the user row exists. Decides, and consumes a use of the
         * code, so a refusal leaves no row behind at all.
         */
        before: async (user, context) => {
          const email = emailOf(user)

          // No request to read a header from. That happens when a user is created
          // outside any auth endpoint (the adapter used directly). With the gate
          // open there is nothing to do — and the `after` hook makes the same
          // "no context" decision, so the two cannot disagree.
          if (context === null) {
            if (await isInviteRequired()) {
              throw inviteRefusal('missing')
            }
            return
          }

          // The flag is read through `lib/queries/market.ts`, the repo's single
          // flag reader: an unknown key is OFF. When it is off this hook does no
          // header read, no claim and no stamp — sign-up is exactly what it was.
          if (!(await isInviteRequired())) {
            rememberInviteDecision(context, { kind: 'open', email })
            return
          }

          const code = inviteCodeOf(context)
          if (code === null) {
            throw inviteRefusal('missing')
          }

          // The claim is the write that consumes the use, and it is the same
          // function the non-HTTP paths and the ledger's own tests call — the
          // validation is not re-implemented here. A refusal is a refusal: the
          // reason is handed to the client untouched, and the INSERT never runs.
          const claimed = await claimInvite({ code, email })
          if (!claimed.ok) {
            throw inviteRefusal(claimed.reason)
          }

          rememberInviteDecision(context, {
            kind: 'claimed',
            inviteId: claimed.inviteId,
            email,
          })
        },

        /**
         * Phase 2 — AFTER the user row exists, so there is an id to write.
         * Completes the redemption and appends the `admin_audit_log` row.
         */
        after: async (user, context) => {
          // Mirrors the `before` hook's no-request branch: with no endpoint
          // context the `before` hook could not have claimed anything (the gate
          // open, or it threw), so there is nothing to complete.
          if (context === null) return

          const decision = takeInviteDecision(context)
          if (decision === undefined) {
            throw new APIError('INTERNAL_SERVER_ERROR', {
              message:
                'A user row was created with no recorded invite decision for this request, so ' +
                'the redemption cannot be completed. The user-creation hook pair is no longer ' +
                'sharing one endpoint context — refusing to leave a redemption unaccounted for.',
              code: 'INVITE_DECISION_MISSING',
            })
          }

          // The decision belongs to the creation AT THE FRONT of the queue. If the
          // addresses disagree, this decision is not this user's (a rolled-back
          // transaction left one behind) and stamping it would attribute one
          // person's redemption to another. Refuse loudly.
          if (decision.email.toLowerCase() !== emailOf(user).toLowerCase()) {
            throw new APIError('INTERNAL_SERVER_ERROR', {
              message:
                'The invite decision at the front of this request\u2019s queue belongs to a ' +
                'different email address than the user that was just created, so it cannot be ' +
                'stamped against this user. Refusing to attribute one redemption to two accounts.',
              code: 'INVITE_DECISION_MISMATCH',
            })
          }

          if (decision.kind === 'open') return

          // The flag is deliberately NOT re-read here. The use is already consumed;
          // if the flag flipped off between the two hooks, skipping the stamp would
          // leave a redemption the ledger cannot explain. The claim decides.
          try {
            await stampInviteRedemption({
              inviteId: decision.inviteId,
              userId: user.id,
              actorEmail: emailOf(user),
            })
          } catch (error) {
            // Not swallowed. The user row exists and the use is consumed, so the
            // redemption is incomplete — the one outcome that must never pass
            // quietly. The original error is kept as the `cause`, and the refusal
            // is an APIError so the sign-up route rethrows it
            // (sign-up.mjs:233) instead of folding it into FAILED_TO_CREATE_USER.
            throw new APIError('INTERNAL_SERVER_ERROR', {
              message:
                `The user ${user.id} was created and its beta invite use was consumed, but ` +
                'the redemption record could not be written. The account exists and the ' +
                'redemption is incomplete.',
              code: 'INVITE_REDEMPTION_NOT_RECORDED',
              cause: error,
            })
          }
        },
      },
    },
  },

  trustedOrigins: [
    /**
     * The configured public origin is always trusted.
     *
     * Without this, a deployment that is not on Vercel — a container host, a
     * custom domain, a preview URL — has NO trusted origin in production and
     * every auth call fails with INVALID_ORIGIN. Reproduced directly: signing
     * in against an origin absent from this list returns 403.
     */
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
    ...(process.env.NODE_ENV === 'development'
      ? [
          'http://localhost:3000',
          ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
          ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
          ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
          ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : []),
        ]
      : []),
    ...(process.env.NODE_ENV === 'production'
      ? [
          ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
          ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
            : []),
        ]
      : []),
  ],
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  ...(process.env.NODE_ENV === 'development'
    ? {
        advanced: {
          defaultCookieAttributes: { sameSite: 'none' as const, secure: true },
        },
      }
    : {}),
})
