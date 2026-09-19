# Peak — Execution Handoff Prompt

**For:** the agent team taking Peak from working foundation to beta-ready.
**From:** the scaffolding and planning wave, 2026-09-18.
**Repo:** `bozertron/peak-fm` · branch `claude/local-market-cloud-redesign-efn8mq`
**Commit you are starting from:** see `git log` on the branch — the handoff is
whatever is at its head, and the cleanup pass of 2026-09-19 is part of it.
**Open PR:** https://github.com/bozertron/peak-fm/pull/1

Read this document in full before your first tool call. It is the contract.

---

## 0. TL;DR for the orchestrator

- The foundation is **built, running and verified**. You are extending working
  code, not starting a project.
- **Five tickets unblock everything else.** They are named in §5.
- **Six decisions are not yours to make.** They are in
  `tickets/peak-cloud/OPEN-DECISIONS.md`. Reaching one means halting and asking.
- **D1 gates the first governed wave** and is unresolved. Resolve it with the
  user before deploying agents under the AREA-107 protocol.
- Nothing may be declared done without the real command run and its **actual
  output pasted**.

---

## 1. What Peak is now

A **local-market cloud application**. First market: **Big White, BC**, with the
Okanagan behind it. The header calls the focus of the tools and the intent of
the target user:

```
peak   Buy   Sell   Rent   Trade   Find   Plans   Communicate        [Account]
```

Seven verbs and an identity. The `peak` wordmark stays where it is.

The landing page has one job: answer *"why would I download yet another
communications or marketplace app?"* That question is a design constraint, not
a marketing concern. It means a signed-out visitor must see real supply, and it
means **nothing on that page may be invented**.

**Read `docs/PEAK-PRODUCT-SPEC.md` before writing any feature code.** It is
authoritative and it contains the per-surface detail this prompt only
summarises.

---

## 2. The stack, as it actually is

Verified against the running tree. The archived docs describe Prisma, NextAuth
and Stripe Connect — **none of which exist in this repository**. Ignore them.

| Concern | Actual |
|---|---|
| Framework | Next.js **16.3.3**, App Router, Turbopack |
| React | 19.2 |
| Database | PostgreSQL via `pg.Pool` |
| ORM | Drizzle 0.45, `pg-core` |
| Migrations | `drizzle-kit generate` → `drizzle/*.sql` → `scripts/db-migrate.mjs` |
| Auth | Better Auth 1.7, email + password |
| Styling | Hand-written CSS with custom properties in `app/globals.css` |
| Fonts | Self-hosted Commissioner + Libre Baskerville |

### 2.1 Next.js 16 will bite you

`AGENTS.md` requires reading `node_modules/next/dist/docs/` before writing code,
and it is right. The differences that matter:

- **`params` and `searchParams` are Promises.** `const p = await searchParams`.
  Every existing page does this; match it.
- **`fetch` is not cached by default** and blocks render.
- **Route Handlers are not cached by default.**
- **Server Functions are reachable by direct POST**, so authorization goes
  *inside the function*, never only in the page that renders the button. Every
  action in `app/admin/actions.ts` and `app/(app)/account/actions.ts` does this.
  Copy the pattern.
- `pgTable`'s third argument takes an **array**; the object form is deprecated.

### 2.2 There is no Tailwind. Do not add one.

Tailwind was configured but never imported, so it generated zero utility
classes. The whole stack was removed on 2026-09-19 (decision D2, closed).

**Styling means writing CSS in `app/globals.css`**, which is the sequential
registrar's file — see §7.3. A Tailwind class in a diff is a review rejection,
not a preference. Reintroducing a utility framework is a new decision and a
migration ticket.

---

## 3. What is already built and verified

Do not rebuild any of this. Extend it.

### 3.1 Schema — 38 tables
`lib/db/schema/`, one file per bounded area **specifically so parallel agents
can own disjoint files**. `index.ts` is the barrel and belongs to the
**sequential registrar** — builder agents must not edit it.

Product invariants are encoded structurally:

| Invariant | How |
|---|---|
| A Find ends as a Find | `find_request` has **no** conversion column. Do not add one |
| One side's archive is not the other's | archive/mute/delete on `thread_participant`, never `thread` |
| Trade negotiations are readable | `trade_offer.parentOfferId` — counters chain, nothing is overwritten |
| ROI precedes the listing | `roi_model.listingId` null until `exportedAt` |
| Auto-pay needs both signatures | `ownerAcceptedAt` **and** `renterAcceptedAt` before `active` |
| Blocking is auditable | `listing_block` row; offers are never deleted |

