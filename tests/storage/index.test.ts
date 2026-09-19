/**
 * tests/storage/index.test.ts — PEAK-209 unit 6 of 6: the RESOLVER, and the D3
 * honesty point.
 *
 * WHAT THIS FILE PROVES, and the assertion that proves it:
 *   1. in the test environment, with no override, `getMediaStore()` hands back a
 *      WORKING store — a URL is issued, bytes are uploaded through it, the object
 *      is readable at the path the module header documents, and `delete()` removes
 *      it                                        → readFile / listKeys / delete
 *   2. two calls in one process build one store            → `toBe` on two calls
 *   3. an unset variable outside a test THROWS, and the message names the missing
 *      variable, the accepted values and D3       → `toContain('PEAK_MEDIA_BACKEND')`,
 *                                                    `toContain('D3')`
 *   4. the three D3-blocked names throw, each naming ITSELF as unimplemented
 *                                                            → `it.each` over the three
 *   5. a value that is not one of the four names throws and lists the accepted
 *      values                                     → the literal accepted-values sentence
 *   6. case and surrounding whitespace are transport noise, not configuration
 *                                                            → `'  S3\t'` → `'s3'`
 *   7. a blank value is read as unset           → `configuredBackendName()` is null
 *   8. `configuredBackendName()` returns null for "not configured" and REFUSES a
 *      misspelled value rather than reporting null      → throw, not `toBeNull()`
 *   9. the explicit test override points the seam at the test's own directory, is
 *      cached per directory, and is REFUSED outside a test → readFile under the
 *      override dir, then a throw naming the override
 *  10. the reset is real: it clears the cache AND empties the root, and it refuses
 *      to run outside a test                        → a new instance with `listKeys()`
 *                                                      `[]`, then a throw
 *  11. `./types` is re-exported, so a caller imports the seam from one place
 *                                                            → identity of the tuple
 *  12. the ISSUING FUNCTION runs the gate BEFORE the store is asked (209.A2): a
 *      refused candidate never reaches a store, a valid one DOES ask the store
 *      exactly once for the NORMALISED type, and with no store injected an invalid
 *      candidate is refused by the gate rather than by the D3 resolution — so the
 *      store was demonstrably never even resolved       → `not.toHaveBeenCalled()`
 *                                              + `toHaveBeenCalledTimes(1)`
 *
 * THE ENVIRONMENT IS THE SUBJECT, SO IT IS RESTORED, NOT ASSUMED. Every test that
 * moves `NODE_ENV` or `PEAK_MEDIA_BACKEND` does it in its own body and the
 * `afterEach` puts the ambient values back BEFORE it resets — so nothing this file
 * sets can reach another file in the run. `vitest` starts a worker with
 * `process.env.NODE_ENV ??= "test"` (vitest 5.0.1,
 * node_modules/vitest/dist/chunks/cli-api.DcLieX4F.js:416), which is why the
 * default-path test below does not invent the environment it runs in: it asserts
 * against it, and fails with a sentence if a developer's shell exported NODE_ENV.
 *
 * THE MUTATION THIS FILE EXISTS TO KILL: make the unset branch resolve the local
 * store regardless of `NODE_ENV`, and test 3 fails. That mutation is the failure
 * mode of the whole unit — a production process handed a store that hands out
 * URLs on a reserved origin nothing can reach.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  configuredBackendName,
  createMediaUploadUrl,
  getMediaStore,
  MEDIA_BACKEND_NAMES,
  MediaBackendUnavailableError,
  type MediaBackendName,
  type MediaStore,
  resetMediaStoreForTests,
  SUPPORTED_CONTENT_TYPES,
} from '@/lib/storage'
import {
  LOCAL_MEDIA_BASE_URL,
  LocalMediaStoreError,
  type LocalMediaStore,
} from '@/lib/storage/local'
import { SUPPORTED_CONTENT_TYPES as FROM_TYPES_MODULE } from '@/lib/storage/types'

/** A minimal but real JPEG: SOI, an APP0/JFIF segment, EOI. Bytes are written, so they must be identifiable. */
const JPEG_BYTES = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
])

/** The three names whose adapters do not exist because the hosting decision behind them is D3. */
const D3_BLOCKED_BACKENDS: MediaBackendName[] = ['vercel-blob', 's3', 'r2']

