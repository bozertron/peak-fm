/**
 * tests/storage/local-store.test.ts — PEAK-209 unit 4 of 6: the local-disk test
 * seam and the properties the ticket demands of a signed upload URL.
 *
 * WHAT THIS FILE PROVES, and the assertion that proves it:
 *   1. a signed URL opens exactly once, and the key it returns is the key its
 *      publicUrl resolves to                              → keyFromUrl round trip
 *   2. the second use of that URL is refused               → reason 'signature-already-used'
 *   3. an expired URL is refused, judged by the INJECTED clock, without sleeping
 *                                                          → reason 'signature-expired'
 *      and an expired URL spends no nonce and writes nothing
 *   4. an edited signature, an edited payload, and a payload signed with the
 *      wrong secret are all refused                        → reason 'signature-invalid'
 *   5. a type other than the signed one is refused          → reason 'unsupported-content-type'
 *   6. a key with a path separator, and a key containing '..', are refused, and
 *      nothing appears outside the store root              → /path separator/, ENOENT
 *   7. delete() really removes the file from disk, is idempotent for a key that
 *      was never there, and refuses an escaping key        → stat() rejects / resolves
 *   8. listKeys() refuses to report a list that would hide a subdirectory or a
 *      symlink rather than dropping it silently      → /not a regular file/
 *
 * THE CLOCK IS AN ARGUMENT, NOT A SLEEP. Every timing assertion moves the injected
 * `now` forward. A `setTimeout`-based expiry test is slow when it passes and
 * passes for the wrong reason when the machine is loaded; moving the clock tests
 * the comparison the code actually performs.
 *
 * THE HOSTILE-URL CASE IS SIGNED ON PURPOSE. `createUploadUrl` only ever signs a
 * key it generated, so an escaping key cannot arrive through it. The test builds
 * the URL with the module's own `signUploadUrl` (the same function
 * `createUploadUrl` uses) so the signature is VALID and the containment guard in
 * `upload()` is the only thing that can refuse it. A test that forged an invalid
 * signature there would prove nothing.
 */

import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createLocalMediaStore,
  type LocalMediaStore,
  LocalMediaStoreError,
  type LocalMediaUploadPayload,
  signUploadUrl,
} from '@/lib/storage/local'

/** A real signing secret would never be a literal; this is a test seam, and it must be non-empty. */
const SIGNING_SECRET = 'peak-test-signing-secret-not-a-real-key'

/** Short enough to expire by moving the clock, long enough that no real time passes before the assertion. */
const URL_TTL_MS = 60_000

/** A minimal but real JPEG: SOI, an APP0/JFIF segment, EOI. Bytes are what is written, so they must be identifiable. */
const JPEG_BYTES = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
])

let root: string
let clock: number
let store: LocalMediaStore

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'peak-local-store-'))
  clock = Date.UTC(2026, 8, 19, 12, 0, 0)
  store = createLocalMediaStore({
    rootDir: root,
    signingSecret: SIGNING_SECRET,
    urlTtlMs: URL_TTL_MS,
    now: () => clock,
  })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/**
 * Await a call that MUST be refused and hand back the refusal, so a test can
 * assert the machine-readable reason as well as the message. A resolved call is a
 * failure here, not a passing assertion — that is the whole point of the helper.
 */
async function refusalOf(call: Promise<unknown>): Promise<LocalMediaStoreError> {
  try {
    await call
  } catch (error) {
    if (error instanceof LocalMediaStoreError) return error
    throw error
  }
  throw new Error('expected the call to be refused, but it resolved successfully')
}

/** Reads the signed payload straight out of the URL, so a test can edit exactly one field of it. */
function readSignedPayload(uploadUrl: string): LocalMediaUploadPayload {
  const encoded = new URL(uploadUrl).searchParams.get('p')
  if (encoded === null) throw new Error(`no "p" parameter in ${uploadUrl}`)
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as LocalMediaUploadPayload
}

