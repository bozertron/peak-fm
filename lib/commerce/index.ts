/**
 * The payment provider resolver — PEAK-230, unit 230-3 of 4.
 *
 * THIS FILE IS THE ONLY PLACE THAT KNOWS A CONCRETE PROVIDER EXISTS. A surface
 * that needs money calls `getPaymentProvider()`, receives a `PaymentProvider`
 * (the interface in `./provider.ts`, which is `docs/PEAK-COMMERCE.md` §2
 * verbatim) and never imports an implementation. That is the whole mechanism
 * behind PEAK-230's acceptance criterion "when a second provider is added, then
 * no surface code changes": adding Stripe, a manual recorder, or anything else
 * means adding one case to `resolveProvider` below and nothing anywhere else.
 * If a surface ever does `import { StripeProvider } from '@/lib/commerce/stripe'`,
 * the seam has been broken and the acceptance criterion is false.
 *
 * WHAT IS TRUE RIGHT NOW, AND WHY IT THROWS INSTEAD OF RETURNING SOMETHING.
 * No provider implementation exists in this build: PEAK-231 (Stripe Connect)
 * owns `lib/commerce/stripe.ts` and is **blocked by D4**, which is not a code
 * decision — whether Peak holds funds at any point is a regulatory posture in
 * Canada and is the owner's call (`tickets/peak-cloud/OPEN-DECISIONS.md` § D4).
 * A resolver that returned *something* for an unconfigured or unimplemented
 * provider would be putting a fake into a real money path, which is exactly
 * what rule 3 of the governed PROHIBITED block forbids: the in-memory double in
 * `tests/commerce/fake-provider.ts` is a test seam, and a test double must
 * never stand in for a live payment rail. So every path that has no real
 * implementation raises `PaymentProviderConfigError` — named, so a caller can
 * tell "the deployment is misconfigured or unbuilt" from "the provider
 * failed" — and the message says what to do and which decision blocks it.
 *
 * Server-only by construction: no `'use client'`, no browser API, and the only
 * environment it reads is `PEAK_PAYMENT_PROVIDER`, a server variable. No
 * provider secret is read here at all, and none may be handed to a client
 * (`docs/PEAK-COMMERCE.md` §4 rule 4); only a provider implementation, once
 * one exists, decides what crosses to the buyer, and it is a `clientSecret`.
 *
 * The resolution is read per call rather than cached: an env change (a test
 * setting and restoring the variable, an operator flipping it behind a flag)
 * must be visible on the next call, and a module-level cache would freeze
 * whichever deployment state happened to be present at import time.
 */
import type { PaymentProvider } from './provider'

/**
 * Every provider name this seam recognises, as a runtime tuple.
 *
 * The tuple is the single source of the vocabulary: `PaymentProviderName` is
 * derived from it and the "accepted values" text in the configuration error is
 * built from it, so the type, the validation and the error message cannot
 * drift apart. This mirrors the closed-vocabulary convention the repo already
 * uses for `PROVIDER_EVENT_TYPES` (`lib/commerce/provider.ts`) and
 * `ORDER_STATUSES` (`lib/db/schema/_shared.ts`).
 *
 * `stripe` is the Connect implementation PEAK-231 owns. `manual` is the
 * out-of-band recorder (a provider that moves no money electronically) and has
 * no ticket of its own yet; both are recognised here, and neither has an
 * implementation in this build.
 */
export const PAYMENT_PROVIDER_NAMES = ['stripe', 'manual'] as const

/** The recognised provider names: exactly `'stripe' | 'manual'`. */
export type PaymentProviderName = (typeof PAYMENT_PROVIDER_NAMES)[number]

/** The environment variable a deployment sets to select a provider. */
export const PAYMENT_PROVIDER_ENV_VAR = 'PEAK_PAYMENT_PROVIDER'

/** The ticket that owns the first provider implementation; the decision blocking it is stated in `D4_REASON`. */
const PROVIDER_IMPLEMENTATION_TICKET = 'PEAK-231'

/**
 * A configuration failure: the provider could not be resolved.
 *
 * Named rather than a bare `Error` so a caller can distinguish "this
 * deployment cannot take money because it is not configured or the provider is
 * not built" from a runtime provider failure — those want different handling
 * (surface the misconfiguration and refuse, versus retry/refund/reconcile).
 */
export class PaymentProviderConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaymentProviderConfigError'
  }
}

/**
 * `process.env.X` on a name that was never set is `undefined`, but a variable
 * that was set to the empty string is `''`, and a deployment that exports
 * `PEAK_PAYMENT_PROVIDER=` has not chosen a provider either. Both are treated
 * as unset, and whitespace is trimmed so `" stripe "` is `stripe`.
 */