/** The ambient environment, captured before this file changes anything. */
const AMBIENT_NODE_ENV = process.env.NODE_ENV
const AMBIENT_BACKEND = process.env.PEAK_MEDIA_BACKEND

/** Directories a test asked the resolver to use, removed after it. */
const createdRoots: string[] = []

/**
 * The sanctioned test root, exactly as `lib/storage/index.ts`'s header documents
 * it: one directory per process under the OS temp directory. Spelled out again
 * here ON PURPOSE — the `readFile` below then fails if the module moves its root
 * without moving the documented contract with it, which is the point of a pin.
 */
function documentedTestRootDir(): string {
  return join(tmpdir(), 'peak-media-test', String(process.pid))
}

/**
 * The default-path test may only claim to run "in the test environment" if the
 * process really is one. Rather than redefining `NODE_ENV` and testing its own
 * definition, this file says so and fails loudly when the ambient environment
 * disagrees — the resolver's whole contract is keyed on that value.
 */
function assertTestEnvironment(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      'tests/storage/index.test.ts must run with NODE_ENV=test (got ' +
        `${JSON.stringify(process.env.NODE_ENV ?? null)}). Unset NODE_ENV in the shell and re-run: the ` +
        'local test seam resolves only in a test environment, which is the behaviour under test.',
    )
  }
}

/**
 * Sets, or with `undefined` unsets, one of the two variables this file moves.
 *
 * `@types/node` declares `process.env.NODE_ENV` READ-ONLY, but moving the
 * environment is the whole point of this file: the resolver's contract is keyed
 * on it. So the write is widened to the index signature every consumer of
 * `process.env` already has (structurally the same door `vi.stubEnv` uses), and
 * the only property this file never writes through is the read-only literal.
 * Nothing is weakened here — the variable is written and then put back.
 */
function writeEnv(name: 'NODE_ENV' | 'PEAK_MEDIA_BACKEND', value: string | undefined): void {
  const env: Record<string, string | undefined> = process.env
  if (value === undefined) delete env[name]
  else env[name] = value
}

/**
 * Await a refusal and hand it back as an Error, so a test can assert the message.
 * A call that returns is a failure here, not a passing assertion — that is the
 * whole point of the helper.
 */
function errorOf(call: () => unknown): Error {
  try {
    call()
  } catch (error) {
    if (error instanceof Error) return error
    throw new Error(`expected the resolver to refuse with an Error, but it threw ${String(error)}`)
  }
  throw new Error('expected the resolver to refuse, but it returned a value instead')
}

/** The same, narrowed to the module's named refusal type — so the reason is asserted as data, not only as text. */
function refusalOf(call: () => unknown): MediaBackendUnavailableError {
  const error = errorOf(call)
  if (!(error instanceof MediaBackendUnavailableError)) {
    throw new Error(`expected a MediaBackendUnavailableError, got ${error.name}: ${error.message}`)
  }
  return error
}

/**
 * `MediaStore` deliberately has no `upload()`: completing an upload is the
 * backend's business over HTTP, and the local seam — which has no HTTP endpoint —
 * completes one in-process. So a test that wants to finish an upload narrows the
 * resolved store, and it ASSERTS the shape at runtime rather than casting blindly:
 * if the resolver ever stops handing out the local seam in a test, this fails with
 * a sentence instead of a TypeError three lines later.
 */
function isLocalSeam(store: MediaStore): store is LocalMediaStore {
  const candidate = store as Partial<LocalMediaStore>
  return (
    typeof candidate.upload === 'function' &&
    typeof candidate.keyFromUrl === 'function' &&
    typeof candidate.listKeys === 'function'
  )
}

function requireLocalSeam(store: MediaStore): LocalMediaStore {
  if (!isLocalSeam(store)) {
    throw new Error(
      'expected getMediaStore() in the test environment to resolve the local test seam, which is the ' +
        'only store in this repository that can complete an upload without an HTTP endpoint',
    )
  }
  return store
}

beforeEach(() => {
  assertTestEnvironment()
  writeEnv('PEAK_MEDIA_BACKEND', undefined)
})

