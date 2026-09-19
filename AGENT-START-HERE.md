# Peak — Agent Start Here

**Paste this at the top of every agent session working on this repository.**
It is written for an agent starting cold, with no prior context.

---

## 1. What you are working on

Peak is a **local-market cloud application** for Big White, BC and the
surrounding Okanagan. It is a Next.js 16 web app, server-rendered, backed by
Postgres. The header is the product:

```
peak   Buy   Sell   Rent   Trade   Find   Plans   Communicate        [Account]
```

Seven verbs and an identity. Each verb is one intent, which is why Find sits
beside Buy rather than inside it.

**The foundation is already built, running and verified.** You are extending
working code, not starting a project. Do not rebuild what is there.

## 2. Read these, in this order, before writing anything

| # | File | Why |
|---|---|---|
| 1 | `tickets/doctrine/PROHIBITED.txt` | Binding rules. Violation = task failure |
| 2 | `docs/PEAK-PRODUCT-SPEC.md` | What the product actually is |
| 3 | `tickets/peak-cloud/INDEX.md` | Find your ticket and its blockers |
| 4 | `tickets/peak-cloud/OPEN-DECISIONS.md` | What you must **not** decide |
| 5 | **your ticket** | Your scope, your files, your done |

`AGENTS.md` also requires reading the relevant guide in
`node_modules/next/dist/docs/` before writing Next.js code. This version has
breaking changes; see §5.

## 3. Your ticket is a contract

Every ticket opens with a table. Two rows bind you absolutely:

- **Files you own** — the only files you may create or modify.
- **Blocked by decision** — if this names a D-item, **stop and ask**. Do not
  pick an answer and proceed.

### Files you may never touch

These belong to the sequential registrar. If your work seems to need one, that
is a signal to stop and report, not to edit it:

```
app/globals.css              lib/surfaces.ts
lib/db/schema/index.ts       components/peak-header.tsx
app/(app)/layout.tsx         app/layout.tsx
package.json                 drizzle.config.ts
components/composer/**            (after PEAK-222 lands)
components/thread/registry.ts     (after PEAK-300 lands)
```

**Surface-specific CSS goes in your surface's own stylesheet**, next to its
page — `app/(app)/buy/buy.css` and so on. Create it if it does not exist.
Never add surface styles to `globals.css`, and never inline styles to dodge
the question. `globals.css` was contended by 16 tickets before it was split;
do not undo that.

## 4. Getting it running

```bash
./scripts/dev-setup.sh     # deps, postgres, .env.local, schema
pnpm db:seed               # markets, categories, feature flags
pnpm dev                   # http://localhost:3000
```

### Get an account — in this order, or the step below fails

**A fresh sign-up needs a beta invite code** (PEAK-240, landed 2026-09-19).
`pnpm db:seed` turns `beta.invite_only` **on**, and it is enforced at the real
sign-up endpoint — so `POST /api/auth/sign-up/email` without an
`x-peak-invite-code` header is refused with `403 INVITE_REFUSED`. You have two
honest ways in, and you need exactly one of them:

- mint a code in `/admin` (Invites), or insert one directly, and enter it in the
  beta-code field on `/sign-up`; or
- switch `beta.invite_only` **off** in `/admin` → Feature flags, which takes
  effect with no deploy (that is the flag system working as designed, not a
  workaround).

**Only once a user row exists** can you promote it to admin:

```sql
UPDATE "user" SET role = 'admin' WHERE email = 'you@example.com';
```

Note the order. `/admin` is what mints invites and toggles flags, so on a truly
empty database the flag route or a direct insert is the way in — you cannot
open `/admin` to let yourself sign up.

This is also why CI's smoke step needs an invite: `pnpm db:seed` runs there too,
and its setup signs up `tester@peak.local` through the same endpoint. The
workflow fix is parked in `build/WAVE-CLOSEOUT.md` §4 — seed an invite in the job
and send the header, so enforcement stays on.

### The test database is not your database

The suite creates a **per-process scratch schema** (`peak_test_<pid>`), migrates
it with the real runner, and drops it. Your working database is never the
target — and `resetTestDatabase()` now verifies by name that it is truncating
the scratch schema, because the pool resolves `search_path = <scratch>, public`
and a missing scratch schema falls through to `public`. See §8.8; this one has
destroyed a working database for real.

See §6 for how to run one file versus the whole suite.

**Use `http://localhost:3000`, never `127.0.0.1`.** They are different origins
to Better Auth and `BETTER_AUTH_URL` names the first. You will get
`403 INVALID_ORIGIN` otherwise — that is the trusted-origin check working, not
a bug.

## 5. The stack, and what will bite you

Next.js **16.3.3**, React 19, Drizzle + Postgres, Better Auth, hand-written CSS.

- **`params` and `searchParams` are Promises.** `const p = await searchParams`.
- **`fetch` is not cached by default** and blocks render.
- **Route Handlers are not cached by default.**
- **Server Functions are reachable by direct POST.** Authorization goes *inside
  the function*, never only in the page that renders the button. Copy the
  pattern in `app/admin/actions.ts`.
