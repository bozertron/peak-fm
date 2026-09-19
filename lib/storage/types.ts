/**
 * The media seam: the contract every storage unit and every surface imports.
 *
 * Types only — no runtime code, no side effects, no imports. The backend is
 * NOT chosen (PEAK-209 is blocked on D3: Vercel Blob / S3 / R2 all depend on
 * it), so what can be pinned now is the shape every backend must satisfy and
 * the vocabulary the UI needs to explain a refusal.
 *
 * Two rules this file exists to encode:
 *   - Bytes never pass through the Next server. A `MediaStore` issues signed
 *     URLs and deletes keys; it is never handed a file body.
 *   - Policy is a caller argument, never a hidden default. `maxBytes` and the
 *     abandonment window belong to the owner, not to this module.
 */

/** The narrow seam every caller depends on. Specified by PEAK-209. */
export interface MediaStore {
  /**
   * Issues a short-lived, single-use URL the client uploads to directly, plus
   * the stable key the URL will resolve to and the public URL the gallery
   * renders. Validation happens BEFORE this is called, so a refusal never
   * reaches the store.
   */
  createUploadUrl(input: { userId: string; contentType: string; maxBytes: number }): Promise<{
    uploadUrl: string
    publicUrl: string
    key: string
  }>
  /**
   * Removes the object behind `key`. Used by orphan collection (an abandoned
   * draft's photos must be reclaimed) and by media edits. Must be idempotent
   * enough that re-deleting a reclaimed key is not a corruption.
   */
  delete(key: string): Promise<void>
}

/** The image formats Peak accepts. Anything else must be re-encoded client-side first. */
export const SUPPORTED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type SupportedContentType = (typeof SUPPORTED_CONTENT_TYPES)[number]

/** Every way an upload can be refused. Distinguishable on purpose: the UI must say which rule bit. */
export type UploadRefusalReason =
  | 'unsupported-content-type'
  | 'too-large'
  | 'empty'
  | 'signature-expired'
  | 'signature-already-used'
  | 'signature-invalid'
  | 'unknown-key'

/** The verdict of upload validation. `detail` is the human sentence the surface shows. */
export type ValidationResult =
  | { ok: true; contentType: SupportedContentType }
  | { ok: false; reason: UploadRefusalReason; detail: string }

/** What a draft's media row needs. Mirrors listing_media; `position` 0 is the cover. */
export interface MediaRecord {
  /** Storage key the backend issued — the object's identity, which the DB row does not itself store. */
  key: string
  /** The URL the gallery renders. With `images.unoptimized` this is served as stored. */
  url: string
  /** Media discriminator, `listing_media.kind` — 'image' today, kept open for video. */
  kind: string
  /** Alt text for accessibility; null when the seller has not written one. */
  alt: string | null
  /** Order within the gallery. Position 0 IS the cover — there is no separate cover flag. */
  position: number
  /**
   * True when the photo came from the in-app camera rather than a file picker.
   * Presentation quality scoring treats these differently, so it is carried
   * from the upload through to the row.
   */
  capturedInApp: boolean
}