### 3.2 Migrations
Three stages: Better Auth planner → generated Drizzle SQL (savepointed, with
duplicate tolerance **only** for the four Better-Auth-owned tables) → a
verification pass asserting every table and column exists.

```
$ pnpm db:migrate
38/38 table(s) verified
Schema is consistent.
```

`pnpm db:check` runs verification alone. **Wire it as a predeploy gate
(PEAK-250).** This is the AREA-109 lesson: a production sign-in 500 whose root
cause was that no deploy step created the tables, and nothing checked.

### 3.3 Application
Nine routes under `app/(app)/`, each a Server Component reading through
`lib/queries/*`. Landing pitch with live counts. Admin dashboard with nine
sections, all live counts, six implemented safety rules.

### 3.4 Two live defects, found and fixed
- **The admin role never existed.** `app/admin/page.tsx` always read
  `session.user.role`; nothing declared or wrote it, so `/admin` redirected
  everybody including real admins.
- **No trusted origin off Vercel.** Production `trustedOrigins` came only from
  Vercel env vars, so any other host 403'd every auth call. Reproduced, fixed.

Both are written up in `tickets/peak-cloud/PEAK-204-auth-fixes.md`.

### 3.5 Verification actually performed
Against real Postgres and a real browser: 38/38 tables; clean `typecheck` and
`build`; 12 member routes 200 and `/admin` 307 signed out; member 307 / admin
200; sign-in; URL-driven category filtering; a Server Action profile write; a
feature-flag toggle removing the closed notice from `/buy` **without a deploy**;
invite code matching `/^[A-Z2-9]{8}$/`; both actions in the audit log.

One console 404 remains: `/_vercel/insights/script.js`, expected off Vercel.
See **D3**.

---

## 4. Honest gaps — do not mistake these for working

Stated so nothing looks more finished than it is:

1. **No listing can be created through the UI** (PEAK-220). Every surface
   therefore shows an honest empty state. That is correct behaviour, not a bug.
2. **`beta.invite_only` is seeded ON but enforced NOWHERE** (PEAK-240). Anyone
   reaching the URL can register today.
3. **`feature_flag.rollout` exists as a column; only the boolean is evaluated**
   (PEAK-241).
4. **`beta_feedback` and `moderation_report` are readable and resolvable in
   admin, but nothing creates rows** (PEAK-242, PEAK-243).

---

## 5. Your work, in order

Full tickets in `tickets/peak-cloud/`. Board: `STATUS.md`.

### Wave 1 — these unblock everything else

| Ticket | Why it is first |
|---|---|
| **PEAK-300** Threads | Blocks 211, 232, 270, 290. Six tickets wait on it |
| **PEAK-220** Presentation builder | Nothing can be bought until something can be sold |
| **PEAK-230** Provider seam | Blocks all commerce. Interface only — no provider yet |
| **PEAK-240** Invite redemption | Needed before the first external tester |
| **PEAK-250** Deploy pipeline | Closes AREA-109 *(blocked by D3)* |

PEAK-300 and PEAK-220 are the two that matter most. Everything else is
downstream of a thread that works and a listing that exists.

### Wave 2 — the surfaces
PEAK-210 (Buy filters — **the differentiator, not the browse**), PEAK-221
(Widget Creator; build the manual path and booking tool first, they are not
blocked), PEAK-231 (Stripe, blocked by D4), PEAK-260/261 (Rent; **261 Explore
ROI is the most distinctive thing in the product**), PEAK-270 (Trade + Bid as
Sale), PEAK-280 (Find capture), PEAK-242 and PEAK-243 (cheap, high value for a
beta).

### Wave 3
PEAK-211, PEAK-232, PEAK-212, PEAK-262, PEAK-281, PEAK-290, PEAK-291,
PEAK-310, PEAK-241.

---

## 6. Decisions that are NOT yours

`tickets/peak-cloud/OPEN-DECISIONS.md`. Per STOP-SAFE: **halt and ask. Do not
pick an answer and proceed.**

| ID | Question | Blocks |
|---|---|---|
| **D1** | PROHIBITED: doctrine says 11 rules, the file has 10 + a closer | **the first governed wave — everything** |
| **D3** | Hosting target | PEAK-250 |
| **D4** | Does Peak hold funds or facilitate? | PEAK-231 |
| **D5** | BC tax: calculate, collect, or record? | tax fields of PEAK-212 |
| **D6** | LLM provider, key ownership, cost ceiling | LLM path of PEAK-221 |

**D1 must be resolved with the user before you deploy agents under the AREA-107
protocol**, because that protocol requires the canonical block pasted verbatim
into every prompt and forbids inventing a replacement. It has been open since
AREA-111 and was carried forward rather than quietly closed.

