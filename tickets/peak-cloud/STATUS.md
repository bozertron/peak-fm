# peak-cloud — Status Board

**Updated:** 2026-09-19. Wave 0 has landed (below); the pressure-test notes and
wave plan underneath are retained as the record of how the order was derived.

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

### Wave 1 — extension points. These unblock everything downstream.

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
- `beta.invite_only` is seeded **on** but enforced **nowhere** (PEAK-240).
- `feature_flag.rollout` exists as a column; only the boolean is evaluated
  (PEAK-241).
- `beta_feedback` and `moderation_report` are readable and resolvable in admin,
  but **nothing creates rows** (PEAK-242, PEAK-243).
- No listing can be created through the UI yet (PEAK-222 → PEAK-220). Every
  surface therefore renders an honest empty state.
- `@vercel/analytics` 404s off Vercel. Kept deliberately, pending **D3**.
