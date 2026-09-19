# [PEAK-281] Find: matchmaking

|  |  |
|---|---|
| **Wave** | **3** |
| **Status** | OPEN |
| **Area** | Find |
| **Depends on** | PEAK-280, PEAK-210 |
| **Blocks** | nothing |
| **Blocked by decision** | — |
| **Files you own** | `lib/matching/**` |
| **Risk** | relevance / notification fatigue |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
"Where appropriate acts as a match maker between those looking and those having
the means to satisfy the demand."

## Scope
- On a new listing: find open `find_request` rows it could satisfy.
- On a new Find: find existing listings, service widgets and business plans.
- Score on category, text similarity, budget overlap, market proximity and
  recency. Store the reasoning in `find_match.scoreBasis` so a bad match can
  always be explained.
- Notify with a threshold and a rate limit. A supplier spammed with poor
  matches stops reading them, at which point the feature is worse than absent.
- Suppliers can self-offer against the demand board without being matched.

## Rules
1. **Every score is explainable** from `scoreBasis`. No opaque ranking.
2. **A match is a suggestion.** It does not change the Find's status beyond
   `matched`, and never satisfies it.
3. **Rate-limit notifications per user per day**, configurable.

## Acceptance criteria
- Given a new listing matching three open Finds, then three `find_match` rows
  are created with populated `scoreBasis`.
- Given a match below threshold, then it is stored but not notified.
- Given the daily cap, then further notifications are batched, not dropped
  silently.

## Verification evidence
A fixture set of Finds and listings with expected scores asserted. Paste the run.

## Rollback
Behind `surface.find`. With it off, the demand board still works manually.

---

## Definition of done

Every one of these, with **actual output pasted** — rule 6 of
`../doctrine/PROHIBITED.txt` does not accept an assertion:

```bash
pnpm lint         # once PEAK-207 lands
pnpm typecheck
pnpm build
pnpm test         # once PEAK-206 lands
pnpm db:check     # all tables verified
pnpm check:links  # no unowned dead links
```

Plus this ticket's own **Verification evidence** above.

If your ticket creates a route, **delete its line from `KNOWN_MISSING` in
`scripts/check-links.mjs` in the same commit.** If it links to a route that
does not exist yet, add the line with your ticket number. That list may only
shrink.
