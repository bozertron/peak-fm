# [PEAK-280] Find: the [Find] button and permanent capture

|  |  |
|---|---|
| **Wave** | **2** (280a) · **3** (280b placement) |
| **Status** | OPEN |
| **Area** | Find |
| **Depends on** | PEAK-200, PEAK-202 |
| **Blocks** | PEAK-281, PEAK-290 |
| **Blocked by decision** | — |
| **Files you own** | `components/find/**`, `app/(app)/find/**` |
| **Risk** | data integrity |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
"Wherever applicable, there's a [Find] button. It looks at the meta-data of
where it's coming from, logs it as a permanent opportunity until satisfied."

## Two-part delivery — the placement is the collision

This ticket's button belongs on **five surfaces owned by other agents** (Buy,
Rent, Plans, Communicate, and the listing detail page). Editing five other
agents' files is exactly what the anti-clobber rule forbids, so the work
splits:

- **280a — the mechanism.** `components/find/FindButton.tsx`, the capture
  action, the confirm step, the seeker's Find list, and `/find/new`. Touches
  only files this ticket owns. **Ship this first, alone.**
- **280b — the placement.** A single registrar pass that drops `<FindButton>`
  into the five surfaces in one commit, after 280a has landed and after those
  surfaces are otherwise stable.

Do **not** let five surface agents each add the button. One pass, one commit,
one reviewer.

## Scope
- A reusable `<FindButton>` placed on: an empty Buy result, a listing that is
  sold or unavailable, a plan step, a rental with no local supply, a thread.
- On press it captures `originSurface`, `originEntityType`, `originEntityId`
  and an `originMetadata` snapshot **at that moment** — the filters that
  returned nothing, the plan step that needs a trade, the category being browsed.
- A short confirm step so the seeker can add detail and a budget range.
- The seeker's Find list, with satisfy and withdraw.

## The invariant — enforce, do not just document
> Anything that starts as a Find **ends as a Find.** It never migrates to a Buy
> item, because that would be redundant and would clutter the focused buying
> experience.

There is **no** `convertedToListingId` column in `find_request`, deliberately.
**Do not add one.** Do not add a "promote to listing" action. A Find resolves by
the seeker marking it satisfied — a match does not satisfy it, and neither does
a responder.

## Acceptance criteria
- Given a [Find] press from an empty Buy result, then the failed filter set is
  stored in `originMetadata`.
- Given a match, then `status` may become `matched` but never `satisfied`.
- Given anyone other than the seeker, then they cannot mark it satisfied.
- Given a Find, then no code path creates a `listing` from it.

## Verification evidence
A test asserting no listing is created from any Find path, plus the captured
metadata for each origin surface. Paste the rows.

## Rollback
Behind `surface.find`.

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
