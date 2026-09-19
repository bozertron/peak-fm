# [PEAK-205] Route inventory and the dead-link guard

|  |  |
|---|---|
| **Wave** | — |
| **Status** | **PARTLY DONE** — guard shipped, 18 routes still open |
| **Area** | Platform |
| **Depends on** | none |
| **Blocks** | nothing; every surface ticket closes part of it |
| **Blocked by decision** | — |
| **Files you own** | `scripts/check-links.mjs`, `app/not-found.tsx` |
| **Risk** | UX |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## The defect this came from

The surface pages were written with their real destinations linked before the
tickets that create those destinations had run. Result: **every primary
call-to-action on every surface returned 404** — "Be the first to sell",
"Explore ROI", "Raise a Find", "List something for trade", and fifteen more.

`typecheck`, `build` and `db:check` all passed. None of them can see a dead
link.

## Shipped
- `scripts/check-links.mjs` (`pnpm check:links`) extracts every internal href
  from `app/` and `components/`, normalises `${...}` to `:id`, and checks each
  against a running server. Unowned dead links exit 1.
- `KNOWN_MISSING` maps each not-yet-built route to its owning ticket. **That
  list may only shrink.**
- `app/not-found.tsx` renders a real 404 with working navigation instead of the
  framework default. It must live at the app root — a `not-found.tsx` inside
  the `(app)` group only catches `notFound()` calls raised within it, not
  unmatched URLs. This was verified, not assumed.

## Open — the routes themselves

| Route | Ticket |
|---|---|
| `/listing/:id` | PEAK-213 |
| `/sell/new`, `/sell/:id` | PEAK-220 |
| `/rent/build` | PEAK-260 |
| `/rent/roi`, `/rent/roi/:id` | PEAK-261 |
| `/rent/autopay` | PEAK-262 |
| `/trade/create`, `/trade/offer/:id` | PEAK-270 |
| `/find/new`, `/find/:id` | PEAK-280 |
| `/plans/new`, `/plans/:id`, `/plans/proposal/:id` | PEAK-290 |
| `/plans/community/:id` | PEAK-291 |
| `/communicate/new`, `/communicate/:id`, `/communicate/bulletin/new` | PEAK-300 |
| `/account/history` | PEAK-310 |

## Standing rule for every ticket
When your ticket creates a route, **delete its line from `KNOWN_MISSING`** in
the same commit. When your ticket adds a link to a route that does not exist
yet, add it to `KNOWN_MISSING` with the owning ticket — never leave it unowned.

## Acceptance criteria
- Given a link to a route with no page and no `KNOWN_MISSING` entry, then
  `pnpm check:links` exits 1 and names the source file.
- Given every route built, then `pnpm check:links` passes with an empty
  `KNOWN_MISSING`.

## Verification evidence
Paste `pnpm check:links` output. It currently reports 8 resolving and 19 known
gaps.

## Rollback
The guard is additive and gates nothing until CI adopts it (PEAK-208).
