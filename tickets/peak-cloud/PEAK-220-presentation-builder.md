# [PEAK-220] Sell: Build Product Presentation

- Priority: P0 · Area: Sell · Status: OPEN
- Dependencies: PEAK-200, PEAK-202
- Risk: UX / storage
- **This is the critical path.** Nothing can be bought until something can be sold.

## Intent
"A full featured Build Product Presentation with file picker + Camera option so
the user can take a photo on a mobile device *directly into the presentation*."

## Scope
- Multi-step composer, saving a `draft` listing continuously so nothing is lost.
- Media: file picker **and** a live camera capture path using `getUserMedia`,
  writing `listing_media.capturedInApp = true`. On a phone the camera is the
  primary path, not a fallback.
- Client-side resize and re-encode before upload; strip EXIF GPS by default.
- Reorder, set cover, alt text per image.
- Category selection driving the `listing_attribute` fields to fill.
- Price, condition, location (defaulting to the seller's market).
- Preview exactly as a buyer will see it, then publish.

## Storage
Object storage with signed upload URLs. `next.config.mjs` sets
`images.unoptimized`, so images are resized on the client at upload rather than
by a server pipeline. Stay consistent with that or change it deliberately.

## Acceptance criteria
- Given a phone, when the seller chooses the camera, then the photo lands in the
  presentation without a round trip through the gallery.
- Given a draft, when the browser is closed and reopened, then nothing is lost.
- Given an image with GPS EXIF, when uploaded, then location data is stripped
  unless the seller opts in.
- Given publish, then `status` becomes `active` and `publishedAt` is set.

## Verification evidence
Real device or emulated mobile browser capture. Paste the resulting
`listing_media` row showing `capturedInApp = true`.

## Rollback
Behind `surface.sell`. Drafts are private, so a partial rollout is safe.
