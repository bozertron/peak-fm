/**
 * lib/storage/local.ts — PEAK-209 unit 4 of 6: the LOCAL-DISK store, and it is a
 * TEST SEAM, NOT A BACKEND.
 *
 * The ticket is explicit that the backend cannot be chosen while D3 (hosting) is
 * open — Vercel Blob, S3 and R2 each imply a different answer — but that the
 * interface, the validation, the single-use/expiry contract and the refusal
 * vocabulary are unblocked and must be built now. This file is the only way to
 * RUN that contract: without an implementation of `MediaStore` there is nothing
 * to hand a test. So it exists so that `createUploadUrl` / `upload` / `delete`
 * can be exercised on a real filesystem, and for no other reason:
 *
 *   - nothing outside `tests/` may import it, and `lib/storage/index.ts` (unit 6)
 *     must THROW when no backend is configured rather than fall back to this;
 *   - it keeps its single-use ledger in process memory, which is fine for one
 *     test process and is exactly why it must never serve a user;
 *   - it is honest about the properties it does NOT have (see LIMITS below).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SIGNING CONSTRUCT, AND WHY THIS ONE
 * ─────────────────────────────────────────────────────────────────────────────
 * `node:crypto` `createHmac('sha256', signingSecret)` over the base64url-encoded
 * payload, compared with `timingSafeEqual`. Concretely, and each point is a
 * property that was reasoned about rather than assumed:
 *
 *   - HMAC-SHA256, not a bare hash: the tag is unforgeable without the secret,
 *     so a client cannot mint a URL for a key or a lifetime the server never
 *     approved. Off-the-shelf: Node's own `createHmac` (RFC 2104 / FIPS 198-1),
 *     which is why no signature scheme had to be invented here.
 *   - The SIGNED bytes are the encoded payload string that travels in the URL,
 *     not a re-serialisation of the payload object. Re-`JSON.stringify`ing on
 *     verify would make the signature depend on key ORDER and on the
 *     serialiser's whitespace rules, which is the classic canonicalisation bug
 *     (the same reason a JWS signs its base64url segments). Signing the exact
 *     string that is parsed makes verification exact.
 *   - The payload is base64url, not standard base64: '+' and '/' are would-be
 *     query characters — `URLSearchParams` decodes '+' as a SPACE — and '=' is
 *     padding. base64url's alphabet is entirely unreserved, so the string that
 *     was signed is the string that comes back. A scheme that silently corrupted
 *     its own signature on the way through a URL would fail as
 *     `signature-invalid` on every request, which is a bug that looks like an
 *     attack.
 *   - No header, no `alg` field, no algorithm agility. The verifier always uses
 *     HS256 with its own secret. A JWT-shaped token with an attacker-chosen
 *     `alg` is the well-known algorithm-confusion family ('none', or an RSA
 *     public key read as an HMAC secret), and the cheapest defence is to have no
 *     field that could ever be attacker-controlled.
 *   - `timingSafeEqual`, never `===`: string comparison returns at the first
 *     differing byte, so a caller that can time the refusal can recover the tag
 *     one byte at a time. `timingSafeEqual` THROWS when the two buffers differ
 *     in length, so the length is compared first — a tag's length is public
 *     (SHA-256 always yields 32 bytes) and leaks nothing.
 *   - Expiry and the claim being authorised (`key`, `userId`, `contentType`,
 *     `maxBytes`) are INSIDE the signed payload, so none of them can be widened
 *     by editing the URL; the nonce is inside it too, which is what makes the
 *     replay ledger keyed by something the client cannot mint.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REFUSAL ORDER, AND WHY THE NONCE IS CLAIMED WHERE IT IS
 * ─────────────────────────────────────────────────────────────────────────────
 * `upload()` runs, in this order: signature (is this ours?) → expiry (is it
 * still valid?) → already-consumed → content type → size → key containment →
 * write. Two consequences are deliberate:
 *
 *   - An EXPIRED or FORGED URL never spends a nonce. Only a signature this
 *     store genuinely issued, and that is still live, can reach the claim.
 *   - The claim is taken SYNCHRONOUSLY, before the first `await`, so two
 *     concurrent `upload()` calls racing on one URL cannot both pass the check
 *     and both write; there is no window between "checked" and "claimed". A
 *     refusal that follows the claim (wrong content type, too large, escaping
 *     key) still spends the URL: a signature authorises exactly ONE attempt,
 *     and a caller that gets it wrong asks for a new URL. That is a decision,
 *     not an accident — the alternative (releasing the claim on refusal) is what
 *     turns a single-use URL into an unlimited-retry oracle.
 *   - `nowMs >= expiresAt` is the boundary: `expiresAt` is the first instant at
 *     which the URL is refused, so a `urlTtlMs` of 60_000 buys 60 seconds.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LIMITS, STATED RATHER THAN HIDDEN
 * ─────────────────────────────────────────────────────────────────────────────
 *   - The consumed-nonce ledger lives in this process's memory: single-use holds
 *     for this process only, and is lost on restart. A real backend enforces it
 *     in shared storage (or leans on a presigned POST's conditions).
 *   - A URL is a bearer token: whoever holds it may use it until it expires. It
 *     is not bound to an IP, a session, or a browser.
 *   - The payload is SIGNED, NOT ENCRYPTED. `userId`, the key and the limits are
 *     readable by anyone holding the URL — that is why nothing secret may be put
 *     in this payload.
 *   - There is no key rotation, no clock skew allowance, and no rate limiting.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `delete()` RETURNS void AND IS SILENT ABOUT A MISS
 * ─────────────────────────────────────────────────────────────────────────────
 * The post-condition is "no object exists at this key", NOT "an object was
 * removed" — PEAK-209 says re-deleting a reclaimed key must not be a corruption,
 * and the orphan collector retries. A missing key therefore resolves instead of
 * throwing. This is not a silent claim of deletion: the existence probe below
 * runs first, and the distinction is observable through `listKeys()`. `delete`
 * still THROWS for a key that could resolve outside the root, because that is a
 * caller bug (or an attack), not an idempotent no-op.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Dirent, Stats } from 'node:fs'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import {
  SUPPORTED_CONTENT_TYPES,
  type MediaStore,
  type SupportedContentType,
  type UploadRefusalReason,
} from './types'

/**
 * The origin this store mints URLs on. `.test` is reserved by IANA for exactly
 * this (RFC 2606 §2 / RFC 6761 §6.2) and can never be a live host, so a URL from
 * this store can never be mistaken for a production one.
 */
