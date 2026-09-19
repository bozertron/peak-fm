/**
 * The order state machine's regression suite — PEAK-230, unit 230-2.
 *
 * This unit's bar (Wave 1a, 230.A6) is "the order state machine is total: every
 * state's allowed transitions are defined, and illegal ones refuse". A handful
 * of examples cannot prove totality, so the central test below walks EVERY
 * `(from, to)` pair over `ORDER_STATUSES` — all 49 of them — and compares the
 * module against an independently written copy of the pinned ruling.
 *
 * The expected tables here are written out by hand rather than imported from
 * `lib/commerce/state.ts`. That independence is the point: the kill-mutation for
 * this unit (adding `refunded -> paid` to the module's table while leaving this
 * file alone) must turn the suite red, and it only can if the expectation is a
 * second source of truth rather than a mirror of the first.
 *
 * Nothing here touches the database. `lib/commerce/state.ts` is pure, and the
 * `ProviderEvent`s below are object literals — no provider SDK is involved.
 */
import { describe, expect, test } from 'vitest'
import {
  ORDER_TRANSITIONS,
  canTransition,
  isTerminal,
  statusForEvent,
  transition,
} from '@/lib/commerce/state'
import {
  PROVIDER_EVENT_TYPES,
  type ProviderEvent,
  type ProviderEventType,
} from '@/lib/commerce/provider'
import { ORDER_STATUSES, type OrderStatus } from '@/lib/db/schema'

/**
 * The pinned Wave 1a ruling, copied here on purpose — see the file header.
 *
 *     pending    -> authorized | cancelled
 *     authorized -> paid | cancelled
 *     paid       -> fulfilled | refunded | disputed
 *     fulfilled  -> refunded | disputed
 *     disputed   -> refunded
 *     refunded   -> (terminal)
 *     cancelled  -> (terminal)
 */
const PINNED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['authorized', 'cancelled'],
  authorized: ['paid', 'cancelled'],
  paid: ['fulfilled', 'refunded', 'disputed'],
  fulfilled: ['refunded', 'disputed'],
  disputed: ['refunded'],
  refunded: [],
  cancelled: [],
}

/** The status each provider event type asserts, per the unit's own mapping. */
const PINNED_EVENT_STATUS: Record<ProviderEventType, OrderStatus | null> = {
  'payment.authorized': 'authorized',
  'payment.captured': 'paid',
  'payment.failed': null,
  'payment.refunded': 'refunded',
  'payment.disputed': 'disputed',
  'subscription.updated': null,
  'account.updated': null,
}

/** A verified-looking event, built by hand: the state module needs no provider. */
function providerEvent(type: ProviderEventType, status: OrderStatus | null): ProviderEvent {
  return {
    id: `evt_${type}`,
    type,
    providerRef: `ref_${type}`,
    orderId: status === null ? null : 'order-under-test',
    agreementId: null,
    status,
    occurredAt: new Date('2026-09-19T12:00:00.000Z'),
    raw: '{"source":"tests/commerce/state.test.ts"}',
  }
}

describe('ORDER_TRANSITIONS — the pinned table', () => {
  test('declares exactly one entry per order status', () => {
    expect(Object.keys(ORDER_TRANSITIONS).sort()).toEqual([...ORDER_STATUSES].sort())
  })

  test('matches the pinned Wave 1a ruling edge for edge', () => {
    const mismatches: string[] = []
    for (const from of ORDER_STATUSES) {
      const actual = [...ORDER_TRANSITIONS[from]].sort()
      const expected = [...PINNED_TRANSITIONS[from]].sort()
      if (actual.join(',') !== expected.join(',')) {
        mismatches.push(`${from}: table=[${actual.join(', ')}] pinned=[${expected.join(', ')}]`)
      }
    }
    expect(mismatches).toEqual([])
  })

  test('is exactly the happy path plus the named side states, with no back edges', () => {
    const permitted = ORDER_STATUSES.flatMap((from) =>
      ORDER_TRANSITIONS[from].map((to) => `${from} -> ${to}`),
    )
    expect(permitted.sort()).toEqual(
      [
        'pending -> authorized',
        'pending -> cancelled',
        'authorized -> paid',
        'authorized -> cancelled',
        'paid -> fulfilled',
        'paid -> refunded',
        'paid -> disputed',
        'fulfilled -> refunded',
        'fulfilled -> disputed',
        'disputed -> refunded',
      ].sort(),
    )
  })
})

