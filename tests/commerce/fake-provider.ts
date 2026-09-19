/**
 * An in-memory `PaymentProvider` — PEAK-230, unit 4 of 4.
 *
 * WHY THIS EXISTS AT ALL
 * PEAK-230's verification evidence asks for "a fake in-memory provider
 * implementing the interface", and two of the seam's rules cannot be proven
 * against a real provider at all:
 *
 *   - rule 2 (idempotency): one charge for one `orderId` after a retried call.
 *     A real PaymentIntent would be one charge whether or not Peak keyed on the
 *     order, so a real provider cannot tell us whether the seam is idempotent —
 *     only a double that counts what it was asked to do can.
 *   - rule 3 (signatures verified): an unverified webhook is discarded AND
 *     logged. "Logged" is observable only if something records the refusal.
 *
 * So this double RECORDS. It does not decide. It has no fee math, no tax
 * treatment, no refund policy and no KYC policy — those are the provider's
 * business, and a double that invented them would be the fake wired into a real
 * code path that rule 3 of the doctrine prohibits. Where it must keep a number
 * (a charge it recorded, a refund it applied) it keeps only what it was told.
 *
 * BOUNDARY — this file is `tests/`-only and must never be imported by
 * production code. `lib/commerce/index.ts` resolves the configured provider and
 * throws when configuration names one it cannot build; it must NOT fall back to
 * this double. Nothing here imports from `app/` or `lib/queries/`: a seam double
 * that reached into product policy would not be a double any more, it would be a
 * second implementation of the seam with no owner.
 *
 * WHAT IT ACCEPTS, AND WHAT IT REFUSES
 * A refusal here is always a caller bug (an empty `orderId`, a fractional
 * amount, an unknown `providerRef`, a re-used idempotency key with a different
 * amount) and is thrown with the offending value named — never swallowed,
 * never returned as a null-ish "no result". A webhook refusal is RECORDED in
 * `rejections` and then thrown as a `WebhookRejectedError` carrying the reason,
 * which is the ticket's "discarded and logged, never processed".
 *
 * SIGNATURES
 * Messages are signed with HMAC-SHA256 over the exact raw body, hex-encoded —
 * `sign()` produces one, `verifyWebhook()` is the only thing that accepts one,
 * and the comparison is `timingSafeEqual` so the double models the real
 * constant-time check rather than `===`. No external package is used or needed:
 * `node:crypto` is built in, and this wave adds no dependency.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  PROVIDER_EVENT_TYPES,
  type PaymentProvider,
  type ProviderEvent,
  type ProviderEventType,
} from '@/lib/commerce/provider'
import { ORDER_STATUSES, type OrderStatus } from '@/lib/db/schema'

/** The `name` this double reports: a test provider, not a real one. */
export const FAKE_PROVIDER_NAME = 'fake'

/**
 * The secret used when a test does not care which secret is in play.
 * Deliberately a sentence rather than a plausible key, so a leak of it into a
 * log, a fixture or a snapshot is obvious on sight.
 */
export const DEFAULT_FAKE_SIGNING_SECRET = 'fake-signing-secret-not-a-real-key'

/**
 * The closed vocabulary of reasons a webhook was refused.
 *
 * A refusal is recorded with its reason so a test can assert not just "it
 * threw" but "it threw for the right cause" — a rejection for the wrong reason
 * is a bug that a bare `rejects.toThrow()` would report as a pass.
 */
export const WEBHOOK_REJECTION_REASONS = [
  /** No signature header at all (`''`). */
  'signature_missing',
  /** A signature was presented and did not match the body. */
  'signature_mismatch',
  /** The body was not a JSON object, or was missing/misshaping a field. */
  'malformed_payload',
  /** Verified, but the `type` is not in `PROVIDER_EVENT_TYPES`. */
  'unknown_event_type',
  /** Verified, but `status` is not in `ORDER_STATUSES`. */
  'unknown_order_status',
] as const

export type WebhookRejectionReason = (typeof WEBHOOK_REJECTION_REASONS)[number]

/**
 * Raised when `verifyWebhook` refuses a delivery.
 *
 * `reason` is carried on the error as well as in `rejections` so a caller (or a
 * test) can branch on the cause without re-deriving it from the message. The
 * message prints the cause and the rejected signature, because the alternative —
 * "invalid webhook" — tells an operator nothing.
 */