export const LOCAL_MEDIA_BASE_URL = 'https://local-media.test'

/** Where a client would POST the bytes. Carries the signature; single use. */
const UPLOAD_PATH = '/upload'

/** Where a gallery reads the stored object. Stable, unsigned, and never expires. */
const READ_PATH_PREFIX = '/media/'

/** A key is a flat object name. The extension is derived from the signed type. */
const EXTENSION_BY_CONTENT_TYPE: Record<SupportedContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * The key alphabet. `-` and `_` are unreserved in a URL, so a key survives
 * `encodeURIComponent`/`decodeURIComponent` byte for byte. A key is generated by
 * this module and never accepted from a caller, but it is VALIDATED on the way
 * back out of the URL, because the payload is only as trustworthy as the secret.
 */
const SAFE_KEY = /^[A-Za-z0-9._-]+$/

/**
 * The exact payload the signature covers. Every field is authoritative: the
 * client cannot change the key, the owner, the accepted type, the size ceiling or
 * the deadline without invalidating the tag.
 */
export interface LocalMediaUploadPayload {
  key: string
  userId: string
  contentType: string
  maxBytes: number
  expiresAt: number
  nonce: string
}

/** Factory options. Both policies are REQUIRED — see the module header of `types.ts`. */
export interface LocalMediaStoreOptions {
  /** Directory the bytes are written under. Nothing is ever written outside it. */
  rootDir: string
  /** HMAC key. Not a URL fragment: it signs, and it never leaves the server. */
  signingSecret: string
  /** How long an issued URL stays valid, in milliseconds. Required, never defaulted. */
  urlTtlMs: number
  /** Injectable clock, so expiry is tested by moving time rather than by sleeping. */
  now?: () => number
}

/**
 * The local store's full surface: the ticket's `MediaStore` plus the three
 * members the test harness needs (`upload`, `keyFromUrl`, `listKeys`). The
 * production seams must not depend on these — they exist so a test can complete
 * an upload, resolve a key from a URL, and assert on disk.
 */