describe('the machine is total over every pair', () => {
  test('every (from, to) pair is decided and agrees with the pinned ruling', () => {
    const mismatches: string[] = []
    const pairs: string[] = []
    let permitted = 0

    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        pairs.push(`${from} -> ${to}`)
        const shouldPass = PINNED_TRANSITIONS[from].includes(to)
        const tableSays = ORDER_TRANSITIONS[from].includes(to)
        const canMove = canTransition(from, to)

        if (canMove !== shouldPass) {
          mismatches.push(`canTransition(${from}, ${to})=${canMove}, pinned=${shouldPass}`)
        }
        if (canMove !== tableSays) {
          mismatches.push(`canTransition(${from}, ${to})=${canMove}, ORDER_TRANSITIONS=${tableSays}`)
        }

        const result = transition(from, to)
        if (shouldPass) {
          permitted += 1
          if (!result.ok) {
            mismatches.push(`transition(${from}, ${to}) refused as ${result.reason}; pinned permits it`)
          } else if (result.status !== to) {
            mismatches.push(`transition(${from}, ${to}) landed on ${result.status}`)
          }
        } else if (result.ok) {
          mismatches.push(`transition(${from}, ${to}) was allowed; pinned refuses it`)
        } else {
          const expectedReason =
            PINNED_TRANSITIONS[from].length === 0 ? 'terminal' : 'illegal-transition'
          if (result.reason !== expectedReason) {
            mismatches.push(
              `transition(${from}, ${to}) refused as ${result.reason}; expected ${expectedReason}`,
            )
          }
        }
      }
    }

    expect(mismatches).toEqual([])
    // 7 statuses x 7 statuses: the whole matrix, not a sample of it.
    expect(pairs).toHaveLength(ORDER_STATUSES.length * ORDER_STATUSES.length)
    expect(pairs).toHaveLength(49)
    // 2 + 2 + 3 + 2 + 1 permitted moves.
    expect(permitted).toBe(10)
  })
})

describe('terminal states', () => {
  test('are exactly refunded and cancelled, and refuse every move as "terminal"', () => {
    expect(ORDER_STATUSES.filter((status) => isTerminal(status)).sort()).toEqual([
      'cancelled',
      'refunded',
    ])

    const refusals: string[] = []
    for (const from of ORDER_STATUSES.filter((status) => isTerminal(status))) {
      for (const to of ORDER_STATUSES) {
        if (canTransition(from, to)) {
          refusals.push(`${from} -> ${to} was permitted`)
          continue
        }
        const result = transition(from, to)
        if (result.ok) {
          refusals.push(`${from} -> ${to} transitioned to ${result.status}`)
        } else if (result.reason !== 'terminal') {
          refusals.push(`${from} -> ${to} was refused as ${result.reason}, not "terminal"`)
        } else if (!result.detail.includes(from)) {
          refusals.push(`${from} -> ${to} detail does not name the state: ${result.detail}`)
        }
      }
    }
    expect(refusals).toEqual([])
  })

  test('no non-terminal status is misreported as terminal', () => {
    expect(ORDER_STATUSES.filter((status) => !isTerminal(status)).sort()).toEqual([
      'authorized',
      'disputed',
      'fulfilled',
      'paid',
      'pending',
    ])
  })
})

