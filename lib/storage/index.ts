/**
 * lib/storage/index.ts — PEAK-209 unit 6 of 6: THE RESOLVER.
 *
 * This is the wiring point for the whole storage seam, and the one file in the
 * repository that has to stay honest about **D3**. The backend cannot be chosen
 * until the hosting target is decided (Vercel Blob, S3 and R2 each imply a
 * different host, different URL shape and different credentials), so this module
 * has two jobs and no third one:
 *
 *   1. resolve the configured backend when — and only when — one can actually be
 *      built today; and
 *   2. make every case where it cannot a LOUD, actionable refusal that names the
 *      reason, rather than a fallback that would ship a store nobody configured.
 *
 * It exports exactly the ticket's surface: `getMediaStore()`,
 * `createMediaUploadUrl()` (the issuing function — the gate from `./validate` runs
 * BEFORE the store is asked, which is 209.A2), `configuredBackendName()`, the closed
 * `MediaBackendName` vocabulary, and a re-export of `./types` so a caller imports
 * the seam from one place.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY AN UNSET VARIABLE IS AN ERROR AND NOT A FALLBACK
 * ─────────────────────────────────────────────────────────────────────────────
 * `PEAK_MEDIA_BACKEND` unset means the operator has not said where bytes live,
 * because D3 has not been answered. Falling back to anything would be doctrine
 * rule 3: production behaviour that stands in for a decision nobody made. So an
 * unset variable outside a test THROWS, and the message names the variable, the
 * accepted values and D3 — the next reader must learn *why* this is unimplemented
 * rather than suspect a bug and "fix" it with a default.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `local` IS REFUSED OUTSIDE A TEST TOO
 * ─────────────────────────────────────────────────────────────────────────────
 * `./local.ts` is a TEST SEAM, not a backend, and that is a fact about the code
 * rather than a preference:
 *
 *   - it issues upload URLs on `https://local-media.test` — `.test` is reserved
 *     by RFC 2606 §2 / RFC 6761 §6.2, so no browser can ever resolve it; and
 *   - completing an upload means calling `upload()`, a METHOD. Nothing in this
 *     app serves an HTTP endpoint those URLs point at, so a deployment handed a
 *     local store would mint URLs no client could ever complete.
 *
 * A store that cannot store a seller's photo is the definition of a fake in a
 * real code path, so naming it explicitly (`PEAK_MEDIA_BACKEND=local`) does not
 * make it deployable: it resolves only under `NODE_ENV === 'test'`. This is the
 * narrowest reading of the ticket's "NEVER silently return the local store
 * outside a test", and it is the one that cannot ship a non-functional store.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SANCTIONED TEST PATH, AND ONLY THAT PATH
 * ─────────────────────────────────────────────────────────────────────────────
 * When `NODE_ENV === 'test'` and no override is given, the resolver builds the
 * local seam rooted at
 *
 *     <os temp dir>/peak-media-test/<pid>
 *
 * — one directory per process, so two concurrent test runs can never share a
 * root, and every path a run writes is inside the OS temp directory. Three
 * details of that construction are deliberate:
 *
 *   - the directory is emptied when the seam is first resolved, because a crashed
 *     earlier run whose pid has been reused must not make this run's
 *     `listKeys()` report another run's bytes;
 *   - the HMAC key is `randomBytes(32)`, generated per process and never
 *     configured. A constant in `lib/` is a key that ships to production and that
 *     a test could unwittingly depend on; a per-process random secret means a URL
 *     minted in one process is refused by another, which is the property a
 *     signing secret exists to provide;
 *   - the URL lifetime is a constant of the TEST SEAM (5 minutes), not product
 *     policy: no user ever holds one of these URLs, and `maxBytes` — the policy
 *     that does reach a user — stays a required caller argument, unchanged.
 *
 * `resetMediaStoreForTests()` clears the resolved instances and empties that root.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CACHING, AND WHAT THE CACHE IS KEYED ON
 * ─────────────────────────────────────────────────────────────────────────────
 * A resolved store is cached under the configuration that produced it (backend,
 * node env, directory), so two calls in one process build one store — and a
 * process whose configuration CHANGES cannot be handed a store built for the old
 * one. Outside a test nothing reaches the cache at all: every deployable path in
 * this wave throws before a store exists.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `configuredBackendName()` THROWS ON A MISSPELLED VALUE
 * ─────────────────────────────────────────────────────────────────────────────
 * It returns `null` when nothing is configured — "D3 is still open" — and it
 * REFUSES a value that is not one of the four names, because "unconfigured" and
 * "misspelled" need different fixes and reporting both as `null` would hide a
 * deployment typo behind a decision that has not been made. It routes through the
 * same parser `getMediaStore()` uses, so the two can never disagree about what a
 * value means.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SERVER-ONLY, ON PURPOSE
 * ─────────────────────────────────────────────────────────────────────────────
 * This module reads `process.env` and reaches `node:crypto`/`node:fs` through
 * `./local`. A `'use client'` file that imports it will fail the build, and that
 * failure is correct: bytes never pass through the client bundle. A client that
 * needs the vocabulary (formats, refusal reasons) imports `@/lib/storage/types`,
 * which is types-only and has no runtime dependencies.
 */

