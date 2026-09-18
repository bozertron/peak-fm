# [PEAK-270] Trade: offers, Bid as Sale, counters, blocks

- Priority: P1 · Area: Trade · Status: OPEN
- Dependencies: PEAK-220, PEAK-300
- Risk: UX / abuse

## Intent
"Propose the trade flows based on the rest of the items." The one unique
addition is **Bid as Sale**.

## Scope
- Create a trade listing, reusing the presentation builder. `bidAsSale` is set
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