---

## 7. How you must work

### 7.1 The doctrine binds
`tickets/doctrine/PROHIBITED.txt` — 10 numbered rules plus a `STAY SHORT`
closer. Paste it verbatim into every agent prompt. The ones that bite hardest
here:

- **Rule 1 — no stubs.** An honest empty state is not a stub. A
  `// TODO: implement` is.
- **Rule 2 — no silent failures.** No empty catch, no swallowed error, no
  returning `[]` to mask a problem.
- **Rule 3 — no fakes in production.** The old `app/page.tsx` demo arrays were
  exactly this and are gone. **Do not seed sample listings** to make a screen
  look populated.
- **Rule 6 — no "done" without proof.** Run the real command, paste the real
  output.
- **Rule 9 — an orphan is unwired code, not dead code.** Find its home before
  you touch it. Every orphan that existed at handoff has now been resolved —
  either wired up or deliberately deleted with the reason recorded in
  `tickets/HISTORY.md`. **A new orphan in your diff is yours to explain.**
- **Rule 10 — read fully before integrating.** Files under 1500 lines get read
  entirely.

### 7.2 Orchestration
`tickets/doctrine/AREA-107-agent-orchestration-protocol.md` still governs: one
agent, one file; RESEARCH → EXECUTE → TEST → RETURN → STOP; agents never commit;
the critic is blind and grades the disk; two rounds then halt; the three-argument
`a(label, prompt, opts)` helper only.

**The structural blocker AREA-111 identified is gone.** It found that every UI
ticket touched one 80-line file, so maximum safe concurrency was 1. The tree is
now decomposed specifically to fix that.

### 7.3 File ownership

| Owner | Files |
|---|---|
| **Sequential registrar — never a parallel builder** | `app/globals.css`, `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`, `package.json`, `drizzle.config.ts` |
| Safe for one builder each | one `lib/db/schema/<area>.ts`, one `lib/queries/<area>.ts`, one `app/(app)/<surface>/` |

Two agents must never hold the same file. Schema and query files are split by
area precisely to make this possible.

### 7.4 Definition of done

```bash
pnpm typecheck    # must be clean
pnpm build        # must be clean
pnpm db:check     # must report all tables verified
```

Plus, for the ticket's own behaviour, real evidence: a browser test, a two-
account isolation test, a pasted `EXPLAIN ANALYZE`, a Stripe test-mode webhook
log — whatever the ticket's Verification Evidence section names.

**A ticket with no pasted output is not done.** AREA-109 exists because
something was assumed to work.

---

## 8. Getting running

```bash
./scripts/dev-setup.sh     # deps, postgres, .env.local, schema
pnpm db:seed               # 5 markets, 10 categories, 12 flags
pnpm dev                   # http://localhost:3000
```

Make yourself an admin and open the surfaces:

```sql
UPDATE "user" SET role = 'admin' WHERE email = 'you@example.com';
```

Then `/admin` → Feature flags → toggle what you are working on.

**Use `http://localhost:3000`, not `127.0.0.1`.** They are different origins to
Better Auth, and `BETTER_AUTH_URL` names the first. You will get
`403 INVALID_ORIGIN` otherwise — that is the trusted-origin behaviour working
as intended, not a bug.

---

## 9. The five things most likely to go wrong

1. **Reaching for a dependency that used to be here.** Tailwind, shadcn,
   lucide-react, leaflet and clsx were all removed on 2026-09-19 because
   nothing imported them. If you find a tutorial or an old commit using them,
   that is history, not guidance. Everything current is in `docs/`.
2. **Adding a conversion path from Find to Buy.** The absent column is the
   enforcement. Adding one silently breaks the product's clearest rule.
3. **Seeding sample listings to make a screen look alive.** Rule 3. The empty
   states are deliberate and they are how you know the query layer works.
4. **Putting an authorization check only in the page.** Server Functions take
   direct POSTs. The check goes in the function.
5. **Deciding a D-item because it was blocking.** Halt and ask. Every one of
   them has consequences outside the code — regulatory posture, cost, or a
   product commitment the user has to own.

---

## 10. What to send back

When your work lands, report:

1. **Per ticket:** status, the pasted output of the three gate commands, and the
   ticket-specific evidence.
2. **Decisions you hit** and halted on, with the context needed to answer them.
3. **Anything you found that contradicts these docs.** The docs describe the
   code; where they disagree, the code is right and the doc is a bug — say so.
4. **New gaps**, in the honest style of §4. Something that looks finished but
   is not is worse than something openly unfinished.

Peak's foundation is real and verified. Keep it that way.
