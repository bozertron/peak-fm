/**
 * tests/commerce/index.test.ts — PEAK-230 unit 230-3 of 4: the provider resolver.
 *
 * WHAT THIS FILE PROVES, and the assertion that proves it:
 *   1. unset/empty `PEAK_PAYMENT_PROVIDER` is refused, and the refusal names the
 *      variable and cites D4                       → message matches /PEAK_PAYMENT_PROVIDER/ and /D4/
 *   2. a recognised name with no implementation is refused as not yet
 *      implemented and points at PEAK-231         → message matches /not yet implemented/ and /PEAK-231/
 *   3. no recognised name resolves to an object in this build — including
 *      `manual`, so the test double can never be wired in as a fallback
 *                                                  → every name throws PaymentProviderConfigError
 *   4. a value that is not a recognised name is refused and told the accepted
 *      values, from the module's own vocabulary    → message matches /Accepted values: stripe, manual/
 *   5. `configuredProviderName()` is null when nothing is selected and normalises
 *      case and surrounding whitespace             → `'  STRIPE  '` → `'stripe'`, `'Manual'` → `'manual'`
 *   6. the barrel is a real seam: its types and its behaviour are reachable from
 *      `@/lib/commerce` alone                      → PaymentProvider/OrderStatus used in TYPE positions,
 *                                                     plus provider.ts and state.ts exports asserted at runtime
 *
 * WHY THE UNCONFIGURED CASE MUST THROW RATHER THAN FALL BACK. The in-memory
 * provider in `tests/commerce/fake-provider.ts` is a test double for the
 * contract tests, and rule 3 of the governed PROHIBITED block forbids a fake in
 * a production code path. A resolver that returned that double when nothing was
 * configured would look green in every environment and move no real money —
 * the most dangerous possible failure for a payment seam. So the property this
 * file asserts is negative on purpose: NOTHING comes back from
 * `getPaymentProvider()` in this build, for any configured state.
 *
 * WHY D4 IS ASSERTED BY TEXT. D4 (does Peak hold funds) is not a code decision,
 * and the consumer of this error is a human reading a deployment log. The
 * message is the interface, so the test pins the parts a human needs: the
 * variable to set, the decision that blocks the work, and the ticket that
 * unblocks it.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  configuredProviderName,
  getPaymentProvider,
  type OrderStatus,
  PAYMENT_PROVIDER_ENV_VAR,
  PAYMENT_PROVIDER_NAMES,
  type PaymentProvider,
  PaymentProviderConfigError,
  PROVIDER_EVENT_TYPES,
  transition,
} from '@/lib/commerce'

/** The value the process had before the suite ran; restored after every test so no test leaks state. */
const ORIGINAL_PROVIDER_ENV = process.env[PAYMENT_PROVIDER_ENV_VAR]

beforeEach(() => {
  // Every test starts from "no provider selected", whatever the shell or a
  // previous test left behind, and sets the value it is actually exercising.
  delete process.env[PAYMENT_PROVIDER_ENV_VAR]
})

afterEach(() => {
  // `delete`, not `= undefined`: assigning `undefined` to a process.env key
  // stores the STRING "undefined" in Node, which would look like a configured
  // — and unrecognised — provider to the next caller.
  if (ORIGINAL_PROVIDER_ENV === undefined) {
    delete process.env[PAYMENT_PROVIDER_ENV_VAR]
  } else {
    process.env[PAYMENT_PROVIDER_ENV_VAR] = ORIGINAL_PROVIDER_ENV
  }
})

/**
 * A TYPE-POSITION use of both seam types, so this file cannot compile unless the
 * barrel exports them. The ticket requires the barrel to carry the seam's types,
 * and a compile failure is the only assertion that tests an export; the runtime
 * assertions below keep these values from being unused.
 */
const ORDER_STATUSES_USED_AT_TYPE_LEVEL: OrderStatus[] = ['pending', 'authorized']
const PROVIDER_NAME_FIELD: keyof PaymentProvider = 'name'
const GET_PROVIDER_SIGNATURE: () => PaymentProvider = getPaymentProvider

/**
 * Run `fn`, which is expected to throw, and return the thrown `Error`.
 *
 * Deliberately fails loudly when nothing was thrown and when the thrown value is
 * not an `Error`: a helper that returned `undefined` on a non-throwing call
 * would let this file's negative assertions pass for the wrong reason.
 */
