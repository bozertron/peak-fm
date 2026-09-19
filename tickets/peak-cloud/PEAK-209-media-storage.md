# [PEAK-209] Media storage

- Priority: **P0** · Area: Platform · Status: OPEN — **blocked by D3**
- Dependencies: none · Blocks: PEAK-222, and therefore all of Sell/Rent/Trade
- Risk: cost / privacy
- **Created by the pressure test.** PEAK-220 required "object storage with
  signed upload URLs" and no ticket provided it.

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
