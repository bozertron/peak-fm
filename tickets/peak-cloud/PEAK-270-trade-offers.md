# [PEAK-270] Trade: offers, Bid as Sale, counters, blocks

|  |  |
|---|---|
| **Wave** | **2** |
| **Status** | OPEN |
| **Area** | Trade |
| **Depends on** | **PEAK-222**, PEAK-300 |
| **Blocks** | nothing |
| **Blocked by decision** | — |
| **Files you own** | `app/(app)/trade/**`, `lib/queries/trade.ts`, `components/thread/kinds/offer.tsx` |
| **Risk** | UX / abuse |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
"Propose the trade flows based on the rest of the items." The one unique
addition is **Bid as Sale**.

## Scope
- Create a trade listing by configuring the shared composer (**PEAK-222**) for
  `kind: 'trade'`; do not fork it. `bidAsSale` is set
  **once at creation** and is **not editable afterwards** — enforce in the update
  path, not just by hiding the control.
- With Bid as Sale on, a bidder may offer **any item, any amount of money, or
  both** (`offerKind` = `item` | `cash` | `mixed`).
- Owner responses: **accept**, **counter**, or **remove visibility from that
  user**.
  - Counter creates a new `trade_offer` with `parentOfferId` — the chain is
    readable end to end and nothing is overwritten.
  - Remove visibility writes `listing_block`. The blocked user's existing
    offers **remain in the database and remain auditable**; they are not deleted.
    `listListings()` already excludes blocked listings from that viewer.
- Accepting a mixed or cash offer creates an `order` for the cash leg only.

## Abuse considerations
Bid as Sale invites lowballing by design — that is accepted. The mitigation is
the block, which is per listing rather than platform-wide, so one bad
interaction does not require a global ban.

## Acceptance criteria
- Given a published trade listing, when `bidAsSale` is edited, then it is
  refused.
- Given a blocked user, then the listing is absent from their browse and they
  cannot create a new offer on it.
- Given a counter chain of three, then all three are visible in order.
- Given an accepted cash leg, then exactly one order is created.

## Verification evidence
Two-account test covering offer → counter → counter → accept, plus the block
path. Paste the resulting `trade_offer` rows showing the chain.

## Rollback
Behind `surface.trade`.

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