export class WebhookRejectedError extends Error {
  readonly reason: WebhookRejectionReason
  readonly signature: string

  constructor(reason: WebhookRejectionReason, signature: string, detail: string) {
    super(`fake provider refused the webhook (${reason}): ${detail}`)
    this.name = 'WebhookRejectedError'
    this.reason = reason
    this.signature = signature
  }
}

/**
 * What the double recorded. Read-only views for assertions: the double exposes
 * its ledger, it never exposes a way to edit it — a test that could write to
 * `charges` would be asserting against its own fixture.
 */
export interface FakeProviderObservations {
  /** One entry per charge the double was asked to create. Duplicates never appear. */
  readonly charges: Array<{ orderId: string; providerRef: string; amountCents: number }>
  /** One entry per refund the double was asked to apply. */
  readonly refunds: Array<{ providerRef: string; amountCents: number }>
  /** One entry per refused webhook, in arrival order. */
  readonly rejections: Array<{ reason: string; signature: string }>
}

/** The double: the seam's interface, plus its observation surface. */
export type FakeProvider = PaymentProvider &
  FakeProviderObservations & {
    /** Produce the signature that makes `payload` a VALID delivery. */
    sign(payload: string): string
    /** The secret `sign` uses, exposed so a test can assert it never leaks out. */
    readonly secrets: { signingSecret: string }
  }

/** One charge the double recorded, with only the state it needs to stay honest. */
type RecordedPayment = {
  providerRef: string
  clientSecret: string
  orderId: string
  amountCents: number
  refundedCents: number
  captured: boolean
}

/** One auto-pay contract the double recorded. */
type RecordedSubscription = {
  providerRef: string
  agreementId: string
  cancelled: boolean
}

/**
 * The "record it and fail" call the payload normalisers use. Passed explicitly
 * into the module-level helpers below, which are not inside the factory closure
 * and therefore cannot see the ledger.
 */
type Refuse = (reason: WebhookRejectionReason, signature: string, detail: string) => never

const CADENCES = ['weekly', 'biweekly', 'monthly'] as const

/**
 * Build the double. `signingSecret` defaults to a value that is obviously not a
 * key; pass one to make the leak assertions meaningful (a test that only ever
 * uses the default would pass even if the secret were never wired through).
 */
