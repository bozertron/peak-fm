# [PEAK-232] In-chat checkout

|  |  |
|---|---|
| **Wave** | **3** |
| **Status** | OPEN |
| **Area** | Commerce |
| **Depends on** | PEAK-231, **PEAK-300** |
| **Blocks** | PEAK-212, PEAK-310 |
| **Blocked by decision** | — |
| **Files you own** | `components/thread/kinds/checkout.tsx`, `lib/commerce/checkout.ts` |
| **Risk** | money / UX |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
"When the time is right, the transaction can go down inside the chat itself due
to commerce integrations." Commerce is **not** a separate checkout surface.

## Scope
- A seller proposes terms in a thread → `message.kind = 'offer'`.
- Buyer accepts → `message.kind = 'checkout'` carrying the order reference in
  `payload`; `order.threadId` points back.
- Payment is completed in place, without leaving the conversation.
- Status changes post as `message.kind = 'system'` — paid, shipped, completed,
  refunded.
- The thread is the receipt. Both parties can export from it.

## Acceptance criteria
- Given an offer message, when the buyer accepts and pays, then an `order` row
  exists with `threadId` set and the thread shows the whole sequence.
- Given a page reload mid-checkout, then no duplicate order is created.
- Given a participant who is not the buyer, then the checkout control is not
  actionable for them.

## Verification evidence
A full browser round trip in Stripe test mode, screenshotted, with the resulting
`order` and `message` rows pasted.

## Rollback
Behind `commerce.checkout`. With it off, threads still work and terms can still
be agreed in text.

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
