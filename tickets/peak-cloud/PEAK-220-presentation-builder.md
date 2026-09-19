# [PEAK-220] Sell: Build Product Presentation

|  |  |
|---|---|
| **Wave** | **2** |
| **Status** | OPEN |
| **Area** | Sell |
| **Depends on** | **PEAK-222**, PEAK-209 |
| **Blocks** | PEAK-210, PEAK-213 |
| **Blocked by decision** | — |
| **Files you own** | `app/(app)/sell/**`, `lib/queries/sell.ts` |
| **Risk** | UX / storage |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
"A full featured Build Product Presentation with file picker + Camera option so
the user can take a photo on a mobile device *directly into the presentation*."

## Depends on the shared composer

**PEAK-222 builds the composer. This ticket configures it for `kind: 'sale'`**
and owns the Sell surface around it. Do not build a second composer — three
other tickets consume the same one, and the pressure test flagged four-way
contention on it as the worst collision in the backlog.

## Scope
- Configure the composer for sale listings, goods and service.
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