export function createFakeProvider(options?: { signingSecret?: string }): FakeProvider {
  const signingSecret =
    options?.signingSecret === undefined
      ? DEFAULT_FAKE_SIGNING_SECRET
      : requireString(options.signingSecret, 'options.signingSecret')

  const charges: Array<{ orderId: string; providerRef: string; amountCents: number }> = []
  const refunds: Array<{ providerRef: string; amountCents: number }> = []
  const rejections: Array<{ reason: string; signature: string }> = []

  const paymentsByOrder = new Map<string, RecordedPayment>()
  const paymentsByRef = new Map<string, RecordedPayment>()
  const subscriptionsByAgreement = new Map<string, RecordedSubscription>()
  const subscriptionsByRef = new Map<string, RecordedSubscription>()
  const accountsByUser = new Map<string, string>()
  const accountRefs = new Set<string>()

  /** Deterministic, unique refs: a test can read what the provider ref points at. */
  let sequence = 0
  function nextRef(prefix: 'acct' | 'pi' | 'sub'): string {
    sequence += 1
    return `fake_${prefix}_${sequence}`
  }

  /** Record a webhook refusal, then throw it. Always terminates the call. */
  const refuse: Refuse = (reason, signature, detail) => {
    rejections.push({ reason, signature })
    throw new WebhookRejectedError(reason, signature, detail)
  }

  /**
   * Verify a body's signature. The comparison is constant-time over equal-length
   * buffers, so a truncated or non-hex signature fails on length rather than
   * being coerced into a shorter buffer that could accidentally match.
   */
  function signatureMatches(rawBody: string, signature: string): boolean {
    const expected = createHmac('sha256', signingSecret).update(rawBody, 'utf8').digest()
    const presented = Buffer.from(signature, 'hex')
    return presented.length === expected.length && timingSafeEqual(presented, expected)
  }

  return {
    name: FAKE_PROVIDER_NAME,

    charges,
    refunds,
    rejections,
    secrets: Object.freeze({ signingSecret }),

    sign(payload: string): string {
      if (typeof payload !== 'string') {
        throw new Error(
          `fake provider: sign() expects the raw body as a string (got ${describe(payload)}).`,
        )
      }
      return createHmac('sha256', signingSecret).update(payload, 'utf8').digest('hex')
    },

    async createSellerAccount(userId) {
      const id = requireString(userId, 'createSellerAccount.userId')

      // Idempotent on the user: onboarding the same seller twice returns the
      // account that already exists, because a second connected account for one
      // person is the kind of duplicate a retried network call would otherwise
      // make real.
      const existing = accountsByUser.get(id)
      if (existing !== undefined) {
        return { accountRef: existing, onboardingUrl: onboardingUrl(existing) }
      }

      const accountRef = nextRef('acct')
      accountsByUser.set(id, accountRef)
      accountRefs.add(accountRef)
      return { accountRef, onboardingUrl: onboardingUrl(accountRef) }
    },

    async getSellerStatus(accountRef) {
      const ref = requireString(accountRef, 'getSellerStatus.accountRef')
      if (!accountRefs.has(ref)) {
        throw new Error(
          `fake provider: getSellerStatus(${ref}) — no such seller account. ` +
            'The double reports on accounts it onboarded; it does not invent a ' +
            'KYC state for an account it never saw.',
        )
      }
      // The double has no KYC policy, so an onboarded account is fully enabled.
      // A test that needs a restricted account must teach the double to carry
      // one — guessing here would be the fake inventing provider fact.
      return { chargesEnabled: true, payoutsEnabled: true }
    },

    async createPayment(input) {
      const orderId = requireString(input.orderId, 'createPayment.orderId')
      const amountCents = requireAmount(input.amountCents, 'createPayment.amountCents')
      requireString(input.currency, 'createPayment.currency')
      requireString(input.buyerId, 'createPayment.buyerId')
      requireString(input.sellerAccountRef, 'createPayment.sellerAccountRef')
      requireNonNegativeInteger(input.feeCents, 'createPayment.feeCents')

      // IDEMPOTENCY (rule 2). Keyed on `orderId`: a retried call returns the
      // charge that already exists instead of creating a second one.
      const existing = paymentsByOrder.get(orderId)
      if (existing !== undefined) {
        if (existing.amountCents !== amountCents) {
          throw new Error(
            `fake provider: createPayment for order ${orderId} was retried with ` +
              `amountCents=${amountCents}, but order ${orderId} already has a charge of ` +
              `${existing.amountCents} (${existing.providerRef}). One idempotency key, one ` +
              'amount: refusing rather than silently returning a charge for a different sum.',
          )
        }
        return { providerRef: existing.providerRef, clientSecret: existing.clientSecret }
      }

      const providerRef = nextRef('pi')
      // A stand-in for the provider's own client-side secret. It is derived from
      // the ref and the buyer, never from the signing secret.
      const clientSecret = `${providerRef}_client_secret_for_${input.buyerId}`

      const payment: RecordedPayment = {
        providerRef,
        clientSecret,
        orderId,
        amountCents,
        refundedCents: 0,
        captured: false,
      }
      paymentsByOrder.set(orderId, payment)
      paymentsByRef.set(providerRef, payment)

      // The ledger line. `feeCents` is deliberately NOT recorded and NOT
      // computed on: the double does no fee math (see the file header).
      charges.push({ orderId, providerRef, amountCents })

      return { providerRef, clientSecret }
    },

    async capturePayment(providerRef) {
      const ref = requireString(providerRef, 'capturePayment.providerRef')
      const payment = requirePayment(paymentsByRef, ref, 'capturePayment')
      payment.captured = true
      return { status: 'captured' }
    },

    async refundPayment(providerRef, amountCents) {
      const ref = requireString(providerRef, 'refundPayment.providerRef')
      const payment = requirePayment(paymentsByRef, ref, 'refundPayment')

      const refundable = payment.amountCents - payment.refundedCents
      const amount =
        amountCents === undefined
          ? refundable
          : requireAmount(amountCents, 'refundPayment.amountCents')

      if (amount > refundable) {
        throw new Error(
          `fake provider: refundPayment(${ref}) asked for ${amount}, but only ${refundable} ` +
            `of the ${payment.amountCents} charged remains refundable. Refusing to refund ` +
            'money that was never taken.',
        )
      }

      payment.refundedCents += amount
      refunds.push({ providerRef: ref, amountCents: amount })
      return { status: 'refunded' }
    },

    async createSubscription(input) {
      const agreementId = requireString(input.agreementId, 'createSubscription.agreementId')
      requireAmount(input.amountCents, 'createSubscription.amountCents')
      requireString(input.currency, 'createSubscription.currency')
      requireCadence(input.cadence)
      const startAt = requireDate(input.startAt, 'createSubscription.startAt')
      requireString(input.payerId, 'createSubscription.payerId')
      requireString(input.sellerAccountRef, 'createSubscription.sellerAccountRef')
      if (input.endAt !== undefined) {
        const endAt = requireDate(input.endAt, 'createSubscription.endAt')
        if (endAt.getTime() <= startAt.getTime()) {
          throw new Error(
            `fake provider: createSubscription.endAt (${endAt.toISOString()}) is not after ` +
              `startAt (${startAt.toISOString()}). Refusing a schedule that ends before it starts.`,
          )
        }
      }

      // Idempotent on the agreement, for the same reason as createPayment:
      // rule 2 is "idempotency everywhere", not "idempotency on purchases".
      const existing = subscriptionsByAgreement.get(agreementId)
      if (existing !== undefined) {
        return { providerRef: existing.providerRef }
      }

      const providerRef = nextRef('sub')
      const subscription: RecordedSubscription = { providerRef, agreementId, cancelled: false }
      subscriptionsByAgreement.set(agreementId, subscription)
      subscriptionsByRef.set(providerRef, subscription)
      return { providerRef }
    },

    async cancelSubscription(providerRef) {
      const ref = requireString(providerRef, 'cancelSubscription.providerRef')
      const subscription = subscriptionsByRef.get(ref)
      if (subscription === undefined) {
        throw new Error(
          `fake provider: cancelSubscription(${ref}) — no such subscription. Cancelling one ` +
            'the double never created would report a schedule as stopped when it is not.',
        )
      }
      subscription.cancelled = true
      return { status: 'cancelled' }
    },

    async verifyWebhook(rawBody, signature) {
      if (typeof rawBody !== 'string' || rawBody.length === 0) {
        refuse(
          'malformed_payload',
          typeof signature === 'string' ? signature : '',
          `the raw body must be a non-empty string (got ${describe(rawBody)}).`,
        )
      }

      // RULE 3: no signature, no entry. An unsigned delivery is refused and
      // RECORDED before anything is parsed — parsing first would be processing
      // a payload whose signature was never checked.
      const presented = typeof signature === 'string' ? signature.trim() : ''
      if (presented.length === 0) {
        refuse('signature_missing', presented, 'the request carried no signature.')
      }
      if (!signatureMatches(rawBody, presented)) {
        refuse(
          'signature_mismatch',
          presented,
          'the signature does not match the HMAC-SHA256 of the raw body.',
        )
      }

      const payload = parsePayload(rawBody, presented, refuse)
      const id = requiredPayloadString(payload, 'id', presented, refuse)
      const providerRef = requiredPayloadString(payload, 'providerRef', presented, refuse)

      const type = payload.type
      if (typeof type !== 'string' || !isProviderEventType(type)) {
        refuse(
          'unknown_event_type',
          presented,
          `type ${describe(type)} is not one of ${PROVIDER_EVENT_TYPES.join(', ')}. ` +
            'An event nobody understands is not an event that did nothing.',
        )
      }

      const status = payload.status ?? null
      if (status !== null && (typeof status !== 'string' || !isOrderStatus(status))) {
        refuse(
          'unknown_order_status',
          presented,
          `status ${describe(status)} is not one of the order statuses ` +
            `${ORDER_STATUSES.join(', ')} (or null).`,
        )
      }

      const occurredAt = requiredPayloadDate(payload.occurredAt, presented, refuse)

      // The double normalises the verified body; it does not translate it.
      const event: ProviderEvent = {
        id,
        type,
        providerRef,
        orderId: optionalPayloadId(payload.orderId, 'orderId', presented, refuse),
        agreementId: optionalPayloadId(payload.agreementId, 'agreementId', presented, refuse),
        status,
        occurredAt,
        raw: rawBody,
      }
      return event
    },
  }
}

