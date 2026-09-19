# [PEAK-209] Media storage

|  |  |
|---|---|
| **Wave** | **1** |
| **Status** | OPEN — interface unblocked, **backend blocked by D3** |
| **Area** | Platform |
| **Depends on** | none |
| **Blocks** | PEAK-222 → all of Sell / Rent / Trade |
| **Blocked by decision** | **D3** (backend only) |
| **Files you own** | `lib/storage/**` |
| **Risk** | cost / privacy |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Scope
`lib/storage/` behind a narrow interface, the same way commerce is:

```ts
export interface MediaStore {
  createUploadUrl(input: { userId: string; contentType: string; maxBytes: number })
    : Promise<{ uploadUrl: string; publicUrl: string; key: string }>
  delete(key: string): Promise<void>
}
```

- Signed, short-lived, single-use upload URLs. **Bytes never pass through the
  Next server** — a marketplace full of photos will not survive that.
- Server-side validation of content type and size before issuing a URL.
- Client-side resize and re-encode before upload, consistent with
  `next.config.mjs` setting `images.unoptimized`.
- **Strip EXIF GPS by default.** A seller photographing an item at home should
  not publish their address. Opt-in only, and say so in the UI.
- Orphan collection: media uploaded for a draft that is never published must be
  reclaimed.

## Blocked
**D3** — hosting decides the sensible backend (Vercel Blob, S3, R2). The
interface, the validation, the EXIF stripping and the client resize are **not
blocked** and should be built now against a local-disk implementation used only
in tests.

## Acceptance criteria
- Given an oversized file, then no upload URL is issued.
- Given a photo with GPS EXIF, then the stored file has none unless opted in.
- Given an abandoned draft, then its media is reclaimed.
- Given a signed URL, then it expires and cannot be replayed.

## Verification evidence
An EXIF-bearing fixture photo with `exiftool` output before and after. A replay
attempt against an expired URL.

## Rollback
Behind `surface.sell`.

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