/** The opposite direction, encoded the same way the URL carries it (this is transport, not signing). */
function encodePayload(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

describe('createLocalMediaStore — one signed URL, one upload', () => {
  it('opens a signed URL once and round-trips its key through keyFromUrl', async () => {
    const issued = await store.createUploadUrl({
      userId: 'user-1',
      contentType: 'image/jpeg',
      maxBytes: 4096,
    })

    // The upload URL and the read URL are different surfaces of the same object.
    expect(issued.uploadUrl).not.toBe(issued.publicUrl)
    expect(store.keyFromUrl(issued.uploadUrl)).toBeNull()
    expect(store.keyFromUrl(issued.publicUrl)).toBe(issued.key)

    const completed = await store.upload(issued.uploadUrl, JPEG_BYTES, 'image/jpeg')

    expect(completed.key).toBe(issued.key)
    expect(completed.publicUrl).toBe(issued.publicUrl)
    expect(store.keyFromUrl(completed.publicUrl)).toBe(issued.key)
    expect(await store.listKeys()).toEqual([issued.key])

    // The bytes really landed on disk under the root, byte for byte.
    const onDisk = await readFile(join(root, issued.key))
    expect(Uint8Array.from(onDisk)).toEqual(JPEG_BYTES)

    // keyFromUrl is shape-based: a URL this store never issued, but on its read
    // surface, still names a key; anything else names nothing.
    expect(store.keyFromUrl('https://local-media.test/media/other.jpg')).toBe('other.jpg')
    expect(store.keyFromUrl('https://elsewhere.test/media/other.jpg')).toBeNull()
    expect(store.keyFromUrl('https://local-media.test/other/other.jpg')).toBeNull()
    expect(store.keyFromUrl('https://local-media.test/media/other.jpg?v=2')).toBeNull()
    expect(store.keyFromUrl('not a url')).toBeNull()
    expect(store.keyFromUrl('https://local-media.test/media/..%2Fescape.jpg')).toBeNull()
  })

  it('refuses the second use of the same URL with signature-already-used', async () => {
    const issued = await store.createUploadUrl({
      userId: 'user-1',
      contentType: 'image/jpeg',
      maxBytes: 4096,
    })

    await store.upload(issued.uploadUrl, JPEG_BYTES, 'image/jpeg')

    const replay = await refusalOf(store.upload(issued.uploadUrl, JPEG_BYTES, 'image/jpeg'))
    expect(replay.reason).toBe('signature-already-used')
    expect(replay.message).toContain('signature-already-used')
    expect(replay.message).toContain('single use')

    // The replay did not overwrite or duplicate anything.
    expect(await store.listKeys()).toEqual([issued.key])
  })

  it('refuses a URL whose signed lifetime has passed with signature-expired', async () => {
    const issued = await store.createUploadUrl({
      userId: 'user-1',
      contentType: 'image/jpeg',
      maxBytes: 4096,
    })
    const expiresAt = readSignedPayload(issued.uploadUrl).expiresAt
    expect(expiresAt).toBe(clock + URL_TTL_MS)

    // expiresAt is the first instant of refusal, so landing exactly on it must be too late.
    clock = expiresAt

    const expired = await refusalOf(store.upload(issued.uploadUrl, JPEG_BYTES, 'image/jpeg'))
    expect(expired.reason).toBe('signature-expired')
    expect(expired.message).toContain('signature-expired')
    expect(expired.message).toContain(new Date(expiresAt).toISOString())

    // An expired attempt is refused BEFORE the nonce is claimed, and writes nothing.
    expect(await store.listKeys()).toEqual([])

    // A freshly issued URL, one millisecond earlier in its lifetime, still works —
    // so the refusal above is the deadline and not a broken store.
    clock = expiresAt - URL_TTL_MS
    const fresh = await store.createUploadUrl({
      userId: 'user-1',
      contentType: 'image/jpeg',
      maxBytes: 4096,
    })
    clock = readSignedPayload(fresh.uploadUrl).expiresAt - 1
    const completed = await store.upload(fresh.uploadUrl, JPEG_BYTES, 'image/jpeg')
    expect(completed.key).toBe(fresh.key)
  })

  it('refuses an edited signature, an edited payload, and a payload signed with the wrong secret', async () => {
    const issued = await store.createUploadUrl({
      userId: 'user-1',
      contentType: 'image/jpeg',
      maxBytes: 4096,
    })

    // (a) the tag itself, edited in place. The FIRST base64url group carries the
    //     top bits of the digest's first byte, so changing it cannot decode to the
    //     same bytes. The LAST group cannot be used for this: it carries only 4
    //     bits of the 32-byte digest, so substituting it can be a silent no-op (two
    //     chars differing only in the 2 padding bits decode identically) — which is
    //     the intermittent false pass this test was fixed to remove.
    const editedTag = new URL(issued.uploadUrl)
    const tag = editedTag.searchParams.get('s')
    if (tag === null) throw new Error('the issued URL carries no signature')
    const firstGroup = tag.slice(0, 1)
    editedTag.searchParams.set('s', `${firstGroup === 'A' ? 'B' : 'A'}${tag.slice(1)}`)
    expect(editedTag.searchParams.get('s')).not.toBe(tag)
    const badTag = await refusalOf(store.upload(editedTag.toString(), JPEG_BYTES, 'image/jpeg'))
    expect(badTag.reason).toBe('signature-invalid')
    expect(badTag.message).toContain('signature-invalid')

    // (a2) a tag of the wrong LENGTH. `timingSafeEqual` throws when the two buffers
    //      differ in size, so the lengths are compared first; a short tag must
    //      therefore be a refusal with a reason, never a RangeError escaping here.
    const shortTag = new URL(issued.uploadUrl)
    shortTag.searchParams.set('s', tag.slice(0, -1))
    const shortRefusal = await refusalOf(
      store.upload(shortTag.toString(), JPEG_BYTES, 'image/jpeg'),
    )
    expect(shortRefusal.reason).toBe('signature-invalid')
    expect(shortRefusal.message).toContain('signature-invalid')

    // (b) a valid signature over a payload whose size ceiling was raised afterwards.
    const payload = readSignedPayload(issued.uploadUrl)
    const editedPayload = new URL(issued.uploadUrl)
    editedPayload.searchParams.set('p', encodePayload({ ...payload, maxBytes: 1_000_000 }))
    const badPayload = await refusalOf(
      store.upload(editedPayload.toString(), JPEG_BYTES, 'image/jpeg'),
    )
    expect(badPayload.reason).toBe('signature-invalid')
    expect(badPayload.message).toContain('signature-invalid')

    // (c) a well-formed payload signed with a secret this store does not hold.
    const forged = signUploadUrl({
      signingSecret: 'a-different-secret',
      payload: { ...payload, nonce: 'nonce-forged' },
    })
    const badSecret = await refusalOf(store.upload(forged, JPEG_BYTES, 'image/jpeg'))
    expect(badSecret.reason).toBe('signature-invalid')
    expect(badSecret.message).toContain('signature-invalid')

    // None of the three refusals wrote anything, and none of them spent the real URL.
    expect(await store.listKeys()).toEqual([])
    const completed = await store.upload(issued.uploadUrl, JPEG_BYTES, 'image/jpeg')
    expect(completed.key).toBe(issued.key)
  })

  it('refuses a content type other than the signed one', async () => {
    const issued = await store.createUploadUrl({
      userId: 'user-1',
      contentType: 'image/jpeg',
      maxBytes: 4096,
    })

    const mismatch = await refusalOf(store.upload(issued.uploadUrl, JPEG_BYTES, 'image/png'))
    expect(mismatch.reason).toBe('unsupported-content-type')
    expect(mismatch.message).toContain('image/png')
    expect(mismatch.message).toContain('image/jpeg')
    expect(mismatch.message).toContain('unsupported-content-type')

    // A refused upload stores nothing: the type that was validated is the only one that may be written.
    expect(await store.listKeys()).toEqual([])
  })

  it('refuses an upload larger than the signed ceiling', async () => {
    const issued = await store.createUploadUrl({
      userId: 'user-1',
      contentType: 'image/jpeg',
      maxBytes: JPEG_BYTES.length,
    })

    // The boundary is inclusive: exactly the ceiling is allowed...
    const accepted = await store.upload(issued.uploadUrl, JPEG_BYTES, 'image/jpeg')
    expect(accepted.key).toBe(issued.key)

    // ...and one byte more is refused by the store itself, not merely by the caller.
    const oversized = await store.createUploadUrl({
      userId: 'user-1',
      contentType: 'image/jpeg',
      maxBytes: JPEG_BYTES.length - 1,
    })
    const tooLarge = await refusalOf(store.upload(oversized.uploadUrl, JPEG_BYTES, 'image/jpeg'))
    expect(tooLarge.reason).toBe('too-large')
    expect(tooLarge.message).toContain('too-large')
    expect(await store.listKeys()).toEqual([issued.key])
  })

  it("refuses a key with a path separator or '..', and writes nothing outside the root", async () => {
    // The directory a traversal would escape INTO is real and writable, so the only
    // reason nothing appears there can be the refusal.
    const parent = await stat(join(root, '..'))
    expect(parent.isDirectory()).toBe(true)

    const escapeName = `peak-escape-${String(process.pid)}-${Date.now()}.jpg`
    const outsidePath = join(root, '..', escapeName)

    // (a) a separator in the key: `../` would climb out of the root.
    const traversal = signUploadUrl({
      signingSecret: SIGNING_SECRET,
      payload: {
        key: `../${escapeName}`,
        userId: 'user-1',
        contentType: 'image/jpeg',
        maxBytes: 4096,
        expiresAt: clock + URL_TTL_MS,
        nonce: 'nonce-traversal',
      },
    })
    await expect(store.upload(traversal, JPEG_BYTES, 'image/jpeg')).rejects.toThrow(
      /path separator/,
    )
    await expect(stat(outsidePath)).rejects.toThrow(/ENOENT/)

    // (b) a key that is `..` without any separator: the other half of the same rule.
    const dotDot = signUploadUrl({
      signingSecret: SIGNING_SECRET,
      payload: {
        key: '..',
        userId: 'user-1',
        contentType: 'image/jpeg',
        maxBytes: 4096,
        expiresAt: clock + URL_TTL_MS,
        nonce: 'nonce-dotdot',
      },
    })
    await expect(store.upload(dotDot, JPEG_BYTES, 'image/jpeg')).rejects.toThrow(
      /must not contain "\.\."/,
    )

    // (c) delete() resolves a path too, so it refuses the same key rather than
    //     removing something outside the root.
    await expect(store.delete(`../${escapeName}`)).rejects.toThrow(/path separator/)

    // Nothing was written anywhere, inside or outside the root.
    expect(await store.listKeys()).toEqual([])
    await expect(stat(outsidePath)).rejects.toThrow(/ENOENT/)
  })

  it('deletes a stored object from disk, is idempotent, and never claims a key it never had', async () => {
    const issued = await store.createUploadUrl({
      userId: 'user-1',
      contentType: 'image/jpeg',
      maxBytes: 4096,
    })
    await store.upload(issued.uploadUrl, JPEG_BYTES, 'image/jpeg')

    const storedPath = join(root, issued.key)
    await expect(stat(storedPath)).resolves.toBeTruthy()

    await store.delete(issued.key)

    // The file is really gone from the filesystem, not merely from the listing.
    await expect(stat(storedPath)).rejects.toThrow(/ENOENT/)
    expect(await store.listKeys()).toEqual([])

    // Re-deleting is a no-op by design (the post-condition is "nothing at this
    // key"), and a key that was never there leaves the store unchanged.
    await expect(store.delete(issued.key)).resolves.toBeUndefined()
    await expect(store.delete('never-uploaded.jpg')).resolves.toBeUndefined()
    expect(await store.listKeys()).toEqual([])
  })

  it('refuses to report a key list that would hide something this store never wrote', async () => {
    const issued = await store.createUploadUrl({
      userId: 'user-1',
      contentType: 'image/jpeg',
      maxBytes: 4096,
    })
    await store.upload(issued.uploadUrl, JPEG_BYTES, 'image/jpeg')
    expect(await store.listKeys()).toEqual([issued.key])

    // A subdirectory is not something a flat-key store wrote. Skipping it would
    // make listKeys() — the orphan collector's view of what exists — disagree with
    // the filesystem, and it would report a nested path as a "key" that delete()
    // and keyFromUrl() both refuse (neither accepts a path separator).
    const nested = join(root, 'nested')
    await mkdir(nested)
    await writeFile(join(nested, 'stray.jpg'), JPEG_BYTES)
    await expect(store.listKeys()).rejects.toThrow(/not a regular file/)

    await rm(nested, { recursive: true, force: true })
    await symlink(join(root, issued.key), join(root, 'alias.jpg'))
    await expect(store.listKeys()).rejects.toThrow(/not a regular file/)

    // Remove the foreign entry and the real key is reported again, unchanged.
    await rm(join(root, 'alias.jpg'), { force: true })
    expect(await store.listKeys()).toEqual([issued.key])
  })
})