export interface LocalMediaStore extends MediaStore {
  /** Completes a signed upload for the test harness; single use. */
  upload(
    url: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<{ key: string; publicUrl: string }>
  /** The inverse of createUploadUrl — must round-trip exactly. */
  keyFromUrl(url: string): string | null
  /** For assertions in tests. */
  listKeys(): Promise<string[]>
}

/**
 * A refusal, with the reason as data rather than a substring a caller would have
 * to parse. The message follows `lib/storage/validate.ts`'s convention
 * (`upload refused [<reason>]: <detail>`) so one grep finds every refusal in the
 * storage layer; `reason` is from the shared vocabulary in `types.ts` so the UI
 * can say which rule bit.
 */
export class LocalMediaStoreError extends Error {
  readonly reason: UploadRefusalReason

  constructor(reason: UploadRefusalReason, detail: string, options?: { cause?: unknown }) {
    super(`upload refused [${reason}]: ${detail}`, options)
    this.name = 'LocalMediaStoreError'
    this.reason = reason
  }
}

/* ─────────────────────────── encoding and signing ─────────────────────────── */

function encodePayload(payload: LocalMediaUploadPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

/** base64url -> utf8. The input is signature-verified before this is called, so a throw here is a bug, not an attack. */
function decodePayload(encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString('utf8')
}

/** The HMAC tag over the EXACT encoded payload string that travels in the URL. */
function hmacSignature(encodedPayload: string, signingSecret: string): Buffer {
  return createHmac('sha256', signingSecret).update(encodedPayload, 'utf8').digest()
}

/**
 * Builds a signed upload URL for `payload`. Exported because `createUploadUrl`
 * only ever signs a key it derived itself, so the test suite would otherwise have
 * no way to present `upload()` with a correctly signed but hostile payload (an
 * escaping key) — and that is the only way to prove `upload()` has a containment
 * guard of its OWN rather than merely trusting its issuer. The same function is
 * used by `createUploadUrl`, so there is one implementation of the format, not
 * two that can disagree.
 */
export function signUploadUrl(options: {
  signingSecret: string
  payload: LocalMediaUploadPayload
  baseUrl?: string
}): string {
  const { signingSecret, payload } = options
  if (typeof signingSecret !== 'string' || signingSecret.length === 0) {
    throw new Error(
      'storage: refusing to sign an upload URL with an empty signingSecret — an ' +
        'empty HMAC key is a key every caller already knows.',
    )
  }
  if (!isUploadPayload(payload)) {
    throw new Error(
      `storage: refusing to sign a malformed upload payload (${JSON.stringify(payload)}). ` +
        'A signature over undefined fields would authorise an upload nothing can validate.',
    )
  }

  const encoded = encodePayload(payload)
  const url = new URL(UPLOAD_PATH, options.baseUrl ?? LOCAL_MEDIA_BASE_URL)
  url.searchParams.set('p', encoded)
  url.searchParams.set('s', hmacSignature(encoded, signingSecret).toString('base64url'))
  return url.toString()
}

/**
 * Every field present, of the right sort, and positive where it is a limit.
 * `expiresAt` may legitimately be in the past (a URL is signed before it expires),
 * so it is only checked for being a whole number of milliseconds.
 */
function isUploadPayload(value: unknown): value is LocalMediaUploadPayload {
  if (typeof value !== 'object' || value === null) return false
  const payload = value as Record<string, unknown>
  return (
    typeof payload.key === 'string' &&
    payload.key.length > 0 &&
    typeof payload.userId === 'string' &&
    payload.userId.length > 0 &&
    typeof payload.contentType === 'string' &&
    payload.contentType.length > 0 &&
    typeof payload.maxBytes === 'number' &&
    Number.isSafeInteger(payload.maxBytes) &&
    payload.maxBytes > 0 &&
    typeof payload.expiresAt === 'number' &&
    Number.isSafeInteger(payload.expiresAt) &&
    typeof payload.nonce === 'string' &&
    payload.nonce.length > 0
  )
}

/**
 * Verifies a URL and returns the payload it authorises, or throws a
 * `LocalMediaStoreError` naming why it will not. Order is signature → shape →
 * expiry: nothing about the payload is acted on before the tag proves the
 * payload is this store's.
 */
function verifyUploadUrl(
  rawUrl: string,
  signingSecret: string,
  nowMs: number,
): LocalMediaUploadPayload {
  const url = asUrl(rawUrl)
  if (url === null) {
    throw new LocalMediaStoreError(
      'signature-invalid',
      `"${rawUrl}" is not an absolute URL, so it cannot be one this store signed.`,
    )
  }
  if (url.origin !== new URL(LOCAL_MEDIA_BASE_URL).origin || url.pathname !== UPLOAD_PATH) {
    throw new LocalMediaStoreError(
      'signature-invalid',
      `"${rawUrl}" is not an upload URL issued by this store (expected ${LOCAL_MEDIA_BASE_URL}${UPLOAD_PATH}).`,
    )
  }

  const encoded = url.searchParams.get('p')
  const presented = url.searchParams.get('s')
  if (encoded === null || presented === null) {
    throw new LocalMediaStoreError(
      'signature-invalid',
      `"${rawUrl}" carries no payload/signature pair ("p"/"s").`,
    )
  }

  const expected = hmacSignature(encoded, signingSecret)
  const claimed = Buffer.from(presented, 'base64url')
  if (claimed.length !== expected.length || !timingSafeEqual(claimed, expected)) {
    throw new LocalMediaStoreError(
      'signature-invalid',
      `the signature on "${rawUrl}" does not match its payload — the URL was edited, ` +
        'or it was signed with a different secret.',
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(decodePayload(encoded))
  } catch (cause) {
    throw new LocalMediaStoreError(
      'signature-invalid',
      `the payload of "${rawUrl}" is not readable JSON, so it is not one this store signed.`,
      { cause },
    )
  }
  if (!isUploadPayload(parsed)) {
    throw new LocalMediaStoreError(
      'signature-invalid',
      `the payload of "${rawUrl}" is not a well-formed upload payload (${JSON.stringify(parsed)}).`,
    )
  }

  if (nowMs >= parsed.expiresAt) {
    throw new LocalMediaStoreError(
      'signature-expired',
      `the URL expired at ${new Date(parsed.expiresAt).toISOString()} and the clock now reads ` +
        `${new Date(nowMs).toISOString()}.`,
    )
  }

  return parsed
}

/* ────────────────────────────── URLs and keys ─────────────────────────────── */

/** `null` means "this is not a URL", which is the answer a predicate is looking for — not an error being swallowed. */
function asUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl)
  } catch {
    return null
  }
}

