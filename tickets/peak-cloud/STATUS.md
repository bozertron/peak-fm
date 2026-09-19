# peak-cloud — Status Board

**Updated:** 2026-09-19. Waves 0 and 1a have landed (below); the pressure-test
notes and wave plan underneath are retained as the record of how the order was derived.

## Wave 1a — landed and verified, 2026-09-19

| Ticket | State | Evidence |
|---|---|---|
| **PEAK-230** Payment provider seam | **DONE — verified** | `lib/commerce/{provider,state,index}.ts`. `PaymentProvider` matches `docs/PEAK-COMMERCE.md` §2 member-for-member; `ProviderEvent` (which the spec referenced but never defined) is now defined with a stable event id, the `providerRef` join and `ORDER_STATUSES` imported from the schema. `createPayment` is idempotent on `orderId` — the double-submit test asserts one charge **and** an identical `providerRef`; an unsigned webhook rejects and records the reason. The resolver **throws** naming D4/PEAK-231 rather than returning a stand-in |
| **PEAK-209** Media storage | **PARTLY DONE** — interface half complete, **backend still blocked by D3** | `lib/storage/{types,validate,exif,local,orphans,index}.ts`. Validation runs **before** URL issuance: `createMediaUploadUrl` calls `assertUploadAllowed`, and `tests/storage/index.test.ts:457` asserts the store was never asked — with a positive control at :478 so the negative assertion is not vacuous. EXIF GPS stripping is real byte-level APP1/IFN work with sources cited. The local-disk store is a test-only seam; the resolver throws naming D3 rather than falling back to it |
| **PEAK-240** Beta invite redemption | **DONE — verified** (the PARTLY DONE was correct at the time and is now earned back) | Server-side enforcement is **verified**: a blind adversarial critic drove **13 attack classes** through the real `auth.handler()` — every attempt refused, **zero user rows created** — and the final-use race is proven by a 4-client concurrency test whose barrier is now **deterministic by construction** (a gate connection holds the invite row lock before anything is dispatched, and the test reads the queue out of `pg_locks`). The tests behind this sentence were withdrawn once for lacking an artifact; they now have one: `tests/invites/sign-up-form.test.ts` supplies bar row 240.A7, and the orchestrator kill-mutated both directions (field unconditional → the flag-OFF and sign-in cases fail; field never rendered → the flag-ON case fails). **One coverage hole is named here rather than swept:** the *wire transport* at `components/auth-form.tsx:71` is implemented and the header NAME is proven aligned with the server, but **no test observes that the form actually attaches it** — `grep -rn fetchOptions tests/` is empty, so emptying that option would leave the suite green. Closing it is the first item of the deferred Wave 1b. |

Wave record: `~/.pi/agent/projects-memory/peak-fm/waves/W-PEAK-01a.md` · bar: `build/WAVE1a-BAR.md` ·
fix rounds: `build/WAVE1a-FIX-{1,2}-REPORT.md`

**Gates at close (re-run by the orchestrator, not reported):** `pnpm db:check` 38/38 · `typecheck` clean · `lint` exit 0 (90 files) ·
`pnpm test` 16 files / **161 tests** exit 0 · `build` clean (14 routes) · `check:links` no unowned dead links · 0 scratch schemas survive ·
no registrar-owned file touched.

**Three items Wave 1a hands to a closure pass, named rather than implied:**

1. **A killed test process leaks its scratch schema.** Three orphans survived this wave
   (`peak_test_1888021`, `_1892144`, `_1956625`) because teardown only runs on a clean exit, and the per-process name means a
   re-run never reuses them. They were dropped by hand (0 remain), but the *mechanism* needs a stale-schema sweep keyed on a
   timestamped name — otherwise every future wave accumulates them.
2. **A latent silent-failure hazard at the auth boundary.** Better Auth's sign-up route returns HTTP **200 with a synthetic
   success shape** for a 403 when `requireEmailVerification` is set or `autoSignIn` is false — and the invite refusal *is* a 403.
   Today both knobs are safe so the branch is dead and every refusal is clean, but flipping either would make a refused sign-up
   look successful to the client with no error anywhere. Needs an assertion on the **client-visible** status.
3. **Scoped test runs need the env file.** `pnpm exec vitest run <file>` fails loudly (`BETTER_AUTH_SECRET is not set`) because
   only the `pnpm test` script loads `.env.local`. Correct scoped form: `pnpm test <path>`. Wave prompts must use that form.

## Wave 0 — landed and verified, 2026-09-19