afterEach(async () => {
  // Restore FIRST: the reset below requires the test environment, and restoring
  // before it is what keeps one test's `NODE_ENV` from reaching the next file.
  writeEnv('NODE_ENV', AMBIENT_NODE_ENV)
  writeEnv('PEAK_MEDIA_BACKEND', AMBIENT_BACKEND)
  resetMediaStoreForTests()
  for (const root of createdRoots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
})

describe('getMediaStore — the sanctioned test path', () => {
  it('resolves the local test seam with no override, and uploads a real object through it', async () => {
    const store = getMediaStore()

    // Two calls in one process build one store, and the second is the same object.
    expect(getMediaStore()).toBe(store)

    const issued = await store.createUploadUrl({
      userId: 'user-1',
      contentType: 'image/jpeg',
      maxBytes: 4096,
    })

    // The URL a client would be handed points at the seam's own reserved origin —
    // which is exactly why this store cannot serve a deployment.
    expect(new URL(issued.uploadUrl).origin).toBe(new URL(LOCAL_MEDIA_BASE_URL).origin)

    const seam = requireLocalSeam(store)
    const completed = await seam.upload(issued.uploadUrl, JPEG_BYTES, 'image/jpeg')
    expect(completed.key).toBe(issued.key)
    expect(seam.keyFromUrl(completed.publicUrl)).toBe(issued.key)
    expect(await seam.listKeys()).toContain(issued.key)

    // The bytes really are on disk at the path the module header documents: one
    // directory per process, and inside the OS temp directory rather than anywhere
    // in the repository.
    expect(relative(tmpdir(), documentedTestRootDir()).startsWith('..')).toBe(false)
    expect(Uint8Array.from(await readFile(join(documentedTestRootDir(), issued.key)))).toEqual(
      JPEG_BYTES,
    )

    // And what came back is a working MediaStore, not only a URL minter.
    await store.delete(issued.key)
    expect(await seam.listKeys()).toEqual([])
  })

  it('points the seam at an explicit directory when a test names one, and refuses that override outside a test', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'peak-index-override-'))
    createdRoots.push(rootDir)

    const store = getMediaStore({ rootDir })
    // The override is cached per directory: asking twice does not build two stores.
    expect(getMediaStore({ rootDir })).toBe(store)

    const seam = requireLocalSeam(store)
    const issued = await store.createUploadUrl({
      userId: 'user-2',
      contentType: 'image/png',
      maxBytes: 4096,
    })
    await seam.upload(issued.uploadUrl, JPEG_BYTES, 'image/png')

    // The bytes went to the directory the test named, not to the default root.
    expect(Uint8Array.from(await readFile(join(rootDir, issued.key)))).toEqual(JPEG_BYTES)
    expect(await seam.listKeys()).toEqual([issued.key])

    // Outside a test the override is refused: it is precisely the hole through
    // which a production process could be handed a store it did not configure.
    writeEnv('NODE_ENV', 'production')
    const refusal = errorOf(() => getMediaStore({ rootDir }))
    expect(refusal.message).toContain('override')
    expect(refusal.message).toContain('NODE_ENV')
    expect(refusal.message).toContain('production')
  })

  it('refuses an override that names no directory', () => {
    const refusal = errorOf(() => getMediaStore({ rootDir: '   ' }))
    expect(refusal.message).toContain('non-empty string')
  })

  it('resetMediaStoreForTests clears the cache and empties the root, and refuses to run outside a test', async () => {
    const first = requireLocalSeam(getMediaStore())
    const issued = await first.createUploadUrl({
      userId: 'user-1',
      contentType: 'image/jpeg',
      maxBytes: 4096,
    })
    await first.upload(issued.uploadUrl, JPEG_BYTES, 'image/jpeg')
    expect(await first.listKeys()).toEqual([issued.key])

    resetMediaStoreForTests()

    const second = getMediaStore()
    expect(second).not.toBe(first)
    expect(await requireLocalSeam(second).listKeys()).toEqual([])

    // A reset that ran outside a test could only swap the store under a live
    // caller, so it refuses.
    writeEnv('NODE_ENV', 'production')
    expect(errorOf(() => resetMediaStoreForTests()).message).toContain('NODE_ENV')
  })
})