/** The stable read URL for a key. Unsigned and unexpiring; the key is the identity. */
function publicUrlForKey(key: string): string {
  const url = new URL(LOCAL_MEDIA_BASE_URL)
  url.pathname = `${READ_PATH_PREFIX}${encodeURIComponent(key)}`
  return url.toString()
}

/**
 * The inverse of `publicUrlForKey`. Shape-based on purpose: a URL this store has
 * never issued but that addresses the store's own read surface names a key, and
 * that key is returned. Anything on another origin, another path, with a query or
 * fragment (a read URL carries neither), with unreadable percent-encoding, or
 * naming a key that could not have been issued (empty, a path separator, "..")
 * is not a key this store can name — so `null`.
 */
function keyFromUrl(rawUrl: string): string | null {
  const url = asUrl(rawUrl)
  if (url === null) return null
  if (url.origin !== new URL(LOCAL_MEDIA_BASE_URL).origin) return null
  if (!url.pathname.startsWith(READ_PATH_PREFIX)) return null
  if (url.search !== '' || url.hash !== '') return null
  const key = decodeUriComponent(url.pathname.slice(READ_PATH_PREFIX.length))
  if (key === null) return null
  if (keyRefusal(key) !== null) return null
  return key
}

function decodeUriComponent(encoded: string): string | null {
  try {
    return decodeURIComponent(encoded)
  } catch {
    return null
  }
}

/** Why a string may not be a storage key, or `null` when it may. One rule set, two callers. */
function keyRefusal(key: string): string | null {
  if (typeof key !== 'string' || key.length === 0) {
    return `a storage key must be a non-empty string (got ${typeof key})`
  }
  if (key.includes('/') || key.includes('\\')) {
    return 'a storage key must not contain a path separator'
  }
  if (key.includes('..')) {
    return 'a storage key must not contain ".."'
  }
  if (key.includes('\u0000')) {
    return 'a storage key must not contain a NUL byte'
  }
  if (!SAFE_KEY.test(key)) {
    return `a storage key is limited to A-Z a-z 0-9 . _ - (got "${key}")`
  }
  return null
}

