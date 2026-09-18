# Peak — Architecture

**Status:** Authoritative. **Last updated:** 2026-09-18

## 1. The stack, as it actually is

Verified against the running tree, not from memory. The archived docs described
Prisma, NextAuth and Stripe Connect — **none of which are in this repository**.

| Concern | Actual |
|---|---|
| Framework | **Next.js 16.3.3**, App Router, Turbopack |
| React | 19.2 |
| Database | **PostgreSQL** via `pg.Pool` |
| ORM | **Drizzle 0.45**, `pg-core` |
| Migrations | `drizzle-kit generate` → `drizzle/*.sql`, applied by `scripts/db-migrate.mjs` |
| Auth | **Better Auth 1.7**, email + password, Postgres-backed |
| Styling | Hand-written CSS in `app/globals.css` with CSS custom properties |
| Fonts | Self-hosted Commissioner (variable) + Libre Baskerville for the wordmark |
| Map | Leaflet + OSM raster tiles (`components/okanagan-map.tsx`) |

### 1.1 Next.js 16 specifics that bite

Read `node_modules/next/dist/docs/` before writing code. In particular:

- **`params` and `searchParams` are Promises.** `const p = await searchParams`.
- **`fetch` is not cached by default** and blocks render. Use `use cache` or
  wrap in `<Suspense>`.
- **Route Handlers are not cached by default.**
- **Server Functions are reachable by direct POST**, so authorization belongs
  inside the function, never only in the page that renders the button.

### 1.2 Tailwind is configured but not active — OPEN DECISION

`postcss.config.mjs` loads `@tailwindcss/postcss`, and `components.json`
describes a shadcn setup. But **`app/globals.css` never imports Tailwind**, so
**no utility classes are generated at all**.

Consequence: `components/ui/button.tsx` is written entirely in Tailwind classes
and would render unstyled even if it were imported. It is currently imported
nowhere.

Per rule 9 of `tickets/doctrine/PROHIBITED.txt`, this orphan was not deleted.
Giving it a home requires a project-wide decision, recorded as **D2** in
`tickets/peak-cloud/OPEN-DECISIONS.md`. Everything scaffolded so far uses the
hand-written CSS system, which works.

## 2. Rendering and route map

```
app/
├── layout.tsx                 root: <html>/<body>, fonts, metadata
├── (app)/                     route group — carries the header, no URL segment
│   ├── layout.tsx             session → PeakHeader, market, unread badge
│   ├── page.tsx               /            The Pitch
│   ├── buy/page.tsx           /buy         browse + filters (URL-driven)
│   ├── sell/page.tsx          /sell        seller desk
│   ├── rent/page.tsx          /rent        rentals + 3 creation options
│   ├── trade/page.tsx         /trade       listings + incoming offers
│   ├── find/page.tsx          /find        my finds + market demand board
│   ├── plans/page.tsx         /plans       personal | business | community
│   ├── communicate/page.tsx   /communicate inbox + bulletin
│   └── account/               /account     settings + actions.ts
├── admin/                     /admin       outside the group: own chrome
├── sign-in, sign-up           outside the group: no primary nav
└── api/auth/[...all]/route.ts Better Auth handler
```

Every surface is a **Server Component** that queries Postgres directly through
`lib/queries/*`. Client components exist only where interaction demands it:
`peak-header.tsx`, `account-form.tsx`, `admin-controls.tsx`, `auth-form.tsx`,
`okanagan-map.tsx`.

All routes render dynamically (`ƒ`) because they read the session.

## 3. Data access

`lib/queries/` is one file per area so parallel agents own disjoint files:

| File | Owns |
|---|---|
| `market.ts` | markets, categories, feature flags, `isEnabled()` |
| `listings.ts` | the shared browse query for Buy/Rent/Trade |
| `sell.ts` | seller desk and revenue totals |
| `rent.ts` | ROI models, agreements, auto-pay |
| `trade.ts` | offers and negotiation chains |
| `find.ts` | find requests and the demand board |
| `plans.ts` | plans, proposals, community items |
| `communicate.ts` | threads, unread counts |
| `bulletin.ts` | market bulletin posts |
| `admin.ts` | dashboard counts and admin listings |

`cache()` from React dedupes repeated reads within one render, so a layout and
its page asking for the current market hit Postgres once.

## 4. Auth and authorization

Better Auth owns `user`, `session`, `account`, `verification`. Peak adds four
columns to `user` through `user.additionalFields` in `lib/auth.ts`:

`role` · `avatarKind` · `avatarSeed` · `marketId`

`role` has `input: false` — **nobody self-assigns `admin` through the sign-up
form.** Roles change only through the audited admin action.

### 4.1 A bug this fixed

`app/admin/page.tsx` has always read `session.user.role`. Nothing ever declared
or wrote that column, so **the admin route redirected everybody, including real
admins**. Declaring the field is what makes the existing check function.

Verified: a `member` gets `307 → /`; an `admin` gets `200`.

### 4.2 Trusted origins — a real deployment bug, fixed

`trustedOrigins` previously derived production entries **only from Vercel
environment variables**. On any non-Vercel host or custom domain that list is
empty and **every auth call returns 403 `INVALID_ORIGIN`**.

Reproduced directly: signing in against an untrusted origin returned
`{"message":"Invalid origin","code":"INVALID_ORIGIN"}` with HTTP 403.

Fixed by always trusting `BETTER_AUTH_URL`. Set it correctly in every
environment; it is not optional.

## 5. Migrations

Three stages, in order, in `scripts/db-migrate.mjs`:

1. **Better Auth planner** — creates its four tables and Peak's additional
   columns. Runs first so `user` exists before foreign keys reference it.
2. **Generated Drizzle SQL** — `drizzle/*.sql`, tracked in `_peak_migration`.
   Statements run inside savepoints; a duplicate is tolerated **only** for the
   four Better-Auth-owned tables, which drizzle-kit also emits because they live
   in the TS schema for FK typing. Every other duplicate fails loudly.
3. **Verify** — walks the Drizzle schema and asserts every table and column
   exists, exiting non-zero on mismatch.

Stage 3 exists because of AREA-109: a production sign-in 500 whose root cause
was that **no deploy step ever created the tables**, and nothing detected it
because nothing checked. Now something checks.

```bash
pnpm db:generate   # schema → drizzle/*.sql  (never hand-edit the SQL)
pnpm db:migrate    # apply + verify
pnpm db:check      # verify only — run this in CI and predeploy
pnpm db:seed       # reference data only: markets, categories, flags
```

**`pnpm db:check` must be a predeploy gate.** That is the whole lesson of
AREA-109.

## 6. Environment

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `BETTER_AUTH_SECRET` | yes | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | yes | Public origin. Now also a trusted origin — see §4.2 |

## 7. Hosting — OPEN DECISION

`app/layout.tsx` renders `@vercel/analytics` in production. Off Vercel it
requests `/_vercel/insights/script.js` and 404s — the only console error in the
running app.

That is not a defect on Vercel and not fatal elsewhere, but it is a live signal
about an undecided question: **where does this deploy?** Recorded as **D3** in
`tickets/peak-cloud/OPEN-DECISIONS.md`. The component was not deleted.

## 8. What was withdrawn

The Tauri native-first architecture (AREA-112) is withdrawn. A native wrapper is
not refused, only re-sequenced: it becomes a client of the cloud API rather than
the architecture. Full reasoning: `tickets/archive/SUPERSESSION-LEDGER.md` §1.1.