describe('getMediaStore — D3 stays loud', () => {
  it('throws when the variable is unset outside a test, naming the variable, the values, and D3', () => {
    writeEnv('PEAK_MEDIA_BACKEND', undefined)
    writeEnv('NODE_ENV', 'production')

    const refusal = refusalOf(() => getMediaStore())
    expect(refusal.backend).toBeNull()
    expect(refusal.message).toContain('PEAK_MEDIA_BACKEND')
    expect(refusal.message).toContain('is not set')
    expect(refusal.message).toContain(
      'Accepted values for PEAK_MEDIA_BACKEND: local, vercel-blob, s3, r2',
    )
    expect(refusal.message).toContain('D3')
    expect(refusal.message).toContain('OPEN-DECISIONS.md')
  })

  it('refuses PEAK_MEDIA_BACKEND=local outside a test, and says why it is not a backend', () => {
    writeEnv('PEAK_MEDIA_BACKEND', 'local')
    writeEnv('NODE_ENV', 'production')

    const refusal = refusalOf(() => getMediaStore())
    expect(refusal.backend).toBe('local')
    expect(refusal.message).toContain('local')
    expect(refusal.message).toContain('TEST SEAM')
    expect(refusal.message).toContain(LOCAL_MEDIA_BASE_URL)
    expect(refusal.message).toContain('D3')
  })

  it.each(D3_BLOCKED_BACKENDS)(
    'refuses %s by name, as not yet implemented, and points at D3',
    (name) => {
      writeEnv('PEAK_MEDIA_BACKEND', name)

      // Note the environment: this refusal does not depend on NODE_ENV. There is
      // no adapter to build in a test either, so the test environment is not a
      // licence to fake one.
      expect(process.env.NODE_ENV).toBe('test')

      const refusal = refusalOf(() => getMediaStore())
      expect(refusal.backend).toBe(name)
      expect(refusal.message).toContain(`no ${name} adapter exists yet`)
      expect(refusal.message).toContain('D3')
      expect(refusal.message).toContain('OPEN-DECISIONS.md')
    },
  )

  it('refuses a value that is not one of the four names, listing the accepted values', () => {
    expect(MEDIA_BACKEND_NAMES).toEqual(['local', 'vercel-blob', 's3', 'r2'])

    writeEnv('PEAK_MEDIA_BACKEND', 'dropbox')

    const refusal = refusalOf(() => getMediaStore())
    expect(refusal.backend).toBeNull()
    expect(refusal.message).toContain('"dropbox"')
    expect(refusal.message).toContain(
      'Accepted values for PEAK_MEDIA_BACKEND: local, vercel-blob, s3, r2',
    )
  })
})

describe('configuredBackendName — one parser, so it cannot disagree with the resolver', () => {
  it('reports null when nothing is configured, and refuses a misspelled value rather than reporting null', () => {
    writeEnv('PEAK_MEDIA_BACKEND', undefined)
    expect(configuredBackendName()).toBeNull()

    // "unconfigured" (D3 is open) and "misspelled" (a deployment typo) need
    // different fixes, so they must not read alike.
    writeEnv('PEAK_MEDIA_BACKEND', 'blob')
    const refusal = refusalOf(configuredBackendName)
    expect(refusal.backend).toBeNull()
    expect(refusal.message).toContain('Accepted values for PEAK_MEDIA_BACKEND')
  })

  it('normalises case and surrounding whitespace, and does not depend on the environment', () => {
    writeEnv('PEAK_MEDIA_BACKEND', '  S3\t')
    expect(configuredBackendName()).toBe('s3')
    expect(refusalOf(() => getMediaStore()).message).toContain('no s3 adapter exists yet')

    writeEnv('PEAK_MEDIA_BACKEND', ' LOCAL ')
    expect(configuredBackendName()).toBe('local')
    // In a test environment 'local' IS the seam, so naming it resolves the same
    // store the unset variable does.
    expect(getMediaStore()).toBe(getMediaStore())
  })

  it('reads a blank value as unset, in both directions', () => {
    writeEnv('PEAK_MEDIA_BACKEND', '   ')
    expect(configuredBackendName()).toBeNull()
    expect(getMediaStore()).toBe(getMediaStore())

    writeEnv('NODE_ENV', 'production')
    expect(errorOf(() => getMediaStore()).message).toContain('is not set')
  })
})