import { randomBytes } from 'node:crypto'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
/*
 * The one import of the test seam outside `tests/`, and it exists because the
 * ticket requires the resolver to hand a test a working store. It is reached only
 * from the `NODE_ENV === 'test'` branches below; every other path throws before a
 * store is built. No other module outside `tests/` may import `./local`.
 */
import { createLocalMediaStore, LOCAL_MEDIA_BASE_URL } from './local'
import type { MediaStore } from './types'
import { assertUploadAllowed } from './validate'

export * from './types'

/** The closed vocabulary of backend names. One source of truth for the type, the parser and the refusal text. */
export const MEDIA_BACKEND_NAMES = ['local', 'vercel-blob', 's3', 'r2'] as const

export type MediaBackendName = (typeof MEDIA_BACKEND_NAMES)[number]

/** The variable that names the backend. Never defaulted: an unset variable is a decision, not a typo to paper over. */
const BACKEND_ENV_VAR = 'PEAK_MEDIA_BACKEND'

/**
 * D3's cause, stated once so every refusal that is D3's fault says it the same
 * way — and so the reader learns the reason instead of assuming a bug.
 */
const D3_NOTE =
  'D3 (the hosting target — Vercel, a container host, or something else) is undecided, and it is what ' +
  'picks the media backend, so no backend has been chosen: see tickets/peak-cloud/OPEN-DECISIONS.md, D3.'

/**
 * A backend that cannot be resolved, with the reason as data. `backend` is the
 * name that failed, or `null` when no value named one (unset, or a value that is
 * not a backend at all), so a caller can branch without parsing the message.
 */
export class MediaBackendUnavailableError extends Error {
  readonly backend: MediaBackendName | null

  constructor(backend: MediaBackendName | null, detail: string, options?: { cause?: unknown }) {
    super(detail, options)
    this.name = 'MediaBackendUnavailableError'
    this.backend = backend
  }
}

/* ───────────────────────────── reading the value ──────────────────────────── */

/**
 * The configured value, or `null` when the variable is UNSET OR BLANK.
 *
 * A blank value is what a half-filled `.env` looks like (`PEAK_MEDIA_BACKEND=`),
 * and it carries no more information than an absent line, so the two are read
 * alike — in a test that means the sanctioned seam, outside one it means the D3
 * refusal. Anything else is returned as written and judged by `requireBackendName`.
 */
function rawBackendValue(): string | null {
  const raw = process.env[BACKEND_ENV_VAR]
  if (raw === undefined) return null
  return raw.trim() === '' ? null : raw
}

/** Narrowing membership test: the tuple is `as const`, so this is where a string becomes a `MediaBackendName`. */
function isMediaBackendName(value: string): value is MediaBackendName {
  return (MEDIA_BACKEND_NAMES as readonly string[]).includes(value)
}