| Ticket | State | Evidence |
|---|---|---|
| **PEAK-206** Test harness | **DONE — verified** | `pnpm test` exit 0: 5 files / 19 tests. The harness creates a per-process scratch schema (`peak_test_<pid>`), migrates it with the **real** `scripts/db-migrate.mjs` (38/38 verified in-schema), and drops it: 0 scratch schemas survive and `public` stays at 53 tables. An orchestrator kill-mutation confirmed the FK re-point is load-bearing |
| **PEAK-207** Lint and format | **DONE — verified** | `pnpm lint` exit 0 on the tree with **no mass reformat**. All nine diagnostics measured at wave start are resolved in real code — no suppressions, no disabled rules. `tests/gates/lint-gate.test.ts` is the durable negative control proving the gate can fail |
| **PEAK-208** CI | **PARTLY DONE** | `.github/workflows/ci.yml` — 16 steps covering all seven gates, concurrency group, no `continue-on-error`. YAML-validated locally; **never executed** (needs a push), and its smoke step is blocked on the `<Analytics/>` question below |

Bar: `build/WAVE0-BAR.md` · fix round report: `build/WAVE0-FIX-1-REPORT.md` ·
wave record: `~/.pi/agent/projects-memory/peak-fm/waves/W-PEAK-00.md`

**D1 is closed (2026-09-19).** The canonical PROHIBITED block is the 11-rule
block; `tickets/doctrine/PROHIBITED.txt` now carries it, and rule 11 is
`NO GREP-ABSENCE = INTENT-ABSENCE`.

**Two open items Wave 0 leaves behind, named rather than implied:**

1. **The smoke gate cannot be green until one of two calls is made.** In production
   `app/layout.tsx` renders `<Analytics/>`; `_vercel/insights/*` 404s off Vercel, and
   `scripts/smoke-test.mjs` exits 1 on *any* console error — while its own header documents
   that 404 as expected. Either guard or remove `<Analytics/>` (registrar-owned, and
   D3-shaped), or make the smoke rule tolerate that one documented URL. **Not a builder's call.**
2. **CI has never run.** The workflow needs a push before its three negative controls
   (a type error, a dropped table, a dead link) can be demonstrated as PEAK-208's
   acceptance requires.

## Done and verified

| Ticket | Area | Evidence |
|---|---|---|
| PEAK-200 | Domain schema | 38/38 tables verified |
| PEAK-201 | Migration runner + verification | fresh + repeat run, both clean |
| PEAK-202 | Eight-surface app shell | 12 routes 200, smoke test passing |
| PEAK-203 | Admin dashboard | member 307 / admin 200, flag toggle + audit verified |
| PEAK-204 | Auth: roles and trusted origins | two live defects reproduced and fixed |
| PEAK-205 | Dead-link guard + 404 *(guard part)* | 8 resolve, 19 gaps each owned by a ticket |

## What the pressure test found

Running the backlog against a parallel wave surfaced five problems that would
have cost far more to fix mid-flight than to fix now.

1. **Every primary call-to-action 404'd.** Eighteen links to routes no ticket
   had built. `typecheck`, `build` and `db:check` all passed — none of them can
   see a dead link. → **PEAK-205**, guard shipped.
2. **No test framework.** Nineteen tickets demanded tests against an empty
   harness. → **PEAK-206**.
3. **No linter, no formatter, no CI.** → **PEAK-207**, **PEAK-208**.
4. **`app/globals.css` was contended by 16 tickets** — the single worst
   serialization point in the plan. → **Fixed:** decomposed into per-surface
   stylesheets that each ticket owns.
5. **Four tickets each said "reuse the presentation builder"** and five needed
   to render into the thread view. → **PEAK-222** builds the composer once;
   **PEAK-300** ships a message-renderer registry so each kind is one new file
   plus one registrar line.

Two tickets were missing entirely and now exist: **PEAK-209** (media storage,
which PEAK-220 assumed) and **PEAK-213** (the listing detail page every card
links to).

## Open, in dependency order

### Wave 0 — foundation. **Landed 2026-09-19** — see the top of this file. The reasoning below is kept as the record of why these three came first.

| Ticket | Why it gates the wave |
|---|---|
| **PEAK-206** Test harness | Nineteen tickets demand tests. There is no runner |
| **PEAK-207** Lint and format | Twenty agents, twenty styles, unreviewable diffs |
| **PEAK-208** CI | Not blocked by D3. Without it, humans are the regression suite |

These three are small, independent, and touch nothing the surface tickets
touch. Run them in parallel, first.

### Wave 1 — extension points. Wave 1a (209, 230, 240) **landed 2026-09-19** — see the top of this file. PEAK-222 and PEAK-300 remain, and are the two that matter most.

