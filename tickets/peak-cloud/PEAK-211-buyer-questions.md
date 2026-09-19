# [PEAK-211] Buy: buyer question sets

|  |  |
|---|---|
| **Wave** | **3** |
| **Status** | OPEN |
| **Area** | Buy |
| **Depends on** | PEAK-210, **PEAK-300** |
| **Blocks** | PEAK-212 |
| **Blocked by decision** | — |
| **Files you own** | `components/thread/kinds/question.tsx`, `lib/queries/commerce.ts` |
| **Risk** | privacy |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
"The user clicks the add, and if they're interested, they can set up questions
for the seller to answer."

## Scope
- Compose an ordered question set against a listing before committing to buy.
- Post the set into the listing thread as a `message.kind = 'question'`.
- Seller answers inline; answers write back to `buyer_question.answer` and
  `answeredAt` so they are structured data, not just chat text.
- Suggested questions per category (a plain lookup — **not** the LLM surface).
- Buyer sees their own sets across listings from Buy History.

## Privacy constraint — the important one
`buyer_question` is keyed on **(listingId, buyerId)**. Two buyers must never see
each other's diligence, and the seller sees each buyer's set separately. A
query that returns a listing's questions without scoping to a buyer is a defect.

## Acceptance criteria
- Given two buyers with question sets on one listing, when either loads the
  listing, then they see only their own.
- Given a seller answering, then `answer` and `answeredAt` are persisted and the
  buyer is notified in the thread.
- Given an unauthenticated request for `buyer_question` rows, then it is refused.

## Verification evidence
A test with two buyer accounts proving isolation. Paste the actual output.

## Rollback
Behind `surface.buy`.

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
