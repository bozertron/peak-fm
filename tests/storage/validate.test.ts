/**
 * tests/storage/validate.test.ts — PEAK-209 unit 2 of 6, the pre-upload gate.
 *
 * The ticket's first acceptance criterion is "Given an oversized file, then no
 * upload URL is issued", and the only way a refusal can happen before a URL is
 * that the refusal is decided HERE, with no I/O. So this file asserts two things
 * in every case and never just one:
 *
 *   - the VERDICT (ok / reason), which is what a caller branches on, and
 *   - the DETAIL, which is what the seller reads and what the log line carries,
 *     so a "refused for the wrong reason" bug cannot pass as a refusal.
 *
 * The boundary cases are deliberate, not padding:
 *   - `bytes === maxBytes` must be ACCEPTED (the limit is "up to N"), so an
 *     off-by-one that refuses the last legal byte is caught;
 *   - `maxBytes: 0` must NOT be reachable as `ok: true` by any byte count
 *     (a caller bug may not read as a valid upload — the ticket says so);
 *   - `NaN` / `Infinity` / fractional sizes must be REFUSED, because `NaN`
 *     compares `false` against every limit and would otherwise sail through the
 *     size check as a real 40 MB file.
 *
 * Both variants the UI can really send are exercised — 'IMAGE/JPEG' and
 * 'image/jpeg; charset=utf-8' — since RFC 9110 §8.3.1 makes type and subtype
 * case-insensitive and browsers pass `File.type` through verbatim.
 */

import { describe, expect, test } from 'vitest'
import { SUPPORTED_CONTENT_TYPES, type SupportedContentType } from '@/lib/storage/types'
import * as validateModule from '@/lib/storage/validate'
import { assertUploadAllowed, validateUpload } from '@/lib/storage/validate'

/** A limit that is a real product number, not a default this module owns. */
const LIMIT = 10_000_000

/**
 * Captures a throw so its MESSAGE can be asserted — `toThrow(/re/)` cannot check
 * a message against a value computed in the test. A non-Error throw is itself a
 * contract violation and is surfaced as a failure rather than coerced.
 */
function errorFrom(fn: () => unknown): Error {
  try {
    fn()
  } catch (error) {
    if (error instanceof Error) return error
    throw new Error(`expected an Error to be thrown, received ${String(error)}`)
  }
  throw new Error('expected the call to throw, but it returned normally')
}

describe('validateUpload — accepted types', () => {
  test('every supported type is accepted and returned normalised', () => {
    for (const contentType of SUPPORTED_CONTENT_TYPES) {
      const result = validateUpload({ contentType, bytes: 1024, maxBytes: LIMIT })
      expect(result).toEqual({ ok: true, contentType })
    }
    // The loop above proves nothing if the list itself is empty.
    expect(SUPPORTED_CONTENT_TYPES.length).toBeGreaterThan(0)
  })

  test("'IMAGE/JPEG' is accepted as image/jpeg — platforms do send upper case", () => {
    const result = validateUpload({ contentType: 'IMAGE/JPEG', bytes: 2048, maxBytes: LIMIT })
    expect(result).toEqual({ ok: true, contentType: 'image/jpeg' })
  })

  test("'image/jpeg; charset=utf-8' is accepted as image/jpeg — parameters are stripped", () => {
    const result = validateUpload({
      contentType: 'image/jpeg; charset=utf-8',
      bytes: 2048,
      maxBytes: LIMIT,
    })
    expect(result).toEqual({ ok: true, contentType: 'image/jpeg' })
  })

  test('mixed case plus parameters normalises in one step: Image/WEBP; q=0.9', () => {
    const result = validateUpload({ contentType: 'Image/WEBP; q=0.9', bytes: 1, maxBytes: LIMIT })
    expect(result).toEqual({ ok: true, contentType: 'image/webp' })
  })

  test('exactly maxBytes is allowed — the limit is inclusive, not exclusive', () => {
    const result = validateUpload({ contentType: 'image/png', bytes: LIMIT, maxBytes: LIMIT })
    expect(result).toEqual({ ok: true, contentType: 'image/png' })
    expect(validateUpload({ contentType: 'image/png', bytes: LIMIT + 1, maxBytes: LIMIT })).toEqual(
      {
        ok: false,
        reason: 'too-large',
        detail: expect.stringContaining('1 bytes exceeds'),
      },
    )
  })
})

