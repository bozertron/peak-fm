/**
 * tests/commerce/provider-contract.test.ts — PEAK-230, unit 4 of 4.
 *
 * WHAT THIS FILE IS FOR
 * PEAK-230's acceptance criteria are about the SEAM, not about a provider:
 *
 *   - 230.A4 "duplicate `createPayment` for one `orderId` produces ONE charge"
 *     — asserted here by counting what the double recorded and comparing the two
 *     `providerRef`s, because a real provider would look identical either way.
 *   - 230.A5 "an unsigned/invalid webhook is rejected AND logged, never
 *     processed" — asserted here by the throw AND the entry in `rejections`.
 *   - PEAK-COMMERCE.md §4.4 "no secret reaches the client" — asserted by the
 *     exact key set of what `createPayment` returns and by scanning every value
 *     the double hands back for the signing secret.
 *
 * THE COMPLETENESS TEST IS THE POINT OF THE FILE
 * `CONTRACT_METHODS` below is the interface written out as a RUNTIME list, and
 * the compile-time half of the first test (`Record<Missing, never>`) stops
 * compiling the moment `PaymentProvider` gains a member that is not in it. So if
 * the interface ever grows — the exact event this ticket exists to make safe —
 * `pnpm typecheck` fails HERE, in the file that claims to prove the seam, rather
 * than in whichever surface silently stopped implementing it.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 * No database. Nothing here inspects `order` rows or reconciliation: rule 1 says
 * the database is the record of intent and the provider the record of fact, and
 * the double exists to be the FACT side. A test that read Peak's tables to
 * decide what the provider did would be inferring one from the other, which is
 * the rule this ticket is written to prevent.
 */

import { describe, expect, test } from 'vitest'
import {
  PROVIDER_EVENT_TYPES,
  type PaymentProvider,
  type ProviderEvent,
} from '@/lib/commerce/provider'
import { ORDER_STATUSES } from '@/lib/db/schema'
import {
  WebhookRejectedError,
  createFakeProvider,
  FAKE_PROVIDER_NAME,
} from '@/tests/commerce/fake-provider'

/**
 * The interface, as a runtime list — every member `PaymentProvider` declares,
 * in the order the spec prints them. The `satisfies` clause rejects a name that
 * is not a member; the compile-time check in the first test rejects a member
 * that is not a name.
 */
const CONTRACT_METHODS = [
  'createSellerAccount',
  'getSellerStatus',
  'createPayment',
  'capturePayment',
  'refundPayment',
  'createSubscription',
  'cancelSubscription',
  'verifyWebhook',
] as const satisfies readonly (keyof PaymentProvider)[]

/** The prose member of the interface, pinned separately: it is not a method. */
const CONTRACT_PROPERTIES = ['name'] as const satisfies readonly (keyof PaymentProvider)[]

/** The double's own observation surface — NOT part of the seam. */
const OBSERVATION_MEMBERS = ['charges', 'refunds', 'rejections', 'sign', 'secrets'] as const

/** The secret a test injects, so "does not leak" is about a value, not a default. */
const SIGNING_SECRET = 'contract-test-signing-secret-value'

const OCCURRED_AT = '2026-09-19T12:00:00.000Z'

/** A payment input with every field the interface names. */
const PAYMENT_INPUT = {
  orderId: 'order-alpha',
  amountCents: 259_900,
  currency: 'cad',
  buyerId: 'buyer-1',
  sellerAccountRef: 'seller-acct-1',
  feeCents: 7_500,
}

/** A signed webhook body, exactly as a provider would post it. */
function webhookBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'evt_0001',
    type: 'payment.captured',
    providerRef: 'fake_pi_1',
    orderId: PAYMENT_INPUT.orderId,
    agreementId: null,
    status: 'paid',
    occurredAt: OCCURRED_AT,
    ...overrides,
  })
}

/**
 * Run a call that must be refused and hand back the error, ASSERTING its class.
 * `rejects.toThrow(/re/)` alone would not distinguish "refused without a
 * signature" from "crashed for an unrelated reason" — a distinction the ticket's
 * rule 3 turns on, since the refusal has to be for the right cause.
 */
