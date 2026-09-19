# [PEAK-202] Eight-surface app shell

|  |  |
|---|---|
| **Wave** | — |
| **Status** | **DONE — verified** |
| **Area** | Foundation |
| **Depends on** | PEAK-200 |
| **Blocks** | every surface ticket |
| **Blocked by decision** | — |
| **Files you own** | `app/(app)/**` except registrar-owned `app/(app)/layout.tsx`; `components/surface.tsx`, `components/account-graphic.tsx` |
| **Risk** | UX / accessibility |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
Replace the single-page demo — 80 dense lines containing all four old
destinations, ~17 state hooks and three hardcoded data arrays — with a real
route per surface.

## Delivered
- `components/peak-header.tsx` — `peak` wordmark (unmoved), then **Buy, Sell,
  Rent, Trade, Find, Plans, Communicate**, then the Account control.
- `app/(app)/layout.tsx` — route group carrying the header. `/admin`,
  `/sign-in`, `/sign-up` stay outside it and keep their own chrome.
- Nine pages, each a Server Component reading real data through `lib/queries/*`.
- `app/(app)/page.tsx` — The Pitch: seven elevator pitches plus six live counts.
- `components/account-graphic.tsx` — the user-applied interactive graphic, a
  pure deterministic function of `(kind, seed, name)`.
- `app/globals.css` rewritten: tokens, ~340 organised lines, full dark mode.

Demo arrays are gone. Empty markets say they are empty.

## Acceptance criteria
- Given any surface route, when requested, then it returns 200 and renders real
  query results.
- Given an empty market, then the page states that plainly rather than showing
  invented inventory.
- Given a keyboard, then nav is reachable, marks `aria-current`, and the account
  menu closes on Escape and on outside click.

## Verification evidence
All 12 member routes return 200; `/admin` returns 307 when signed out.
Browser test: 7 nav links, 7 pitch cards, category filter drives the URL and
marks the tab selected, one console 404 (`_vercel/insights` — see D3).

## Rollback
`git revert`. No data migration is involved.
