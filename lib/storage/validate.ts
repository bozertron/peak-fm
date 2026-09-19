/**
 * lib/storage/validate.ts — PEAK-209 unit 2 of 6: the gate that runs BEFORE any
 * upload URL exists.
 *
 * The ticket's first acceptance criterion is "Given an oversized file, then no
 * upload URL is issued." That is only true if the refusal happens here, on the
 * server, before `MediaStore.createUploadUrl` is reached — a size check that runs
 * after a signed URL is handed out has already spent the bandwidth and the money.
 * So this module answers exactly one question — may this upload proceed? — and
 * nothing else: it issues no URL, signs nothing, touches no filesystem, network,
 * database or Clock. It is pure, so the same contract can be used by the client
 * resize path (to warn before a wasted round trip) and by the server (to refuse).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `maxBytes` IS AN ARGUMENT AND NOT A CONSTANT
 * ─────────────────────────────────────────────────────────────────────────────
 * How large a photo may be is a product decision, and PEAK-209 makes it the
 * owner's: the ticket's interface passes `maxBytes` in. A default here would be
 * an invisible policy that a plan tier could never override and that no test
 * could distinguish from the real thing. Consequently the *only* thing this
 * module can say about a nonsensical limit (`0`, negative, `NaN`, `Infinity`) is
 * that the limit itself is broken — it never guesses a "reasonable" number.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE REFUSAL LADDER IS DETERMINISTIC, AND THIS IS THE ORDER
 * ─────────────────────────────────────────────────────────────────────────────
 * Several failures can hold at once (a 40 MB PDF against a 0-byte limit is bad on
 * three counts). The order below is chosen so the *cause a human must fix* is the
 * one reported, and every rung is checked so no combination can slip through as
 * `ok: true`:
 *
 *   1. content type — cheapest check, needs nothing else, and it is the check the
 *      ticket's acceptance criteria lead with.
 *   2. the limit itself — a limit that is not a positive whole number of bytes is
 *      a CALLER BUG. It is checked before the size comparison because `bytes >
 *      maxBytes` derived from a broken limit is meaningless: with `maxBytes = 0`
 *      a truthful 12-byte upload would be reported as "too large", sending the
 *      user to shrink a file that was fine. The refusal is still `'too-large'`
 *      (the vocabulary has no better word) but the detail says the limit is
 *      invalid, so a caller bug cannot read as a valid upload OR as a user error.
 *   3. byte count — `bytes <= 0` is `'empty'`; a non-finite or fractional count is
 *      not a whole number of bytes at all, and without this rung `NaN` would
 *      compare `false` against every limit and be accepted as a real file.
 *   4. the size comparison — `bytes > maxBytes` is `'too-large'`. The boundary is
 *      INCLUSIVE: exactly `maxBytes` is allowed, because the limit reads as "up
 *      to this many bytes" and no bytes are lost at the edge.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NORMALISATION: WHY 'IMAGE/JPEG; CHARSET=UTF-8' IS JPEG AND NOT A REFUSAL
 * ─────────────────────────────────────────────────────────────────────────────
 * Browsers and OS file pickers are not consistent about the casing of a MIME
 * type, and `File.type` is copied verbatim from the platform — 'IMAGE/JPEG' is a
 * real thing a real client sends. Some clients also append parameters
 * ('image/jpeg; charset=utf-8'). RFC 9110 §8.3.1 ("Media Type") says the type and
 * subtype are case-insensitive, while parameter values are not
 * (https://www.rfc-editor.org/rfc/rfc9110.html#section-8.3.1) and
 * https://www.rfc-editor.org/rfc/rfc2045#section-5.1 — so lower-casing the
 * essence and dropping parameters is the standard-conformant read, not leniency.
 *
 * What normalisation must NOT do is let a type through that is genuinely
 * different: 'image/gif; charset=utf-8' normalises to 'image/gif' and is still
 * refused, with the normalised value named in the detail so the reason is
 * auditable. A type with no `type/subtype` shape at all ('jpeg', '', ';') is
 * likewise refused rather than coerced.
 */

import { SUPPORTED_CONTENT_TYPES, type SupportedContentType, type ValidationResult } from './types'