/** The accepted names as a sentence, so a refusal tells the reader what WOULD work. */
function acceptedValues(): string {
  return `Accepted values for ${BACKEND_ENV_VAR}: ${MEDIA_BACKEND_NAMES.join(', ')}.`
}

/**
 * The ONE place a raw value becomes a name or a refusal. `configuredBackendName()`
 * and `getMediaStore()` both route through it, so they cannot disagree.
 *
 * Trimming and lower-casing are transport noise (a shell export, a `.env` line),
 * not leniency: `' S3 '` names s3. A value that normalises to none of the four is
 * a configuration error and says so, naming every accepted value.
 */
function requireBackendName(raw: string): MediaBackendName {
  const normalized = raw.trim().toLowerCase()
  if (!isMediaBackendName(normalized)) {
    throw new MediaBackendUnavailableError(
      null,
      `${BACKEND_ENV_VAR} is set to ${JSON.stringify(raw)}, which is not a media backend this build ` +
        `knows. ${acceptedValues()} Refusing to guess: a store resolved from a value nobody verified ` +
        'is a store nobody configured. Correct the value to one of those, or unset the variable.',
    )
  }
  return normalized
}

/* ─────────────────────────────── the refusals ─────────────────────────────── */

function unsetOutsideTestMessage(): string {
  return (
    `${BACKEND_ENV_VAR} is not set, so no media backend is configured. ${acceptedValues()} ${D3_NOTE} ` +
    'Refusing to pick one: Vercel Blob, S3 and R2 are not interchangeable — each implies a different ' +
    'host, URL and credential — and a store chosen by guess would accept a seller’s photos somewhere ' +
    'nobody can retrieve them. In the test environment (NODE_ENV=test) an unset variable resolves the ' +
    'local-disk test seam instead; that path exists for tests and cannot serve a deployment.'
  )
}

function localOutsideTestMessage(): string {
  return (
    `${BACKEND_ENV_VAR} is set to "local", but the local-disk store is the sanctioned TEST SEAM and not ` +
    `a deployable backend: it issues upload URLs on ${LOCAL_MEDIA_BASE_URL} — an origin reserved by ` +
    'RFC 2606 §2 / RFC 6761 §6.2, so no browser can resolve it — and nothing in this app serves the ' +
    'upload endpoint those URLs point at, so it could not store a single seller photo. It resolves ' +
    `only when NODE_ENV=test. ${D3_NOTE}`
  )
}

/**
 * No accepted-values list here, deliberately: every one of the four names either
 * throws for the same reason (`vercel-blob`, `s3`, `r2`) or is a test seam that
 * cannot serve a deployment (`local`), so listing them would suggest a working
 * alternative that does not exist. The honest answer is that the backend is not
 * chosen yet.
 */
function notImplementedMessage(name: MediaBackendName): string {
  return (
    `${BACKEND_ENV_VAR} is set to "${name}", but no ${name} adapter exists yet: this repository declares ` +
    'the seam (lib/storage/types.ts) and a local test seam (lib/storage/local.ts) and nothing else. ' +
    `${D3_NOTE} Refusing to return a stand-in store: anything that pretended to accept an upload would ` +
    'ship bytes nobody can retrieve. The seam names the missing backend rather than hiding it.'
  )
}

function overrideOutsideTestMessage(): string {
  return (
    'getMediaStore() was given a directory override while NODE_ENV is ' +
    `${JSON.stringify(process.env.NODE_ENV ?? null)}. The override exists so a test can point the local ` +
    'seam at its own directory; it is refused everywhere else, because an override is exactly the hole ' +
    'through which a production process could be handed a store it did not configure.'
  )
}

/* ──────────────────────────────── the seam cache ──────────────────────────── */

/**
 * Every store this process has resolved, keyed by the configuration that produced
 * it. A `Map` and not a single slot because the override names a directory: two
 * tests asking for two directories must not receive one store.
 */
const resolvedStores = new Map<string, MediaStore>()

