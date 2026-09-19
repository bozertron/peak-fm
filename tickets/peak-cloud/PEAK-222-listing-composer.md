# [PEAK-222] Shared listing composer

- Priority: **P0 — unblocks four tickets** · Area: Sell · Status: OPEN
- Dependencies: PEAK-209 (storage) · Blocks: PEAK-220, PEAK-221, PEAK-260, PEAK-270
- Risk: architecture / contention
- **Created by the pressure test.** Four tickets independently said "reuse the
  presentation builder". Without this ticket they would all edit the same files
  in parallel.

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