/** A URL the caller can hand to a browser; the double hosts nothing. */
function onboardingUrl(accountRef: string): string {
  return `https://fake-provider.invalid/onboard/${accountRef}`
}

/** Fetch a recorded payment or refuse with the offending ref named. */
function requirePayment(
  paymentsByRef: Map<string, RecordedPayment>,
  providerRef: string,
  caller: string,
): RecordedPayment {
  const payment = paymentsByRef.get(providerRef)
  if (payment === undefined) {
    throw new Error(
      `fake provider: ${caller}(${providerRef}) — no such payment. The double reports on ` +
        'charges it recorded; it does not invent a provider-side fact for a ref it never issued.',
    )
  }
  return payment
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`fake provider: ${field} must be a non-empty string (got ${describe(value)}).`)
  }
  return value
}

/** Money is integer cents and strictly positive: there is no such charge as 0. */
function requireAmount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(
      `fake provider: ${field} must be a positive integer number of cents (got ${describe(value)}).`,
    )
  }
  return value
}

/** `feeCents` may legitimately be 0 — a Trade leg with no fee — so 0 is allowed here. */
function requireNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(
      `fake provider: ${field} must be a non-negative integer number of cents ` +
        `(got ${describe(value)}).`,
    )
  }
  return value
}

function requireDate(value: unknown, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(
      `fake provider: ${field} must be a valid Date (got ${describe(value)}).\n` +
        'A string date is refused on purpose: parsing it here would mean the double, not the ' +
        'provider, decided when something happened.',
    )
  }
  return value
}