function errorFrom(fn: () => unknown): Error {
  try {
    fn()
  } catch (error) {
    if (error instanceof Error) return error
    throw new Error(`expected the call to throw an Error, but it threw ${String(error)}`)
  }
  throw new Error('expected the call to throw, but it returned normally')
}

describe('getPaymentProvider — no provider can be resolved in this build', () => {
  test('unset: refuses, naming PEAK_PAYMENT_PROVIDER and citing D4', () => {
    const error = errorFrom(() => getPaymentProvider())

    expect(error).toBeInstanceOf(PaymentProviderConfigError)
    expect(error.name).toBe('PaymentProviderConfigError')
    expect(error.message).toMatch(/PEAK_PAYMENT_PROVIDER/)
    expect(error.message).toMatch(/D4/)
    expect(error.message).toMatch(/regulatory/)
  })

  test('stripe: refuses as not yet implemented and points at PEAK-231', () => {
    process.env[PAYMENT_PROVIDER_ENV_VAR] = 'stripe'

    const error = errorFrom(() => getPaymentProvider())

    expect(error).toBeInstanceOf(PaymentProviderConfigError)
    expect(error.message).toMatch(/"stripe"/)
    expect(error.message).toMatch(/not yet implemented/)
    expect(error.message).toMatch(/PEAK-231/)
  })

  test('manual: also refused, so the test double is never reachable as a fallback', () => {
    process.env[PAYMENT_PROVIDER_ENV_VAR] = 'manual'

    const error = errorFrom(() => getPaymentProvider())

    expect(error).toBeInstanceOf(PaymentProviderConfigError)
    expect(error.message).toMatch(/"manual"/)
    expect(error.message).toMatch(/not yet implemented/)
  })

  test('every recognised name is refused — no configured state returns a provider', () => {
    expect(PAYMENT_PROVIDER_NAMES.length).toBeGreaterThan(0)
    for (const name of PAYMENT_PROVIDER_NAMES) {
      process.env[PAYMENT_PROVIDER_ENV_VAR] = name
      const error = errorFrom(() => getPaymentProvider())
      expect(error).toBeInstanceOf(PaymentProviderConfigError)
      expect(error.message).toContain(name)
    }
  })

  test('an unrecognised value is refused and told the accepted values', () => {
    process.env[PAYMENT_PROVIDER_ENV_VAR] = 'stripey'

    const error = errorFrom(() => getPaymentProvider())

    expect(error).toBeInstanceOf(PaymentProviderConfigError)
    expect(error.message).toMatch(/stripey/)
    expect(error.message).toMatch(/Accepted values: stripe, manual/)
    // The validator and the accepted-values list are built from the same tuple,
    // so `configuredProviderName()` must refuse the typo the same way rather
    // than folding it into `null` and reporting "nothing configured".
    const fromName = errorFrom(() => configuredProviderName())
    expect(fromName.message).toMatch(/Accepted values: stripe, manual/)
  })
})

describe('configuredProviderName — selection, not resolution', () => {
  test('null when unset, empty or whitespace only', () => {
    expect(configuredProviderName()).toBeNull()

    process.env[PAYMENT_PROVIDER_ENV_VAR] = ''
    expect(configuredProviderName()).toBeNull()

    process.env[PAYMENT_PROVIDER_ENV_VAR] = '   '
    expect(configuredProviderName()).toBeNull()
  })

  test('normalises surrounding whitespace and case', () => {
    process.env[PAYMENT_PROVIDER_ENV_VAR] = '  STRIPE  '
    expect(configuredProviderName()).toBe('stripe')

    process.env[PAYMENT_PROVIDER_ENV_VAR] = 'Manual'
    expect(configuredProviderName()).toBe('manual')

    process.env[PAYMENT_PROVIDER_ENV_VAR] = 'STRIPE'
    expect(configuredProviderName()).toBe('stripe')
  })
})

describe('the @/lib/commerce barrel is the seam', () => {
  test('exposes the seam types and the behaviour of every module it re-exports', () => {
    expect(ORDER_STATUSES_USED_AT_TYPE_LEVEL).toEqual(['pending', 'authorized'])
    expect(PROVIDER_NAME_FIELD).toBe('name')
    expect(GET_PROVIDER_SIGNATURE).toBe(getPaymentProvider)

    // provider.ts and state.ts are reachable through this one import site.
    expect(PROVIDER_EVENT_TYPES).toContain('payment.captured')
    expect(typeof transition).toBe('function')
    expect(PAYMENT_PROVIDER_NAMES).toEqual(['stripe', 'manual'])
  })
})
