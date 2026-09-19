# [PEAK-290] Plans: Personal and Business

|  |  |
|---|---|
| **Wave** | **3** |
| **Status** | OPEN |
| **Area** | Plans |
| **Depends on** | PEAK-280, **PEAK-300** |
| **Blocks** | nothing |
| **Blocked by decision** | — |
| **Files you own** | `app/(app)/plans/**` *(except `community/`)*, `lib/queries/plans.ts` |
| **Risk** | UX |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
Personal: "a plan for a Bathroom Reno." Business: "A Plumber found 'Bathroom
Reno' in their Find area and based on the details, they can send the person
who's trying to Find help their plan + price that includes timelines and
guarantees."

## Scope
- Plan composer: title, summary, budget, dates, ordered `plan_step` rows with
  duration and cost.
- Raise a **Find directly from a plan step** — this is the join that makes the
  worked example work (PEAK-280).
- Business plans are **reusable templates** a provider sends repeatedly. Sending
  creates a `plan_proposal` with price, `timeline`, `guaranteeText` and
  `validUntil`, linked to the `find_request` it answers.
- Recipient reviews, accepts, declines, or opens a thread to negotiate.
- Accepting a proposal is the hand-off into commerce.

## Acceptance criteria
- Given a personal plan step, when Find is raised from it, then
  `originEntityType = 'plan'` and the step is in `originMetadata`.
- Given a provider answering a Find, then the recipient is the Find's seeker and
  `findRequestId` is set.
- Given `validUntil` passing, then the proposal becomes `expired` and cannot be
  accepted.
- Given acceptance, then a thread exists carrying the agreed terms.

## Verification evidence
The full worked example, two accounts: homeowner plan → Find → plumber proposal
→ acceptance. Paste the rows at each step.

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