function requireCadence(value: unknown): (typeof CADENCES)[number] {
  if (typeof value !== 'string' || !(CADENCES as readonly string[]).includes(value)) {
    throw new Error(
      `fake provider: createSubscription.cadence must be one of ${CADENCES.join(', ')} ` +
        `(got ${describe(value)}).`,
    )
  }
  return value as (typeof CADENCES)[number]
}

function parsePayload(rawBody: string, signature: string, refuse: Refuse): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch (cause) {
    // The parse error is included, never swallowed: "invalid JSON" without the
    // token that broke it is a message an operator cannot act on.
    return refuse(
      'malformed_payload',
      signature,
      `the body is not JSON (${cause instanceof Error ? cause.message : describe(cause)}).`,
    )
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return refuse('malformed_payload', signature, 'the body is not a JSON object.')
  }
  return parsed as Record<string, unknown>
}

/**
 * `occurredAt` crosses the seam as an ISO-8601 string, because a webhook body is
 * JSON and a Date does not survive serialisation. Reading it is a normalisation
 * of the provider's own account of when the event happened, NOT an invention —
 * which is why an unreadable value is refused rather than replaced with "now".
 */
function requiredPayloadDate(value: unknown, signature: string, refuse: Refuse): Date {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return refuse(
      'malformed_payload',
      signature,
      `payload.occurredAt must be an ISO-8601 string (got ${describe(value)}).`,
    )
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return refuse(
      'malformed_payload',
      signature,
      `payload.occurredAt ${JSON.stringify(value)} is not a parseable date.`,
    )
  }
  return parsed
}

function requiredPayloadString(
  payload: Record<string, unknown>,
  field: string,
  signature: string,
  refuse: Refuse,
): string {
  const value = payload[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    return refuse(
      'malformed_payload',
      signature,
      `payload.${field} must be a non-empty string (got ${describe(value)}).`,
    )
  }
  return value
}

/** `orderId` / `agreementId` are null for events that concern neither. */
function optionalPayloadId(
  value: unknown,
  field: string,
  signature: string,
  refuse: Refuse,
): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || value.trim().length === 0) {
    return refuse(
      'malformed_payload',
      signature,
      `payload.${field} must be a non-empty string or null (got ${describe(value)}).`,
    )
  }
  return value
}

function isProviderEventType(value: string): value is ProviderEventType {
  return (PROVIDER_EVENT_TYPES as readonly string[]).includes(value)
}

function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value)
}

/** Print the offending value in a message without assuming its type. */
function describe(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (value instanceof Date) return `Date(${value.toISOString()})`
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (Array.isArray(value)) return `an array of ${value.length}`
  return typeof value
}
