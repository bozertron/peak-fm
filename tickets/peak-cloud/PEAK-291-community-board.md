# [PEAK-291] Plans: Community board

|  |  |
|---|---|
| **Wave** | **2** |
| **Status** | OPEN |
| **Area** | Plans |
| **Depends on** | PEAK-200 |
| **Blocks** | nothing |
| **Blocked by decision** | — |
| **Files you own** | `app/(app)/plans/community/**` |
| **Risk** | moderation / trust |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
"This starts as local events + gov't announcements board looking for citizen
feedback."

## Scope
- `community_item` in three kinds: `event`, `announcement`, `consultation`.
- Operator and verified civic accounts can post; `sourceName` and `sourceUrl`
  attribute the origin when there is no member author.
- Consultations open `community_feedback` with an optional stance
  (support / oppose / neutral) until `feedbackClosesAt`.
- An upcoming-events view and a feedback summary per consultation.

## Trust rules
1. **A government announcement must be attributable.** `sourceName` is required
   when `authorId` is null, and `sourceUrl` should point at the original.
2. **Feedback is not anonymous to moderators** but the display policy for other
   members is a product decision — if it is unclear, raise it as a decision
   rather than picking.
3. Closed consultations become read-only; late feedback is refused, not quietly
   dropped.

## Acceptance criteria
- Given an item with no author, when saved without `sourceName`, then it is
  refused.
- Given a consultation past its close date, then the feedback form is absent and
  a direct POST is refused.
- Given a past event, then it is excluded from the upcoming view.

## Verification evidence
Date-boundary tests for close and for past events. Paste the run.

## Rollback
Behind `surface.plans`.

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