describe('the seam is importable from one place', () => {
  it('re-exports ./types, so a caller does not reach past the index', () => {
    expect(SUPPORTED_CONTENT_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp'])
    // Identity, not just equality: the index re-exports the tuple, it does not copy it.
    expect(SUPPORTED_CONTENT_TYPES).toBe(FROM_TYPES_MODULE)
  })
})

/* ──────────── the issuing function: the gate first, the store second ───────────── */

/**
 * A store that RECORDS what it was asked. Bar 209.A2 demands that "the store is
 * never asked for a URL when validation fails (assert no store call happened)", and
 * a recording store is what turns that into an assertion rather than a hope. The
 * URL it returns points at a reserved `.test` origin nothing ever fetches, so the
 * stand-in can never be mistaken for a backend.
 */
function recordingStore() {
  const createUploadUrl = vi.fn<
    (input: { userId: string; contentType: string; maxBytes: number }) => Promise<{
      uploadUrl: string
      publicUrl: string
      key: string
    }>
  >(async () => ({
    uploadUrl: 'https://recording-store.test/upload?sig=stand-in',
    publicUrl: 'https://recording-store.test/media/stand-in.jpg',
    key: 'stand-in.jpg',
  }))
  const deletedKeys: string[] = []
  const deleteKey = vi.fn<(key: string) => Promise<void>>(async (key: string) => {
    deletedKeys.push(key)
  })
  const store: MediaStore = { createUploadUrl, delete: deleteKey }
  return { store, createUploadUrl, deleteKey, deletedKeys }
}

/** A real product limit, and a candidate well inside it, so the limit is the caller's and not a default. */
const ISSUE_LIMIT = 10_000_000
const VALID_REQUEST = {
  userId: 'seller-1',
  contentType: 'image/jpeg',
  bytes: 2048,
  maxBytes: ISSUE_LIMIT,
}

describe('createMediaUploadUrl — the gate runs BEFORE the store is asked (209.A2)', () => {
  it.each([
    ['an oversized file', { ...VALID_REQUEST, bytes: ISSUE_LIMIT + 1 }, /upload refused \[too-large\]/],
    [
      'an unsupported content type',
      { ...VALID_REQUEST, contentType: 'application/pdf' },
      /upload refused \[unsupported-content-type\]/,
    ],
    ['a zero-byte file', { ...VALID_REQUEST, bytes: 0 }, /upload refused \[empty\]/],
    [
      'a limit that is not a positive whole number of bytes',
      { ...VALID_REQUEST, maxBytes: 0 },
      /upload refused \[too-large\][\s\S]*invalid/,
    ],
  ])('refuses %s without ever asking the store for a URL', async (_case, request, refusal) => {
    const { store, createUploadUrl, deleteKey, deletedKeys } = recordingStore()

    // The refusal is the GATE's: `upload refused [<reason>]: <detail>` comes from
    // `assertUploadAllowed`, which means the store was not the thing that refused.
    await expect(createMediaUploadUrl(request, store)).rejects.toThrow(refusal)

    // THE ASSERTION 209.A2 ASKS FOR: no URL was ever requested, and no object was
    // ever deleted, because the store was never reached.
    expect(createUploadUrl).not.toHaveBeenCalled()
    expect(deleteKey).not.toHaveBeenCalled()
    expect(deletedKeys).toEqual([])
  })

  it('positive control: a valid candidate DOES ask the store exactly once, for the normalised type', async () => {
    const { store, createUploadUrl, deleteKey } = recordingStore()

    const issued = await createMediaUploadUrl(
      { ...VALID_REQUEST, contentType: 'IMAGE/JPEG; charset=utf-8' },
      store,
    )

    // The store's answer is what is returned — the issuing function mints nothing itself.
    expect(issued).toEqual({
      uploadUrl: 'https://recording-store.test/upload?sig=stand-in',
      publicUrl: 'https://recording-store.test/media/stand-in.jpg',
      key: 'stand-in.jpg',
    })
    // Without this control the `not.toHaveBeenCalled()` assertions above would also
    // pass for an implementation that never calls a store at all.
    expect(createUploadUrl).toHaveBeenCalledTimes(1)
    expect(deleteKey).not.toHaveBeenCalled()
    // The store is signed for the type that was VALIDATED, not the raw client string,
    // and `bytes` is deliberately not part of the store call: the ceiling travels
    // inside the signed payload, the claimed size is the gate's business.
    expect(createUploadUrl.mock.calls[0]?.[0]).toEqual({
      userId: 'seller-1',
      contentType: 'image/jpeg',
      maxBytes: ISSUE_LIMIT,
    })
  })

  it('resolves the store only AFTER the gate — with no store injected, an invalid candidate is refused by the gate, not by D3', async () => {
    // A production-shaped environment with NO backend configured: `getMediaStore()`
    // throws here, so if the store were resolved before the gate this candidate would
    // be refused for D3 instead. These two refusals name the GATE's reasons, which is
    // only possible if the gate answered before any resolution happened.
    writeEnv('PEAK_MEDIA_BACKEND', undefined)
    writeEnv('NODE_ENV', 'production')

    await expect(
      createMediaUploadUrl({ ...VALID_REQUEST, bytes: ISSUE_LIMIT + 1 }),
    ).rejects.toThrow(/upload refused \[too-large\]/)
    await expect(
      createMediaUploadUrl({ ...VALID_REQUEST, contentType: 'application/pdf' }),
    ).rejects.toThrow(/upload refused \[unsupported-content-type\]/)

    // The contrast that makes the two assertions above mean something: the SAME
    // environment, with a candidate that passes the gate, reaches the resolver and
    // gets the resolver's D3 refusal. So the gate really did run first, and the
    // store really is unreachable for an invalid candidate.
    const refusedByResolver = await createMediaUploadUrl(VALID_REQUEST).catch(
      (error: unknown) => error,
    )
    expect(refusedByResolver).toBeInstanceOf(MediaBackendUnavailableError)
    if (!(refusedByResolver instanceof MediaBackendUnavailableError)) {
      throw new Error('expected the resolver to refuse, so the contrast above is real')
    }
    expect(refusedByResolver.backend).toBeNull()
    expect(refusedByResolver.message).toContain('PEAK_MEDIA_BACKEND')
    expect(refusedByResolver.message).toContain('D3')
  })

  it('issues a working URL through the REAL resolved store, and a refusal through that same path never reaches the store’s own checks', async () => {
    // No store injected on purpose: this is the call a surface makes.
    const issued = await createMediaUploadUrl({ ...VALID_REQUEST, contentType: 'IMAGE/JPEG' })
    const seam = requireLocalSeam(getMediaStore())

    expect(new URL(issued.uploadUrl).origin).toBe(new URL(LOCAL_MEDIA_BASE_URL).origin)
    const completed = await seam.upload(issued.uploadUrl, JPEG_BYTES, 'image/jpeg')
    expect(completed.key).toBe(issued.key)
    expect(await seam.listKeys()).toEqual([issued.key])

    // An oversized candidate is refused by the GATE. The store cannot even see the
    // claimed size (the ticket's `createUploadUrl` takes no `bytes`), so a refusal
    // here is only possible if validation ran first.
    await expect(createMediaUploadUrl({ ...VALID_REQUEST, bytes: ISSUE_LIMIT + 1 })).rejects.toThrow(
      /upload refused \[too-large\][\s\S]*exceeds the/,
    )
    expect(await seam.listKeys()).toEqual([issued.key])

    // And an unsupported type is refused with `validate.ts`'s wording rather than the
    // store's own ('is not a type this store issues keys for') and is NOT a
    // `LocalMediaStoreError` — direct evidence that the store's own content-type
    // check never ran, because the store was never asked.
    const refusal = await createMediaUploadUrl({
      ...VALID_REQUEST,
      contentType: 'application/pdf',
    }).catch((error: unknown) => error)
    expect(refusal).toBeInstanceOf(Error)
    if (!(refusal instanceof Error)) throw new Error('expected the gate to refuse with an Error')
    expect(refusal).not.toBeInstanceOf(LocalMediaStoreError)
    expect(refusal.message).toContain('is not an accepted type')
    expect(refusal.message).not.toContain('is not a type this store issues keys for')
  })
})