async function refusalFrom(fn: () => Promise<unknown>): Promise<WebhookRejectedError> {
  try {
    await fn()
  } catch (error) {
    if (error instanceof WebhookRejectedError) return error
    throw new Error(
      `expected a WebhookRejectedError, but the call rejected with ` +
        `${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
    )
  }
  throw new Error('expected the call to refuse, but it resolved successfully')
}

/** Every value the double returned, serialised, for the "no secret leaked" sweep. */
function allReturnedValues(values: unknown[]): string {
  return values.map((value) => JSON.stringify(value) ?? 'undefined').join('\n')
}

describe('PaymentProvider contract, proven against the tests-only double', () => {
  test('the contract list covers every member of PaymentProvider', () => {
    type Declared = keyof PaymentProvider
    type Listed = (typeof CONTRACT_METHODS)[number] | (typeof CONTRACT_PROPERTIES)[number]
    type Missing = Exclude<Declared, Listed>

    // COMPILE-TIME HALF. `Record<Missing, never>` demands one property per
    // member the list forgot, so `{}` stops compiling as soon as the interface
    // grows a method — and `pnpm typecheck`, which this ticket's definition of
    // done already runs, fails here with the missing name in the error.
    const uncovered: Record<Missing, never> = {}
    expect(Object.keys(uncovered)).toEqual([])

    const provider = createFakeProvider({ signingSecret: SIGNING_SECRET })

    // RUNTIME HALF. Every listed method is really callable on the double...
    for (const method of CONTRACT_METHODS) {
      expect(typeof provider[method], `${method} must be a function on the double`).toBe('function')
    }
    for (const property of CONTRACT_PROPERTIES) {
      expect(provider[property]).toBe(FAKE_PROVIDER_NAME)
    }

    // ...and the double exposes NOTHING beyond the seam plus its documented
    // observation surface. A double that quietly grew a method would be a second
    // implementation of the seam with no owner.
    expect([...Object.keys(provider)].sort()).toEqual(
      [...CONTRACT_METHODS, ...CONTRACT_PROPERTIES, ...OBSERVATION_MEMBERS].sort(),
    )
  })

  test('every method of the interface answers once, in its documented shape', async () => {
    const provider = createFakeProvider({ signingSecret: SIGNING_SECRET })
    expect(provider.name).toBe(FAKE_PROVIDER_NAME)

    const account = await provider.createSellerAccount('seller-1')
    expect(Object.keys(account).sort()).toEqual(['accountRef', 'onboardingUrl'])
    expect(typeof account.accountRef).toBe('string')
    expect(account.accountRef.length).toBeGreaterThan(0)
    expect(account.onboardingUrl).toMatch(/^https:\/\//)

    const sellerStatus = await provider.getSellerStatus(account.accountRef)
    expect(Object.keys(sellerStatus).sort()).toEqual(['chargesEnabled', 'payoutsEnabled'])
    expect(typeof sellerStatus.chargesEnabled).toBe('boolean')
    expect(typeof sellerStatus.payoutsEnabled).toBe('boolean')

    const payment = await provider.createPayment({
      ...PAYMENT_INPUT,
      sellerAccountRef: account.accountRef,
    })
    expect(Object.keys(payment).sort()).toEqual(['clientSecret', 'providerRef'])
    expect(typeof payment.providerRef).toBe('string')
    expect(typeof payment.clientSecret).toBe('string')

    const capture = await provider.capturePayment(payment.providerRef)
    expect(Object.keys(capture)).toEqual(['status'])
    expect(typeof capture.status).toBe('string')

    const refund = await provider.refundPayment(payment.providerRef, 100)
    expect(Object.keys(refund)).toEqual(['status'])
    expect(typeof refund.status).toBe('string')

    const subscription = await provider.createSubscription({
      agreementId: 'agreement-1',
      amountCents: 120_000,
      currency: 'cad',
      cadence: 'monthly',
      startAt: new Date('2026-10-01T00:00:00.000Z'),
      endAt: new Date('2027-10-01T00:00:00.000Z'),
      payerId: 'buyer-1',
      sellerAccountRef: account.accountRef,
    })
    expect(Object.keys(subscription)).toEqual(['providerRef'])
    expect(typeof subscription.providerRef).toBe('string')

    const cancelled = await provider.cancelSubscription(subscription.providerRef)
    expect(Object.keys(cancelled)).toEqual(['status'])
    expect(typeof cancelled.status).toBe('string')

    const body = webhookBody({ providerRef: payment.providerRef })
    const event = await provider.verifyWebhook(body, provider.sign(body))
    expect(Object.keys(event).sort()).toEqual([
      'agreementId',
      'id',
      'occurredAt',
      'orderId',
      'providerRef',
      'raw',
      'status',
      'type',
    ])
    expect(event.occurredAt).toBeInstanceOf(Date)
    expect(event.occurredAt.toISOString()).toBe(OCCURRED_AT)
  })

  test('createPayment is idempotent on orderId: one charge, one providerRef', async () => {
    const provider = createFakeProvider({ signingSecret: SIGNING_SECRET })

    const first = await provider.createPayment(PAYMENT_INPUT)
    // The retried call a flaky network produces: identical input, second request.
    const second = await provider.createPayment({ ...PAYMENT_INPUT })

    expect(provider.charges).toHaveLength(1)
    expect(second.providerRef).toBe(first.providerRef)
    expect(second.clientSecret).toBe(first.clientSecret)
    expect(provider.charges[0]).toEqual({
      orderId: PAYMENT_INPUT.orderId,
      providerRef: first.providerRef,
      amountCents: PAYMENT_INPUT.amountCents,
    })
  })

  test('two different orderIds produce two charges (idempotency is keyed on the order)', async () => {
    const provider = createFakeProvider({ signingSecret: SIGNING_SECRET })

    const first = await provider.createPayment(PAYMENT_INPUT)
    const second = await provider.createPayment({
      ...PAYMENT_INPUT,
      orderId: 'order-beta',
      amountCents: 4_200,
    })

    expect(provider.charges).toHaveLength(2)
    // A double that always returned its first ref would also pass a one-order
    // idempotency test; this is the assertion that rules that out.
    expect(second.providerRef).not.toBe(first.providerRef)
    expect(provider.charges.map((charge) => charge.orderId)).toEqual(['order-alpha', 'order-beta'])
  })

  test('a re-used orderId with a different amount is refused, not silently re-priced', async () => {
    const provider = createFakeProvider({ signingSecret: SIGNING_SECRET })
    const first = await provider.createPayment(PAYMENT_INPUT)

    await expect(
      provider.createPayment({ ...PAYMENT_INPUT, amountCents: PAYMENT_INPUT.amountCents + 1 }),
    ).rejects.toThrow(/already has a charge/)
    expect(provider.charges).toHaveLength(1)
    expect(provider.charges[0]?.providerRef).toBe(first.providerRef)
  })

  test('an unsigned webhook is rejected AND recorded, and moves nothing', async () => {
    const provider = createFakeProvider({ signingSecret: SIGNING_SECRET })
    const body = webhookBody()

    expect(provider.rejections).toHaveLength(0)

    await expect(provider.verifyWebhook(body, '')).rejects.toThrow(WebhookRejectedError)
    const refusal = await refusalFrom(() => provider.verifyWebhook(body, ''))

    expect(refusal.reason).toBe('signature_missing')
    expect(refusal.signature).toBe('')
    // RULE 3: "discarded and logged". The log is `rejections`; two attempts,
    // two entries — a silently dropped delivery would leave none.
    expect(provider.rejections).toEqual([
      { reason: 'signature_missing', signature: '' },
      { reason: 'signature_missing', signature: '' },
    ])
  })

  test('a body signed with the wrong secret is rejected and recorded as a mismatch', async () => {
    const provider = createFakeProvider({ signingSecret: SIGNING_SECRET })
    const attacker = createFakeProvider({ signingSecret: 'a-different-secret' })
    const body = webhookBody()

    const refusal = await refusalFrom(() => provider.verifyWebhook(body, attacker.sign(body)))

    expect(refusal.reason).toBe('signature_mismatch')
    expect(provider.rejections).toEqual([
      { reason: 'signature_mismatch', signature: attacker.sign(body) },
    ])
  })

  test('a body swapped AFTER signing is rejected (the signature covers the bytes sent)', async () => {
    const provider = createFakeProvider({ signingSecret: SIGNING_SECRET })
    const signed = webhookBody({ status: 'paid' })
    const tampered = webhookBody({ status: 'refunded' })

    const refusal = await refusalFrom(() => provider.verifyWebhook(tampered, provider.sign(signed)))

    expect(refusal.reason).toBe('signature_mismatch')
    expect(provider.rejections).toHaveLength(1)
  })

  test('a valid signature resolves to a ProviderEvent carrying type, status and providerRef', async () => {
    const provider = createFakeProvider({ signingSecret: SIGNING_SECRET })
    const payment = await provider.createPayment(PAYMENT_INPUT)
    const body = webhookBody({ providerRef: payment.providerRef })

    const event: ProviderEvent = await provider.verifyWebhook(body, provider.sign(body))

    expect(event.type).toBe('payment.captured')
    expect(event.status).toBe('paid')
    expect(ORDER_STATUSES).toContain(event.status)
    expect(event.providerRef).toBe(payment.providerRef)
    expect(event.orderId).toBe(PAYMENT_INPUT.orderId)
    expect(event.agreementId).toBeNull()
    expect(event.occurredAt).toEqual(new Date(OCCURRED_AT))
    // The raw bytes whose signature was verified, kept whole for the audit.
    expect(event.raw).toBe(body)
    expect(provider.rejections).toHaveLength(0)

    // The same delivery again carries the same provider id, which is what makes
    // a replayed webhook detectable downstream.
    const replay = await provider.verifyWebhook(body, provider.sign(body))
    expect(replay.id).toBe(event.id)
  })

  test('every event type in the closed vocabulary is accepted, and nothing outside it is', async () => {
    const provider = createFakeProvider({ signingSecret: SIGNING_SECRET })

    for (const type of PROVIDER_EVENT_TYPES) {
      const body = webhookBody({ id: `evt_${type}`, type })
      const event = await provider.verifyWebhook(body, provider.sign(body))
      expect(event.type).toBe(type)
    }
    expect(provider.rejections).toHaveLength(0)

    const unknown = webhookBody({ id: 'evt_nope', type: 'payment.teleported' })
    const refusal = await refusalFrom(() => provider.verifyWebhook(unknown, provider.sign(unknown)))
    expect(refusal.reason).toBe('unknown_event_type')
    expect(provider.rejections).toHaveLength(1)

    const badStatus = webhookBody({ id: 'evt_bad_status', status: 'al dente' })
    const statusRefusal = await refusalFrom(() =>
      provider.verifyWebhook(badStatus, provider.sign(badStatus)),
    )
    expect(statusRefusal.reason).toBe('unknown_order_status')
    expect(provider.rejections).toHaveLength(2)
  })

  test('a corrupted body is rejected as malformed rather than crashing the seam', async () => {
    const provider = createFakeProvider({ signingSecret: SIGNING_SECRET })
    const body = '{"id": "evt_0001", "type":'

    const refusal = await refusalFrom(() => provider.verifyWebhook(body, provider.sign(body)))

    expect(refusal.reason).toBe('malformed_payload')
    expect(refusal.message).toMatch(/not JSON/)
    expect(provider.rejections).toHaveLength(1)
  })

  test('no secret reaches a caller: only providerRef and clientSecret cross', async () => {
    const provider = createFakeProvider({ signingSecret: SIGNING_SECRET })
    expect(provider.secrets.signingSecret).toBe(SIGNING_SECRET)

    const account = await provider.createSellerAccount('seller-1')
    const sellerStatus = await provider.getSellerStatus(account.accountRef)
    const payment = await provider.createPayment({
      ...PAYMENT_INPUT,
      sellerAccountRef: account.accountRef,
    })
    const capture = await provider.capturePayment(payment.providerRef)
    const refund = await provider.refundPayment(payment.providerRef, 100)
    const subscription = await provider.createSubscription({
      agreementId: 'agreement-1',
      amountCents: 120_000,
      currency: 'cad',
      cadence: 'weekly',
      startAt: new Date('2026-10-01T00:00:00.000Z'),
      payerId: 'buyer-1',
      sellerAccountRef: account.accountRef,
    })
    const cancelled = await provider.cancelSubscription(subscription.providerRef)
    const body = webhookBody({ providerRef: payment.providerRef })
    const event = await provider.verifyWebhook(body, provider.sign(body))

    // RULE 4, first half: exactly the two keys the interface promises, so a
    // later "just add the signing secret to the client payload" change fails.
    expect(Object.keys(payment).sort()).toEqual(['clientSecret', 'providerRef'])

    // ...second half: the secret appears in NO value the double returned.
    const returned = allReturnedValues([
      account,
      sellerStatus,
      payment,
      capture,
      refund,
      subscription,
      cancelled,
      event,
      provider.charges,
      provider.refunds,
      provider.rejections,
    ])
    expect(returned).not.toContain(SIGNING_SECRET)
    expect(payment.clientSecret).not.toBe(SIGNING_SECRET)
    expect(JSON.stringify(provider.secrets)).toContain(SIGNING_SECRET)
  })
})