/** A key that cannot be issued is a caller bug or an attack: it throws, it is never coerced. */
function assertSafeKey(key: string): void {
  const refusal = keyRefusal(key)
  if (refusal !== null) {
    throw new Error(
      `storage: refusing key "${String(key)}": ${refusal}. The key selects a path under ` +
        'the store root, so an unvalidated key is a path-traversal primitive.',
    )
  }
}

/**
 * The ONLY way a key becomes a path in this module. The key shape is asserted
 * first; the containment check is then belt-and-braces, and it is kept because
 * "the key shape already forbids it" is a claim about TODAY's generator, not a
 * property of this function.
 */
function resolveKeyPath(rootAbs: string, key: string): string {
  assertSafeKey(key)
  const candidate = resolve(rootAbs, key)
  if (candidate === rootAbs || !candidate.startsWith(rootAbs + sep)) {
    throw new Error(
      `storage: refusing key "${key}": it resolves to "${candidate}", outside the store ` +
        `root "${rootAbs}".`,
    )
  }
  return candidate
}

function buildKey(contentType: SupportedContentType, issuedAt: number, nonce: string): string {
  const stamp = new Date(issuedAt).toISOString().slice(0, 10).replaceAll('-', '')
  return `media-${stamp}-${nonce}.${EXTENSION_BY_CONTENT_TYPE[contentType]}`
}

/* ──────────────────────────── filesystem plumbing ─────────────────────────── */

/** The narrowing `validate.ts` also keeps private; `SUPPORTED_CONTENT_TYPES` in `types.ts` is the one source of truth. */
function isSupportedContentType(value: string): value is SupportedContentType {
  return (SUPPORTED_CONTENT_TYPES as readonly string[]).includes(value)
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

/**
 * `null` means "there is nothing at this path" (ENOENT) — the honest answer here.
 * Every other filesystem error (EACCES, ENOTDIR, ELOOP) is rethrown, because
 * "unreadable" and "absent" are different facts and only one of them is safe to
 * treat as absence.
 */
async function statIfExists(path: string): Promise<Stats | null> {
  try {
    return await stat(path)
  } catch (error) {
    if (isEnoent(error)) return null
    throw error
  }
}

/**
 * The keys this store owns: every REGULAR FILE directly under the root, sorted.
 * A missing directory yields nothing (no directory, no keys) — that is the
 * honest answer rather than an error.
 *
 * This store lays keys out flat, so anything else under the root was not written
 * by it: a subdirectory or symlink is refused loudly rather than skipped. Skipping
 * would make `listKeys()` — the orphan collector's view of what exists — disagree
 * with the filesystem, and it would report a nested path as a key that `delete()`
 * and `keyFromUrl()` must refuse (both reject a path separator), which is a pair
 * that cannot be acted on.
 */
async function listFlatFiles(rootAbs: string): Promise<string[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(rootAbs, { withFileTypes: true })
  } catch (error) {
    if (isEnoent(error)) return []
    throw error
  }

  const keys: string[] = []
  for (const entry of entries) {
    if (entry.isFile()) {
      keys.push(entry.name)
      continue
    }
    throw new Error(
      `storage: "${rootAbs}" contains "${entry.name}", which is not a regular file. This store ` +
        'writes flat, single-segment keys and nothing else, so the directory is not a store root ' +
        'this process owns; refusing to report a key list that would hide it.',
    )
  }
  return keys.sort()
}

/* ──────────────────────────────── the factory ─────────────────────────────── */

/** An injected clock that does not return a whole number of milliseconds is a broken test, not a valid time. */
function currentTimeMillis(now: () => number): number {
  const value = now()
  if (!Number.isSafeInteger(value)) {
    throw new Error(
      `storage: the injected clock returned ${String(value)}, which is not a whole number of ` +
        'milliseconds since the epoch. Refusing to judge expiry against a time that is not a time.',
    )
  }
  return value
}