- **`pgTable`'s third argument takes an array.** The object form is deprecated.
- **There is no Tailwind.** It was removed deliberately. A utility class in a
  diff is a rejection. Styling means writing CSS.
- Money is **integer cents** beside a currency column. Never a float.

## 6. Definition of done

Every one of these, with **actual output pasted**. Rule 6 does not accept an
assertion:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm db:check     # all tables verified
pnpm check:links  # no unowned dead links
```

While you are working, run **one file at a time** with `pnpm test <path>` — for
example `pnpm test tests/storage/exif.test.ts` — and leave the full `pnpm test`
for the end. Only the `pnpm test` script loads `.env.local`, so a bare
`pnpm exec vitest run <path>` stops with `BETTER_AUTH_SECRET is not set` and
`Refusing to invent a secret.` That is the harness refusing to invent a secret,
not a broken test.

Plus your ticket's own **Verification evidence** section, which names the
specific proof it wants.

**If your ticket creates a route, delete its line from `KNOWN_MISSING` in
`scripts/check-links.mjs` in the same commit.** If you add a link to a route
that does not exist yet, add the line with your ticket number. That list may
only shrink.

**You do not commit.** Per `tickets/doctrine/AREA-107-agent-orchestration-protocol.md`,
agents report; the orchestrator verifies the disk and commits.

## 7. When to stop and ask

Stop — do not guess — when any of these is true:

- your ticket's **Blocked by decision** row names a D-item you have reached
- the work needs a **registrar file**
- two tickets appear to claim the **same file** (that is a backlog bug, report it)
- the ticket contradicts `docs/PEAK-PRODUCT-SPEC.md`
- you find an apparently orphaned symbol, reserved asset, or unrendered
  computed field (rules 9 **and 11** — it is a specification until the
  design owner says otherwise, and the ruling is theirs, not yours)

Ambiguity is reported, never resolved silently. That is STOP-SAFE, and it is
cheaper than the alternative every single time.

## 8. The eight things that have actually gone wrong here

Learn these rather than rediscovering them:

1. **Linking to a route you have not built.** Eighteen dead call-to-action
   links shipped at once, and `typecheck`, `build` and `db:check` all passed.
   Run `pnpm check:links`.
2. **A schema nothing created.** A production sign-in 500 whose root cause was
   that no deploy step ever created the tables, and nothing checked. That is
   why `pnpm db:check` exists and why it is a gate.
3. **Authorization only in the page.** Server Functions take direct POSTs.
4. **Seeding fake data to make a screen look alive.** Rule 3. The empty states
   are deliberate — they are how you know the query layer works.
5. **Adding a conversion path from Find to Buy.** `find_request` has no
   conversion column *on purpose*. A Find ends as a Find. Do not add one.
6. **Deciding a D-item because it was blocking.** Every one has consequences
   outside the code.
7. **Reaching for a dependency that used to be here.** Tailwind, shadcn,
   lucide-react, leaflet and clsx are gone. An old commit or a tutorial using
   them is history, not guidance.

   Read that removal alongside **rule 11**, which arrived afterwards and is the
   stricter standard: *absence of a consumer is not absence of intent.* Those
   packages were not deleted on grep evidence alone — each category was put to
   the design owner and removed on their ruling, which is exactly what rule 11
   requires. **You do not have that ruling.** So when you find an unreferenced
   symbol, a reserved asset, or a computed-but-unrendered field, treat it as a
   specification you have not yet understood, and ask. Do not tidy it away.

8. **Truncating the developer's database from a test.** The test pool resolves
   `search_path = <scratch>, public`, and `current_schema()` falls through to
   the first schema that *exists*. When the scratch schema is missing — a
   crashed teardown, or a file run outside `pnpm test` — that is `public`. The
   old length check could not catch it, because `public` is full: it reported
   38 application tables and truncated all of them.

   This is not hypothetical. Removing the guard for one kill-mutation run
   emptied a working database — `markets 0, categories 0, flags 0, users 0` —
   in a single command. `resetTestDatabase()` now verifies the schema by name
   before it truncates anything, and `tests/setup/reset-guard.test.ts` fails if
   that verification is removed.

## 9. What to report back

1. Your ticket, its status, and the pasted output of the gate commands.
2. Your ticket's specific verification evidence.
3. Any decision you hit and stopped on, with enough context to answer it.
4. Anything that contradicts the docs. **The code is the truth**; where a doc
   disagrees, say so — that is a finding, not a nuisance.
5. Any new gap you created or discovered, stated plainly. Something that looks
   finished but is not is worse than something openly unfinished.

---

## Note for the orchestrator: the PROHIBITED block

`tickets/doctrine/AREA-107-agent-orchestration-protocol.md` requires the
canonical PROHIBITED block pasted **verbatim** into every agent prompt, and
forbids paraphrasing or inventing a replacement.

The doctrine calls it an **11-rule** block. That discrepancy was open as
**D1** from AREA-111 until **2026-09-19**, when the design owner ruled: the
canonical governed block is the **11-rule** block, and rule 11 is
`NO GREP-ABSENCE = INTENT-ABSENCE`. `tickets/doctrine/PROHIBITED.txt` now
carries all eleven rules and is the paste source.

Paste the file **verbatim** into every agent prompt. Never paraphrase it.