function cachedStore(key: string, build: () => MediaStore): MediaStore {
  const existing = resolvedStores.get(key)
  if (existing !== undefined) return existing
  const store = build()
  resolvedStores.set(key, store)
  return store
}

/* ─────────────────────────── the sanctioned test path ─────────────────────── */

/** One directory per process under the OS temp dir. Documented above; the suite pins this exact path. */
function defaultTestRootDir(): string {
  return join(tmpdir(), 'peak-media-test', String(process.pid))
}

/**
 * How long an upload URL from the TEST SEAM stays valid. A constant of the seam
 * rather than of the product: no user ever holds one of these URLs, so this is
 * not the policy `types.ts` warns against defaulting.
 */
const TEST_SEAM_URL_TTL_MS = 5 * 60_000

/** Generated on first use, per process. Never read from configuration — see the header. */
let testSeamSigningSecret: string | null = null

function testSeamSecret(): string {
  testSeamSigningSecret ??= randomBytes(32).toString('base64url')
  return testSeamSigningSecret
}

function buildLocalTestSeam(rootDir: string): MediaStore {
  return createLocalMediaStore({
    rootDir,
    signingSecret: testSeamSecret(),
    urlTtlMs: TEST_SEAM_URL_TTL_MS,
  })
}

/**
 * The default seam: the documented per-process root, emptied first so a crashed
 * run with this pid cannot leave bytes this run would report as its own.
 */
function buildDefaultLocalTestSeam(): MediaStore {
  rmSync(defaultTestRootDir(), { recursive: true, force: true })
  return buildLocalTestSeam(defaultTestRootDir())
}

/* ──────────────────────────────── the surface ─────────────────────────────── */

/** Test-only: the directory the local seam writes under, instead of the documented default one. */
export interface MediaStoreOverride {
  rootDir: string
}

/**
 * The configured store, or a named refusal explaining exactly why there is none.
 *
 * `override` is the test seam's escape hatch: a test that wants the store in its
 * own directory names it here. It is honoured ONLY when `NODE_ENV === 'test'`,
 * and it never consults the backend variable — a test that named a directory has
 * already said which store it wants.
 */
export function getMediaStore(override?: MediaStoreOverride): MediaStore {
  const inTest = process.env.NODE_ENV === 'test'

  if (override !== undefined) {
    if (!inTest) {
      throw new Error(`storage: ${overrideOutsideTestMessage()}`)
    }
    if (typeof override.rootDir !== 'string' || override.rootDir.trim() === '') {
      throw new Error(
        `storage: getMediaStore() was given an override whose rootDir is ` +
          `${JSON.stringify(override.rootDir)}. A directory the store writes into must be a non-empty ` +
          'string: the empty string resolves to the process working directory, and the store would ' +
          'then write into the repository.',
      )
    }
    return cachedStore(`local:root:${resolve(override.rootDir)}`, () =>
      buildLocalTestSeam(override.rootDir),
    )
  }

  const raw = rawBackendValue()

  if (raw === null) {
    if (inTest) return cachedStore('local:default', buildDefaultLocalTestSeam)
    throw new MediaBackendUnavailableError(null, unsetOutsideTestMessage())
  }

  const name = requireBackendName(raw)

  if (name === 'local') {
    if (inTest) return cachedStore('local:default', buildDefaultLocalTestSeam)
    throw new MediaBackendUnavailableError('local', localOutsideTestMessage())
  }

  /*
   * Every remaining name in `MEDIA_BACKEND_NAMES` is a D3 candidate with no
   * adapter: `name` is narrowed to `vercel-blob | s3 | r2` here, because the
   * `local` branch above returns or throws. Adding a fifth name to the vocabulary
   * without an adapter sends it down this line too, which is the correct outcome —
   * the refusal names whatever is actually missing.
   */
  throw new MediaBackendUnavailableError(name, notImplementedMessage(name))
}

/**
 * The name the environment configures, or `null` when nothing is configured
 * (`PEAK_MEDIA_BACKEND` unset or blank — D3 is still open).
 *
 * A value that is not one of the four names THROWS rather than reporting `null`:
 * a misspelled deployment variable and an undecided hosting question need
 * different fixes, so they must not read alike.
 */