export function createLocalMediaStore(options: LocalMediaStoreOptions): LocalMediaStore {
  const { signingSecret } = options
  const { urlTtlMs } = options
  const now = options.now ?? Date.now
  const rootAbs = resolve(options.rootDir)

  if (typeof signingSecret !== 'string' || signingSecret.length === 0) {
    throw new Error(
      'storage: createLocalMediaStore needs a non-empty signingSecret. An empty HMAC key is ' +
        'a key every caller already knows, so every URL it minted would be forgeable.',
    )
  }
  if (!Number.isSafeInteger(urlTtlMs) || urlTtlMs <= 0) {
    throw new Error(
      `storage: createLocalMediaStore got urlTtlMs=${String(urlTtlMs)}, which is not a positive ` +
        'whole number of milliseconds. A URL that never expires is not short-lived, and the ' +
        'ticket is explicit that it must be.',
    )
  }

  /**
   * Consumed nonces, in this process's memory (LIMITS in the header). A `Set` is
   * the whole ledger: membership is the check, insertion is the claim, and the
   * insertion happens synchronously before the first `await` so two concurrent
   * attempts on one URL cannot both proceed.
   */
  const consumedNonces = new Set<string>()

  return {
    async createUploadUrl(input) {
      if (typeof input.userId !== 'string' || input.userId.length === 0) {
        throw new Error(
          `storage: createUploadUrl got no userId (${JSON.stringify(input.userId)}). The owner ` +
            'is part of the signed payload, so a URL with an anonymous owner authorises nothing.',
        )
      }
      if (!isSupportedContentType(input.contentType)) {
        throw new LocalMediaStoreError(
          'unsupported-content-type',
          `${JSON.stringify(input.contentType)} is not a type this store issues keys for. ` +
            `Supported types: ${SUPPORTED_CONTENT_TYPES.join(', ')}.`,
        )
      }
      if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes <= 0) {
        throw new LocalMediaStoreError(
          'too-large',
          `maxBytes is ${String(input.maxBytes)}, which is not a positive whole number of bytes: ` +
            'the limit itself is invalid, so no upload can be judged against it.',
        )
      }

      const issuedAt = currentTimeMillis(now)
      const nonce = randomBytes(18).toString('base64url')
      const key = buildKey(input.contentType, issuedAt, nonce)
      const payload: LocalMediaUploadPayload = {
        key,
        userId: input.userId,
        contentType: input.contentType,
        maxBytes: input.maxBytes,
        expiresAt: issuedAt + urlTtlMs,
        nonce,
      }

      return {
        uploadUrl: signUploadUrl({ signingSecret, payload }),
        publicUrl: publicUrlForKey(key),
        key,
      }
    },

    async upload(url, bytes, contentType) {
      const payload = verifyUploadUrl(url, signingSecret, currentTimeMillis(now))

      if (consumedNonces.has(payload.nonce)) {
        throw new LocalMediaStoreError(
          'signature-already-used',
          `the signature for key "${payload.key}" (nonce ${payload.nonce}) has already been ` +
            'spent on a completed upload. A signature is single use: ask for a new URL.',
        )
      }
      consumedNonces.add(payload.nonce)

      if (contentType !== payload.contentType) {
        throw new LocalMediaStoreError(
          'unsupported-content-type',
          `the URL was signed for "${payload.contentType}" but this upload declares ` +
            `"${contentType}". The type that was validated is the only type that may be stored.`,
        )
      }
      if (bytes.length === 0) {
        throw new LocalMediaStoreError(
          'empty',
          '0 bytes: an empty upload has nothing to store, and storing an empty object would ' +
            'leave a readable URL that renders as a broken image.',
        )
      }
      if (bytes.length > payload.maxBytes) {
        throw new LocalMediaStoreError(
          'too-large',
          `${bytes.length} bytes exceeds the ${payload.maxBytes}-byte ceiling the URL was signed ` +
            `for by ${bytes.length - payload.maxBytes} bytes.`,
        )
      }

      const filePath = resolveKeyPath(rootAbs, payload.key)
      await mkdir(rootAbs, { recursive: true })
      await writeFile(filePath, bytes)

      return { key: payload.key, publicUrl: publicUrlForKey(payload.key) }
    },

    async delete(key) {
      const filePath = resolveKeyPath(rootAbs, key)
      const stats = await statIfExists(filePath)
      if (stats === null) return
      if (!stats.isFile()) {
        throw new Error(
          `storage: refusing to delete "${key}": it is not a regular file. Removing it would ` +
            'mean something other than "this object is gone".',
        )
      }
      await rm(filePath, { force: true })
    },

    async listKeys() {
      return listFlatFiles(rootAbs)
    },

    keyFromUrl,
  }
}