function readRawProviderValue(): string | null {
  const raw = process.env[PAYMENT_PROVIDER_ENV_VAR]
  if (raw === undefined) return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

/** The D4 sentence both configuration errors carry; stated once so it cannot rot in one place only. */
const D4_REASON =
  'No provider implementation ships yet: provider code is PEAK-231, and it is blocked by D4 — ' +
  'whether Peak holds funds is a regulatory posture in Canada, a decision for the owner and their ' +
  'advisers, not a code default.'

/** Built from the tuple, so an unrecognised value is always told the same list the validator uses. */
function acceptedValues(): string {
  return PAYMENT_PROVIDER_NAMES.join(', ')
}

function unrecognisedValueError(raw: string): PaymentProviderConfigError {
  return new PaymentProviderConfigError(
    `${PAYMENT_PROVIDER_ENV_VAR} is set to ${JSON.stringify(raw)}, which is not a payment ` +
      `provider Peak recognises. Accepted values: ${acceptedValues()}. Matching is on the ` +
      'trimmed, lower-cased value, so "  Stripe  " selects stripe.',
  )
}

function unconfiguredError(): PaymentProviderConfigError {
  return new PaymentProviderConfigError(
    `No payment provider is configured: ${PAYMENT_PROVIDER_ENV_VAR} is unset (or empty). Set it ` +
      `to one of: ${acceptedValues()}. ${D4_REASON}`,
  )
}

function notImplementedError(name: PaymentProviderName): PaymentProviderConfigError {
  return new PaymentProviderConfigError(
    `${PAYMENT_PROVIDER_ENV_VAR} is set to "${name}", which Peak recognises but which is not ` +
      `yet implemented in this build: there is no ${name} provider to resolve. ${D4_REASON} ` +
      `${PROVIDER_IMPLEMENTATION_TICKET} is the ticket that adds a provider implementation. ` +
      'Refusing to return anything in its place: a test double must never serve a production money path.',
  )
}

/**
 * The configured provider name, normalised, or `null` when none is configured.
 *
 * `null` means "nothing has been selected" — unset, empty or whitespace-only.
 * It does NOT mean "unrecognised": a value that was set but is not a name this
 * seam knows is a typo in a deployment, and it raises rather than being folded
 * into `null`, because returning `null` for `stripey` would hide the mistake
 * and let a later caller report the wrong problem ("no provider configured")
 * for a configuration that was in fact wrong.
 */
export function configuredProviderName(): PaymentProviderName | null {
  const raw = readRawProviderValue()
  if (raw === null) return null
  const normalised = raw.toLowerCase()
  if (!isPaymentProviderName(normalised)) {
    throw unrecognisedValueError(raw)
  }
  return normalised
}

const PAYMENT_PROVIDER_NAME_SET: ReadonlySet<string> = new Set<string>(PAYMENT_PROVIDER_NAMES)

/**
 * Widened to `string` on purpose: the caller passes a value read from the
 * environment, which the compiler believes is a provider name only because of
 * the check this predicate performs. A cast here would make the rest of the
 * module's exhaustiveness a lie.
 */
function isPaymentProviderName(value: string): value is PaymentProviderName {
  return PAYMENT_PROVIDER_NAME_SET.has(value)
}

/**
 * Turn a validated name into an implementation.
 *
 * This is the one and only mapping from a name to a concrete class, which is
 * what makes "a second provider changes no surface code" true. When PEAK-231
 * lands, `case 'stripe'` becomes `return createStripeProvider(...)` and
 * `case 'manual'` becomes the manual recorder, both imported HERE and nowhere
 * else in a surface. Until then each branch refuses, and `PaymentProviderName`
 * being a closed union means a newly recognised name cannot be added without a
 * case appearing here — the compiler will not let this become partial.
 */
function resolveProvider(name: PaymentProviderName): PaymentProvider {
  switch (name) {
    case 'stripe':
      throw notImplementedError(name)
    case 'manual':
      throw notImplementedError(name)
  }
}

/**
 * The configured provider.
 *
 * Throws `PaymentProviderConfigError` in every state this build can be in:
 *   - `PEAK_PAYMENT_PROVIDER` unset/empty  → names the variable and cites D4;
 *   - a value that is not a known name     → lists the accepted values;
 *   - a known name with no implementation  → names it and points at PEAK-231.
 *
 * It returns a `PaymentProvider` only once a real implementation exists for the
 * configured name. It never returns the test double, and it never falls back to
 * a default provider: an unselected payment rail is a state the deployment must
 * fix, not a state a default should paper over.
 */
export function getPaymentProvider(): PaymentProvider {
  const name = configuredProviderName()
  if (name === null) {
    throw unconfiguredError()
  }
  return resolveProvider(name)
}

/**
 * The seam's types and behaviour, so a surface has one import site.
 *
 * `OrderStatus` is re-exported because it is part of this seam's vocabulary:
 * `ProviderEvent.status` (in `./provider.ts`) and the order state machine (in
 * `./state.ts`) both speak it, so a surface reconciling a provider event needs
 * it without reaching past `@/lib/commerce` into the database schema module.
 */
export type { OrderStatus } from '@/lib/db/schema'
export * from './provider'
export * from './state'