export function configuredBackendName(): MediaBackendName | null {
  const raw = rawBackendValue()
  return raw === null ? null : requireBackendName(raw)
}

/* ──────────────────────────── issuing an upload URL ───────────────────────── */

/**
 * Everything the pre-upload gate needs to judge an upload, plus the owner the URL
 * is signed for.
 *
 * `bytes` is the size the caller CLAIMS for the file it is about to send. It is a
 * required member because it is the only way `./validate` can answer the ticket's
 * first acceptance criterion — "given an oversized file, then no upload URL is
 * issued": a URL is issued *before* the bytes arrive, so a limit that is never
 * given a size to compare against could refuse nothing.
 */
export interface MediaUploadRequest {
  /** The signed-in seller the URL is issued for. Part of the signed payload. */
  userId: string
  /** The type the client claims, e.g. a `File`'s `type`. Normalised by the gate before it is judged. */
  contentType: string
  /** The size the client claims for the file it will send, in bytes. Judged by the gate. */
  bytes: number
  /** The owner's ceiling for this upload, in bytes. Required — never defaulted here (209.A6). */
  maxBytes: number
}

/**
 * THE ISSUING FUNCTION: the one composition of the gate (`./validate`) and the
 * configured store, and therefore the only place in this module a URL comes into
 * existence.
 *
 * ORDER IS THE CONTRACT (209.A2), and the order is:
 *
 *   1. judge the candidate — `assertUploadAllowed` throws on a refusal; and only
 *      then
 *   2. resolve the store (`getMediaStore()`, or the one the caller injected) and ask
 *      it for a URL.
 *
 * Two consequences are deliberate. A refusal costs nothing: no store is built and
 * no signature is minted. And the ordering is OBSERVABLE, which is why it is
 * asserted rather than described — `tests/storage/index.test.ts` proves it two
 * ways: a recording store is never called for a refused candidate, and, with no
 * store injected and no backend configured, an invalid candidate is refused by the
 * gate rather than by the D3 resolution that would have happened first had the
 * order been reversed.
 *
 * The store is handed the NORMALISED type `assertUploadAllowed` returned — never the
 * raw string the client sent — so the URL is signed for exactly the type that was
 * validated: `'IMAGE/JPEG'` (a real `File.type` on some platforms) is judged as
 * `image/jpeg`.
 *
 * `store` is the injection point and it is optional because production has no say in
 * it: a caller that passes nothing gets the configured store. A test passes a
 * recording store precisely so that "the store was never asked" is an assertion
 * rather than a hope.
 */
export async function createMediaUploadUrl(
  request: MediaUploadRequest,
  store?: MediaStore,
): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  /*
   * FIRST, and synchronously: a refusal must happen before anything is resolved,
   * signed or spent. This is the whole point of the gate existing outside the store.
   */
  const contentType = assertUploadAllowed({
    contentType: request.contentType,
    bytes: request.bytes,
    maxBytes: request.maxBytes,
  })

  /* Only a candidate that passed the gate reaches a store — and only then is one resolved. */
  const target = store ?? getMediaStore()
  return target.createUploadUrl({
    userId: request.userId,
    contentType,
    maxBytes: request.maxBytes,
  })
}

/**
 * TEST-ONLY. Clears every resolved instance and empties the default test root, so
 * the next `getMediaStore()` builds a fresh store over an empty directory.
 *
 * It refuses to run outside the test environment: in a process that is not a test
 * it could only ever swap the store under a live caller, which is a production
 * hazard wearing a test helper's name.
 */
export function resetMediaStoreForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      `storage: resetMediaStoreForTests() was called with NODE_ENV=` +
        `${JSON.stringify(process.env.NODE_ENV ?? null)}. Refusing: it exists so a test can start from ` +
        'an empty directory, and outside a test it would silently change which store a running process ' +
        'resolves.',
    )
  }
  resolvedStores.clear()
  rmSync(defaultTestRootDir(), { recursive: true, force: true })
}