describe('refusals are distinguishable', () => {
  test('a self-transition is illegal, not terminal', () => {
    expect(canTransition('pending', 'pending')).toBe(false)
    expect(transition('pending', 'pending')).toEqual({
      ok: false,
      reason: 'illegal-transition',
      detail: expect.stringContaining('pending -> pending'),
    })
  })

  test('an unknown "from" status is refused as unknown-status and names the value', () => {
    const bogus = 'completed' as OrderStatus // a ListingStatus, not an OrderStatus
    expect(canTransition(bogus, 'paid')).toBe(false)
    expect(isTerminal(bogus)).toBe(false)
    expect(transition(bogus, 'paid')).toEqual({
      ok: false,
      reason: 'unknown-status',
      detail: expect.stringContaining('completed'),
    })
  })

  test('an unknown "to" status is refused as unknown-status and names the value', () => {
    const bogus = 'nonsense' as OrderStatus
    expect(canTransition('pending', bogus)).toBe(false)
    expect(transition('pending', bogus)).toEqual({
      ok: false,
      reason: 'unknown-status',
      detail: expect.stringContaining('nonsense'),
    })
  })

  test('an unknown status is refused before the terminal rule can misreport it', () => {
    const bogus = 'completed' as OrderStatus
    expect(transition(bogus, bogus)).toEqual({
      ok: false,
      reason: 'unknown-status',
      detail: expect.stringContaining('completed'),
    })
  })
})

describe('statusForEvent', () => {
  test('maps every provider event type to its documented status or null', () => {
    const mismatches: string[] = []
    const seen: ProviderEventType[] = []
    for (const type of PROVIDER_EVENT_TYPES) {
      seen.push(type)
      const documented = PINNED_EVENT_STATUS[type]
      const mapped = statusForEvent(providerEvent(type, documented))
      if (mapped !== documented) {
        mismatches.push(`${type}: mapped=${mapped}, documented=${documented}`)
      }
    }
    expect(mismatches).toEqual([])
    // The documented table covers the vocabulary exactly — no type missed, none invented.
    expect([...seen].sort()).toEqual([...PROVIDER_EVENT_TYPES].sort())
    expect(Object.keys(PINNED_EVENT_STATUS).sort()).toEqual([...PROVIDER_EVENT_TYPES].sort())
  })

  test('an event that cannot move an order returns null even when it carries a status', () => {
    // A seller account's KYC state, a schedule's own state, and a declined
    // attempt all say nothing about an order; a stale status on one of them
    // must not be applied to a buyer's order.
    const noOrderStatus: readonly ProviderEventType[] = [
      'account.updated',
      'subscription.updated',
      'payment.failed',
    ]
    const applied: string[] = []
    for (const type of noOrderStatus) {
      const mapped = statusForEvent(providerEvent(type, 'paid'))
      if (mapped !== null) {
        applied.push(`${type} -> ${mapped}`)
      }
    }
    expect(applied).toEqual([])
    // The event's own status field really was non-null, so the null above is the mapping's.
    expect(providerEvent('account.updated', 'paid').status).toBe('paid')
  })

  test('the four payment events each assert the order status their name says', () => {
    expect(statusForEvent(providerEvent('payment.authorized', 'authorized'))).toBe('authorized')
    expect(statusForEvent(providerEvent('payment.captured', 'paid'))).toBe('paid')
    expect(statusForEvent(providerEvent('payment.refunded', 'refunded'))).toBe('refunded')
    expect(statusForEvent(providerEvent('payment.disputed', 'disputed'))).toBe('disputed')
  })

  test('every status the mapping asserts is reachable in the machine', () => {
    const reachable = new Set<OrderStatus>(
      ORDER_STATUSES.flatMap((from) => [...ORDER_TRANSITIONS[from]]),
    )
    const unreachable: string[] = []
    for (const type of PROVIDER_EVENT_TYPES) {
      const status = PINNED_EVENT_STATUS[type]
      if (status !== null && !reachable.has(status)) {
        unreachable.push(`${type} asserts ${status}, which nothing transitions to`)
      }
    }
    expect(unreachable).toEqual([])
    // Guard against a broken loop "proving" the property by checking nothing:
    // `pending` is the one status nothing transitions into.
    expect(reachable.size).toBe(ORDER_STATUSES.length - 1)
    expect(reachable.has('pending')).toBe(false)
  })

  test('an unrecognised event type is refused loudly, not reported as "no change"', () => {
    const bogus: ProviderEvent = {
      ...providerEvent('payment.captured', 'paid'),
      type: 'payment.exploded' as ProviderEventType,
    }
    expect(() => statusForEvent(bogus)).toThrow(/unrecognised provider event type/)
    expect(() => statusForEvent(bogus)).toThrow(/payment\.exploded/)
  })
})