| Ticket | Unblocks |
|---|---|
| **PEAK-209** Media storage | PEAK-222 *(interface not blocked by D3; backend is)* |
| **PEAK-222** Shared composer | PEAK-220, 221, 260, 270 |
| **PEAK-300** Threads + renderer registry | PEAK-211, 232, 270, 290 |
| **PEAK-230** Provider seam | PEAK-231, 232, 262 |
| **PEAK-240** Invite redemption | Needed before the first external tester |

**PEAK-222 and PEAK-300 are the two that matter most.** Both exist to be built
once by one agent so that four or five others can consume them without
colliding. Building them late, or in parallel with their consumers, re-creates
the exact problem they were created to solve.

### Wave 2 — surfaces. Parallel-safe once Wave 1 has landed.

| Ticket | Area | Blocked by |
|---|---|---|
| PEAK-220 Sell | Sell | 222, 209 |
| PEAK-213 Listing detail | Buy | 220 |
| PEAK-210 Buy browse and filters | Buy | 220 for real supply |
| PEAK-261 Explore ROI | Rent | — *(the most distinctive thing in the product)* |
| PEAK-260 Build Rental | Rent | 222 |
| PEAK-270 Trade + Bid as Sale | Trade | 222, 300 |
| PEAK-280a Find mechanism | Find | — |
| PEAK-291 Community board | Plans | — |
| PEAK-242 Beta feedback widget | Admin | — *(cheap, high value)* |
| PEAK-221 Widget Creator | Sell | 222; **D6** for the LLM path only |
| PEAK-231 Stripe Connect | Commerce | 230; **D4** |

### Wave 3

PEAK-211, PEAK-232, PEAK-212, PEAK-262, PEAK-281, PEAK-290, PEAK-310,
PEAK-241, PEAK-250, and the two **registrar placement passes** — PEAK-280b
(Find button into five surfaces) and PEAK-243 (report control into six).

Both placement passes are one commit each, by one agent, after the surfaces
they touch are stable. Never distribute them.

## File ownership — corrected by the pressure test

| Owner | Files |
|---|---|
| **Registrar only** | `app/globals.css` *(tokens + shared primitives)*, `lib/db/schema/index.ts`, `lib/surfaces.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`, `app/layout.tsx`, `package.json`, `drizzle.config.ts`, `components/thread/registry.ts`, `components/composer/**` *(after PEAK-222)* |
| One ticket each | `app/(app)/<surface>/**` including its own `<surface>.css`, one `lib/queries/<area>.ts`, one `lib/db/schema/<area>.ts`, one `components/thread/kinds/<kind>.tsx` |

**Styling rule:** surface-specific CSS goes in that surface's own stylesheet,
which the surface's agent owns. `app/globals.css` is for shared primitives and
is frozen during a wave unless the registrar opens it. This is what took
globals.css from 16 contenders down to approximately zero.

## Blocked on a decision, not on work

| Decision | Blocks |
|---|---|
| ~~**D1** PROHIBITED rule count~~ | **CLOSED 2026-09-19** — the canonical block is the 11-rule block |
| **D3** Hosting target | PEAK-250, and the storage backend in PEAK-209 |
| **D4** Payment account model | PEAK-231 |
| **D5** BC tax scope | the tax fields of PEAK-212 |
| **D6** LLM provider | the LLM path of PEAK-221 only |

**D2 (Tailwind/shadcn) closed 2026-09-19 as *remove*.** Styling means writing
CSS. Do not add a shadcn component or a utility class.

See `OPEN-DECISIONS.md`. **Do not guess these in code.**

## Honest gaps in what is already shipped

- **18 call-to-action links still 404.** Each is owned by a ticket and listed
  in `KNOWN_MISSING` in `scripts/check-links.mjs`; `app/not-found.tsx` catches
  them meanwhile. The list may only shrink.
- `beta.invite_only` is seeded **on** and **is enforced** at the real sign-up
  endpoint (PEAK-240, DONE). One named hole remains: the form's wire
  transport at `components/auth-form.tsx:71` is implemented and its header
  name proven aligned with the server, but no test observes the attachment.
  First item of the deferred Wave 1b.
- `feature_flag.rollout` exists as a column; only the boolean is evaluated
  (PEAK-241).
- `beta_feedback` and `moderation_report` are readable and resolvable in admin,
  but **nothing creates rows** (PEAK-242, PEAK-243).
- No listing can be created through the UI yet (PEAK-222 → PEAK-220). Every
  surface therefore renders an honest empty state.
- `@vercel/analytics` 404s off Vercel. Kept deliberately, pending **D3**.
