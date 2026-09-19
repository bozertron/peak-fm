# [PEAK-222] Shared listing composer

|  |  |
|---|---|
| **Wave** | **1** |
| **Status** | OPEN |
| **Area** | Sell |
| **Depends on** | PEAK-209 |
| **Blocks** | **PEAK-220, PEAK-221, PEAK-260, PEAK-270** |
| **Blocked by decision** | — |
| **Files you own** | `components/composer/**` |
| **Risk** | architecture / contention |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

> **CRITICAL PATH.** Four tickets cannot start until this lands. Built late,
> or in parallel with its consumers, it re-creates the exact collision it
> exists to remove.

## The problem it solves

PEAK-220 (Sell), PEAK-260 (Build Rental) and PEAK-270 (Trade) all create a
`listing` row with photos, and PEAK-221 layers the service widget on top. They
differ only in which fields apply and what the publish step validates.

Four agents building "the composer" concurrently is the single worst collision
in the backlog. **One agent builds it; the other three configure it.**

## Scope
`components/composer/` — a config-driven listing composer owned by this ticket
alone:

```ts
export type ComposerConfig = {
  kind: 'sale' | 'rental' | 'trade'
  offeringType?: 'goods' | 'service'
  /** Field groups this kind shows. The composer renders, never guesses. */
  sections: ComposerSection[]
  /** Runs before publish. Returns [] to allow, or reasons to refuse. */
  validate: (draft: ListingDraft) => string[]
  /** Where to send the seller after publishing. */
  onPublished: (listingId: string) => string
}
```

Shipped by this ticket:
- draft autosave against a real `listing` row with `status = 'draft'`
- the media step — file picker **and** camera capture (`capturedInApp`),
  reorder, cover, alt text
- category selection driving `listing_attribute` fields
- buyer-eye preview, then publish
- `sections` for the fields common to all three kinds

**Not** shipped here: the rental rate/availability fields (PEAK-260), the trade
`bidAsSale` toggle (PEAK-270), the service widget (PEAK-221). Those arrive as
config from their own tickets, in their own files.

## Ownership rule
`components/composer/**` belongs to this ticket. After it lands it is
**registrar-owned**: a consuming ticket adds its config in *its own* file and
opens a registrar request if the composer itself needs a new capability.

## Acceptance criteria
- Given three configs, when each renders, then only that kind's sections appear.
- Given `validate` returning reasons, then publish is refused and every reason
  is shown.
- Given a closed and reopened browser, then the draft is intact.
- Given a phone, then camera capture writes `capturedInApp = true`.

## Verification evidence
One test per kind asserting section visibility and refusal reasons, plus a real
mobile capture with the `listing_media` row pasted.

## Rollback
Behind the consuming surface's flag; drafts are private.

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