describe('validateUpload — refusals', () => {
  test("an oversized file is refused 'too-large' and the detail names the limit and the overage", () => {
    const result = validateUpload({
      contentType: 'image/jpeg',
      bytes: LIMIT + 250,
      maxBytes: LIMIT,
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a refusal')
    expect(result.reason).toBe('too-large')
    // The LIMIT number itself must appear, or the message cannot be acted on.
    expect(result.detail).toContain(String(LIMIT))
    expect(result.detail).toContain(String(LIMIT + 250))
    expect(result.detail).toContain('250')
  })

  test("an unsupported type is refused 'unsupported-content-type' and the detail names what was sent", () => {
    const result = validateUpload({ contentType: 'application/pdf', bytes: 1024, maxBytes: LIMIT })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a refusal')
    expect(result.reason).toBe('unsupported-content-type')
    expect(result.detail).toContain('application/pdf')
    // A refusal is only useful if it says what would work.
    for (const supported of SUPPORTED_CONTENT_TYPES) {
      expect(result.detail).toContain(supported)
    }
  })

  test('a parameterised unsupported type is refused and the detail says what it normalised to', () => {
    const result = validateUpload({
      contentType: 'image/gif; charset=utf-8',
      bytes: 1024,
      maxBytes: LIMIT,
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a refusal')
    expect(result.reason).toBe('unsupported-content-type')
    expect(result.detail).toContain('image/gif; charset=utf-8')
    expect(result.detail).toContain('normalised to "image/gif"')
  })

  test('a type with no type/subtype shape is refused, never coerced into a supported one', () => {
    for (const contentType of ['', '   ', ';charset=utf-8', 'jpeg', 'image/', '/jpeg']) {
      const result = validateUpload({ contentType, bytes: 1024, maxBytes: LIMIT })
      expect(result, `"${contentType}" must be refused`).toEqual({
        ok: false,
        reason: 'unsupported-content-type',
        detail: expect.stringContaining('not an accepted type'),
      })
    }
  })

  test("a zero-byte file is refused 'empty' with the count in the detail", () => {
    const result = validateUpload({ contentType: 'image/jpeg', bytes: 0, maxBytes: LIMIT })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a refusal')
    expect(result.reason).toBe('empty')
    expect(result.detail).toContain('0 bytes')
  })

  test("a negative byte count is refused 'empty' and names the value", () => {
    const result = validateUpload({ contentType: 'image/jpeg', bytes: -1, maxBytes: LIMIT })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a refusal')
    expect(result.reason).toBe('empty')
    expect(result.detail).toContain('-1')
  })

  test('a fractional or non-finite byte count can never read as a valid upload', () => {
    for (const bytes of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = validateUpload({ contentType: 'image/jpeg', bytes, maxBytes: LIMIT })
      expect(result.ok, `bytes=${bytes} must not be accepted`).toBe(false)
      if (result.ok) throw new Error('expected a refusal')
      expect(result.reason).toBe('empty')
    }
  })
})

describe('validateUpload — the limit is the caller’s, and a broken one is a caller bug', () => {
  test("maxBytes 0 is refused 'too-large' and the detail says the limit is invalid", () => {
    const result = validateUpload({ contentType: 'image/jpeg', bytes: 1024, maxBytes: 0 })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a refusal')
    expect(result.reason).toBe('too-large')
    expect(result.detail).toContain('maxBytes is 0')
    expect(result.detail).toContain('invalid')
  })

  test('no byte count reaches ok: true against a zero or negative limit', () => {
    for (const maxBytes of [0, -1]) {
      for (const bytes of [1, 1024, Number.NaN, Number.POSITIVE_INFINITY]) {
        const result = validateUpload({ contentType: 'image/jpeg', bytes, maxBytes })
        expect(result.ok, `bytes=${bytes} maxBytes=${maxBytes} must be refused`).toBe(false)
      }
    }
  })

  test('a non-finite or fractional limit is refused as invalid, never treated as unlimited', () => {
    for (const maxBytes of [Number.POSITIVE_INFINITY, Number.NaN, 1.5]) {
      const result = validateUpload({ contentType: 'image/jpeg', bytes: 1024, maxBytes })
      expect(result.ok, `maxBytes=${maxBytes} must be refused`).toBe(false)
      if (result.ok) throw new Error('expected a refusal')
      expect(result.reason).toBe('too-large')
      expect(result.detail).toContain('the size limit itself is invalid')
    }
  })

  test('the same file is accepted or refused purely by the caller’s limit — no hidden default', () => {
    const small = validateUpload({ contentType: 'image/webp', bytes: 5_000, maxBytes: 4_999 })
    const large = validateUpload({ contentType: 'image/webp', bytes: 5_000, maxBytes: 5_000 })
    expect(small).toEqual({
      ok: false,
      reason: 'too-large',
      detail: expect.stringContaining('4999'),
    })
    expect(large).toEqual({ ok: true, contentType: 'image/webp' })
  })
})

describe('assertUploadAllowed — a caller cannot forget to check', () => {
  test('returns the normalised type for an acceptance', () => {
    const accepted: SupportedContentType = assertUploadAllowed({
      contentType: 'IMAGE/JPEG; charset=utf-8',
      bytes: 4096,
      maxBytes: LIMIT,
    })
    expect(accepted).toBe('image/jpeg')
  })

  test('throws an Error carrying both the reason and the detail for a refusal', () => {
    const refusal = validateUpload({ contentType: 'application/pdf', bytes: 10, maxBytes: LIMIT })
    expect(refusal.ok).toBe(false)
    if (refusal.ok) throw new Error('expected a refusal')

    const error = errorFrom(() =>
      assertUploadAllowed({ contentType: 'application/pdf', bytes: 10, maxBytes: LIMIT }),
    )
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('upload refused [unsupported-content-type]')
    expect(error.message).toContain(refusal.detail)
  })

  test('throws with the too-large reason and the limit in the message', () => {
    const error = errorFrom(() =>
      assertUploadAllowed({ contentType: 'image/png', bytes: LIMIT + 1, maxBytes: LIMIT }),
    )
    expect(error.message).toContain('too-large')
    expect(error.message).toContain(String(LIMIT))
  })

  test('throws for an invalid limit rather than returning a type', () => {
    expect(() => assertUploadAllowed({ contentType: 'image/png', bytes: 1, maxBytes: 0 })).toThrow(
      /too-large[\s\S]*invalid/,
    )
  })
})

describe('validate.ts — one question, nothing else', () => {
  test('exports exactly the two documented functions and nothing storage-shaped', () => {
    // This module must issue no URL and touch no storage (209.A7); the export
    // surface is the cheapest place to notice a leak of either.
    expect(Object.keys(validateModule).sort()).toEqual(['assertUploadAllowed', 'validateUpload'])
  })
})
