/**
 * The payment provider seam — PEAK-230.
 *
 * Four surfaces move money and they do not move it the same way. Buy and Sell
 * are one-off marketplace payments, Rent collects on a schedule, and Trade
 * often moves no money at all — or money as one leg of a barter. Forcing a
 * barter leg through a card rail would distort the product, so every surface
 * talks to this interface and to nothing provider-specific.
 *
 * The interface below is `docs/PEAK-COMMERCE.md` §2, reproduced verbatim: no
 * method, field, name or ordering is added, renamed or "improved". The Stripe
 * Connect mapping in §3 belongs to the Stripe implementation, not to the seam.
 *
 * Two rules from §4 shape these types:
 *   1. The database is the record of intent; the provider is the record of
 *      fact. `ProviderEvent` is how a fact crosses back over the seam, and
 *      nothing here infers payment status from Peak's own tables.
 *   2. Webhook signatures are verified. `verifyWebhook` is the only door an
 *      event may come through, and it is the only place a signature is checked.
 *
 * Contract only: no fee math, no tax treatment, no refund rules, no provider
 * SDK, no mutation of Peak's tables. Implementations live beside this file;
 * resolving one from configuration is the job of the resolver in
 * `lib/commerce/index.ts`.
 */
import type { OrderStatus } from '@/lib/db/schema'

export interface PaymentProvider {
  readonly name: string

  /** Seller onboarding — KYC, payout details. Returns a hosted URL. */
  createSellerAccount(userId: string): Promise<{ accountRef: string; onboardingUrl: string }>
  getSellerStatus(accountRef: string): Promise<{ chargesEnabled: boolean; payoutsEnabled: boolean }>

  /** One-off purchase. Idempotent on `orderId`. */
  createPayment(input: {
    orderId: string
    amountCents: number
    currency: string
    buyerId: string
    sellerAccountRef: string
    feeCents: number
  }): Promise<{ providerRef: string; clientSecret: string }>

  capturePayment(providerRef: string): Promise<{ status: string }>
  refundPayment(providerRef: string, amountCents?: number): Promise<{ status: string }>

  /** Recurring collection for a rental auto-pay contract. */
  createSubscription(input: {
    agreementId: string
    amountCents: number
    currency: string
    cadence: 'weekly' | 'biweekly' | 'monthly'
    startAt: Date
    endAt?: Date
    payerId: string
    sellerAccountRef: string
  }): Promise<{ providerRef: string }>

  cancelSubscription(providerRef: string): Promise<{ status: string }>

  /** Verify and normalise an inbound webhook. Signature check is mandatory. */
  verifyWebhook(rawBody: string, signature: string): Promise<ProviderEvent>
}

/**
 * The closed vocabulary of provider events this seam recognises.
 *
 * Declared as a runtime tuple alongside its derived type, following the repo's
 * own convention for closed vocabularies (see the status vocabularies in
 * `lib/db/schema/_shared.ts`). The tuple exists so an implementation can
 * *refuse* an event type it does not understand rather than silently ignoring
 * it: an event nobody understands is not an event that did nothing.
 *
 * `payment.*` events concern a `PaymentIntent`; `subscription.updated` concerns
 * a subscription on an auto-pay contract; `account.updated` concerns a
 * connected seller account (KYC or payout capability changed). Subscription
 * status changes are carried by a single `subscription.updated` rather than a
 * per-state variant, because a subscription's own state vocabulary is the
 * provider's to define and is reported in `raw`, not modelled here.
 */
export const PROVIDER_EVENT_TYPES = [
  'payment.authorized',
  'payment.captured',
  'payment.failed',
  'payment.refunded',
  'payment.disputed',
  'subscription.updated',
  'account.updated',
] as const

export type ProviderEventType = (typeof PROVIDER_EVENT_TYPES)[number]

/**
 * A verified, normalised inbound webhook — the shape `verifyWebhook` returns.
 *
 * `verifyWebhook` is the only producer: an instance of this type means the
 * signature was checked against the raw body and accepted. An unverified
 * delivery never becomes a `ProviderEvent`; it is rejected with a reason.
 *
 * This is a normalisation, not a translation of the whole payload. `raw` keeps
 * the provider's own account of what happened; the fields above it are the
 * minimum Peak needs to join the fact to its own record of intent and decide
 * whether to move an order.
 */
export interface ProviderEvent {
  /**
   * The provider's own stable id for this event (Stripe `event.id`). It is
   * never generated here and never derived from the payload: a replayed
   * delivery of the same event carries the same id, which is what makes a
   * replay detectable. An application of an event must record this id, so a
   * second delivery can be recognised and skipped instead of double-applied.
   */
  id: string

  /** What happened, from the closed vocabulary above. */
  type: ProviderEventType

  /**
   * The provider-side object this event is about — the join to Peak's records
   * through `order.providerRef` / `autopay_contract.providerRef`: the payment
   * ref for `payment.*`, the subscription ref for `subscription.updated`, and
   * the connected-account ref (`createSellerAccount` → `accountRef`) for
   * `account.updated`.
   */
  providerRef: string

  /**
   * The Peak order this concerns, where the event concerns one — `order.id`.
   * Null for events that are not about a purchase (a subscription or a seller
   * account). Where both ids are null the event moves no order.
   */
  orderId: string | null

  /**
   * The Peak auto-pay contract this concerns, where the event concerns one —
   * `autopay_contract.agreementId` is the key, and this carries the agreement
   * id. Null for events that are not about a schedule.
   */
  agreementId: string | null

  /**
   * The Peak order status this event asserts, drawn from the vocabulary in
   * `lib/db/schema/_shared.ts` — the same union the `order.status` column
   * carries, imported rather than restated so the two can never drift.
   *
   * Null where the event carries no order-status meaning at all (a seller's
   * KYC state changing does not move an order). Null is deliberate and is not
   * a synonym for "pending": it means "this event says nothing about an
   * order", and a consumer must handle it rather than assume one.
   */
  status: OrderStatus | null

  /** When the event happened at the provider, not when we received it. */
  occurredAt: Date

  /**
   * The exact request body whose signature was verified, kept whole for the
   * audit trail. It stays a string on purpose: re-serialising a parsed payload
   * would no longer be the bytes that were signed, so a later audit could not
   * re-verify the signature and a tampered body could pass unnoticed.
   */
  raw: string
}