/** The exact input every function here takes. Mirrors `MediaStore.createUploadUrl`'s policy args. */
export interface UploadCandidate {
  /** The type the client claims, e.g. a File's `type`. Normalised before it is judged. */
  contentType: string
  /** The size the client claims, in bytes. */
  bytes: number
  /** The owner's ceiling for this upload, in bytes. Never defaulted here. */
  maxBytes: number
}

/**
 * Lower-cases the media type/subtype and drops any parameters (RFC 9110 §8.3.1:
 * type and subtype are case-insensitive). Returns the essence only — this does
 * NOT decide support, it only removes the noise a real client adds.
 */
function normalizeContentType(raw: string): string {
  const essence = raw.split(';')[0]?.trim() ?? ''
  return essence.toLowerCase()
}

/** A `type/subtype` shape, so a stray word or an empty string is never coerced into a supported type. */
function hasMediaTypeShape(essence: string): boolean {
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(essence)
}

/** Narrowing membership test: the tuple is `as const`, so this is where the string becomes a SupportedContentType. */
function isSupportedContentType(value: string): value is SupportedContentType {
  return (SUPPORTED_CONTENT_TYPES as readonly string[]).includes(value)
}

/** The supported list as a human sentence, so a refusal tells the user what WOULD work. */
const SUPPORTED_LIST = SUPPORTED_CONTENT_TYPES.join(', ')

/** `image/jpeg; charset=utf-8` reads as `"image/jpeg; charset=utf-8" (normalised to "image/jpeg")`. */
function describeContentType(raw: string, essence: string): string {
  return raw === essence ? `"${raw}"` : `"${raw}" (normalised to "${essence}")`
}

/**
 * Answers one question: may an upload of this type and size proceed under this
 * limit? A refusal always names the rule that bit and echoes the values seen, so
 * the surface can show a sentence a seller can act on and a log line can be
 * trusted.
 */
export function validateUpload(input: UploadCandidate): ValidationResult {
  const { contentType, bytes, maxBytes } = input

  /* 1. The type, normalised first so casing and parameters are not refusals. */
  const essence = normalizeContentType(contentType)
  if (!hasMediaTypeShape(essence) || !isSupportedContentType(essence)) {
    return {
      ok: false,
      reason: 'unsupported-content-type',
      detail: `${describeContentType(contentType, essence)} is not an accepted type. Supported types: ${SUPPORTED_LIST}.`,
    }
  }
  const accepted: SupportedContentType = essence

  /* 2. The limit. A caller bug must read as a caller bug, never as a valid upload. */
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    return {
      ok: false,
      reason: 'too-large',
      detail: `maxBytes is ${maxBytes}, which is not a positive whole number of bytes: the size limit itself is invalid, so no upload can be judged against it.`,
    }
  }

  /* 3. The byte count. `NaN` and fractions would otherwise pass every comparison. */
  if (!Number.isSafeInteger(bytes) || bytes <= 0) {
    return {
      ok: false,
      reason: 'empty',
      detail:
        bytes === 0
          ? '0 bytes: an empty file has nothing to store.'
          : `${bytes} is not a positive whole number of bytes, so there is nothing to store.`,
    }
  }

  /* 4. The comparison. The boundary is inclusive: exactly maxBytes is allowed. */
  if (bytes > maxBytes) {
    return {
      ok: false,
      reason: 'too-large',
      detail: `${bytes} bytes exceeds the ${maxBytes}-byte limit by ${bytes - maxBytes} bytes.`,
    }
  }

  return { ok: true, contentType: accepted }
}

/**
 * The form a caller that cannot proceed cannot forget to use: throws instead of
 * returning a verdict, so ignoring the return value is impossible. Used
 * immediately before `MediaStore.createUploadUrl`, which is why it returns the
 * normalised type — the store must be signed for the type that was validated,
 * not the raw string the client sent.
 *
 * The thrown Error is always an `Error` (never `null`/`undefined`, never a
 * string), and its message carries both the machine-readable reason and the
 * human detail. Callers that need the reason as a value rather than an exception
 * use `validateUpload` directly.
 */
export function assertUploadAllowed(input: UploadCandidate): SupportedContentType {
  const result = validateUpload(input)
  if (!result.ok) {
    throw new Error(`upload refused [${result.reason}]: ${result.detail}`)
  }
  return result.contentType
}
