# Peak — Data Model

**Status:** Authoritative. **Last updated:** 2026-09-18
**Source of truth:** `lib/db/schema/` — this document describes it, it does not
define it. When they disagree, the code is right and this file is a bug.

38 tables, verified present by `pnpm db:migrate`.

## Ownership

| Owner | Tables | Created by |
|---|---|---|
| Better Auth | `user`, `session`, `account`, `verification` | Better Auth planner (stage 1) |
| Peak | the other 34 | Generated Drizzle SQL (stage 2) |

Better Auth's four are mirrored in `lib/db/schema/auth.ts` so the rest of the
model can declare real foreign keys against `user.id`.

## Conventions

- **Primary keys** — `text` holding a UUID, via `crypto.randomUUID()`.
- **Money** — integer **cents**, always beside a `currency` column. Never float.
- **Status** — `text` with a TypeScript union via `$type<>()`. Not `pgEnum`:
  every new value would otherwise need an `ALTER TYPE`, and these vocabularies
  are still moving.
- **Timestamps** — `createdAt` / `updatedAt` default `now()`.
- **JSON** — `jsonb`, with the expected shape documented at the column.

## Files

| File | Tables |
|---|---|
| `_shared.ts` | column builders, status vocabularies |
| `auth.ts` | `user` `session` `account` `verification` |
| `market.ts` | `market` `category` |
| `listing.ts` | `listing` `listing_media` `listing_attribute` `listing_block` `service_widget` `service_pricing_tier` `service_booking` |
| `commerce.ts` | `buyer_question` `order` `order_line` `accounting_record` |
| `rental.ts` | `roi_model` `rental_agreement` `autopay_contract` |
| `trade.ts` | `trade_offer` |
| `find.ts` | `find_request` `find_match` |
| `plan.ts` | `plan` `plan_step` `plan_proposal` `community_item` `community_feedback` |
| `comms.ts` | `thread` `thread_participant` `message` `message_attachment` `bulletin_post` |
| `admin.ts` | `admin_audit_log` `beta_invite` `feature_flag` `moderation_report` `beta_feedback` |

One file per bounded area **so that parallel agents own disjoint files**. The
barrel `index.ts` is shared and belongs to the sequential registrar.

## Design decisions worth knowing

### One listing spine, discriminated by `kind`

`listing.kind` is `sale | rental | trade`. Buy and Sell are two views of the
same `sale` row — the buyer's and the seller's. Rent and Trade add satellite
tables rather than forking the spine, so a filter, a media gallery or a block
written once works on all four surfaces.

`listing.priceCents` is nullable specifically for Trade: a Trade listing carries
no fixed price, because Bid as Sale lets a bidder name any amount.

### Find has no conversion path, on purpose

`find_request` has **no** `convertedToListingId`. The invariant "a Find ends as a
Find" is enforced by the absence of a column, not by a code comment. Do not add
one.

### Per-participant thread state

Archive, mute and delete live on `thread_participant`, never on `thread`. One
party clearing their inbox must not remove the other party's copy.

### Trade counters are a chain

`trade_offer.parentOfferId` makes a counter a new row. The negotiation is
readable end to end; nothing is overwritten.

### "Remove visibility" is a block row

`listing_block(listingId, blockedUserId)` — enforced in `listListings()` via a
`NOT IN` subquery against the viewer. The offers of a blocked user remain in the
database and remain auditable.

### Accounting records are frozen and two-sided

One `accounting_record` per `(order, perspective)`. `perspective` is `buyer` or
`seller`, which is how the same order exports a purchase package and a sales
package. Generated on demand, then frozen.

**Hard constraint:** `reliefNotes` must never be set with an empty
`researchSources`, and `confidence` must always be recorded. Default confidence
is `unsupported`.

### ROI models precede listings

`roi_model.listingId` is nullable and stays null until `exportedAt` is set. The
owner is deciding *whether to list at all*; the model cannot presuppose a
listing.

### Auto-pay needs both signatures

`ownerAcceptedAt` **and** `renterAcceptedAt` must both be set before `active`
may be true. No money moves on a schedule that one side did not accept.

## Known drift, resolved

Better Auth creates additional fields as nullable columns with no database
default, applying `defaultValue` in application code. Drizzle's mirror declares
`role` NOT NULL DEFAULT `'member'`, which would make TypeScript claim non-null
on a column the database allowed to be null.

Stage 2b of `scripts/db-migrate.mjs` reconciles this for the columns Peak owns
(`role`, `avatarKind`), setting the default and the NOT NULL constraint.
Verified: both report `is_nullable = NO` with correct defaults.

## Seeding

`pnpm db:seed` inserts **reference data only** — 5 Okanagan markets (Big White
active), 10 categories, 12 feature flags. Idempotent, keyed on natural slugs.

It deliberately seeds **no sample listings, people or messages**. Rule 3 of
`tickets/doctrine/PROHIBITED.txt` forbids hardcoded fake data standing in for a
feature, and the old `app/page.tsx` demo arrays were exactly that. An empty Buy
page that honestly says the market is empty is correct; a Buy page full of
invented telehandlers hides whether the query layer works.
