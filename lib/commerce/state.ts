/**
 * The order state machine — PEAK-230, unit 230-2.
 *
 * Orders move through a small, closed set of states, and every one of those
 * moves is a money decision. This module is the single table that says which
 * moves are permitted, so no surface, webhook handler or server action invents
 * its own rule about what an order may do next.
 *
 * It is deliberately PURE: no database, no provider call, no I/O. Two rules
 * from `docs/PEAK-COMMERCE.md` §4 and the PEAK-230 ticket shape it:
 *
 *   1. The database is the record of intent; the provider is the record of
 *      fact. Nothing here reads Peak's tables to decide a payment status —
 *      `statusForEvent` reports what a verified provider event asserts, and
 *      that is all it reports.
 *   2. An unknown status is never accepted silently. `order.status` is `text`
 *      with a CHECK constraint, so a status this module let through would
 *      surface as a database error at the worst possible moment. It is refused
 *      here first, with a reason that names the value.
 *
 * The transition table below is pinned by the Wave 1a bar
 * (`build/WAVE1a-BAR.md` §2 — a ruling recorded there and flagged to the
 * owner). It is implementation, not suggestion: `tests/commerce/state.test.ts`
 * asserts it exhaustively against an independently written copy of the same
 * ruling, so an accidental extra edge cannot pass.
 */
import { ORDER_STATUSES, type OrderStatus } from '@/lib/db/schema'
import {
  PROVIDER_EVENT_TYPES,
  type ProviderEvent,
  type ProviderEventType,
} from '@/lib/commerce/provider'

/**
 * The permitted moves out of each order status — exactly the Wave 1a ruling:
 *
 *     pending    -> authorized | cancelled
 *     authorized -> paid | cancelled
 *     paid       -> fulfilled | refunded | disputed
 *     fulfilled  -> refunded | disputed
 *     disputed   -> refunded
 *     refunded   -> (terminal)
 *     cancelled  -> (terminal)
 *
 * `Record<OrderStatus, ...>` is the point: adding a member to `ORDER_STATUSES`
 * fails to compile until its moves are declared here, so the machine cannot
 * quietly become partial. An empty list is a terminal state.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['authorized', 'cancelled'],
  authorized: ['paid', 'cancelled'],
  paid: ['fulfilled', 'refunded', 'disputed'],
  fulfilled: ['refunded', 'disputed'],
  disputed: ['refunded'],
  refunded: [],
  cancelled: [],
}

/**
 * The outcome of asking to move an order.
 *
 * The refusal reasons are distinguishable on purpose: a caller that cannot
 * tell "this order is finished" from "you asked for a transition that does not
 * exist" cannot tell a replayed event from a bug in its own edge list.
 */
export type TransitionResult =
  | { ok: true; status: OrderStatus }
  | { ok: false; reason: 'unknown-status' | 'illegal-transition' | 'terminal'; detail: string }

/** The same vocabulary the `order.status` CHECK constraint carries. */
const ORDER_STATUS_SET: ReadonlySet<string> = new Set<string>(ORDER_STATUSES)

/**
 * Is `value` a status the database would accept?
 *
 * Widened to `string` on purpose: the callers below receive values the
 * compiler believes are `OrderStatus`, but a caller that casts — or a row read
 * from a column written by an older deploy — can still hand us something else,
 * and this is where that is caught.
 */
function isOrderStatus(value: string): value is OrderStatus {
  return ORDER_STATUS_SET.has(value)
}

/**
 * A terminal status has no moves left: the order is finished, and every
 * attempted transition out of it is refused as `terminal`.
 *
 * An unrecognised status is not terminal — `transition` refuses it as
 * `unknown-status`, which is the more useful answer.
 */
export function isTerminal(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status]?.length === 0
}

/**
 * Ask whether an order may move from `from` to `to`.
 *
 * Total over the vocabulary: every pair answers `true` or `false` and nothing
 * throws, including a status the database does not know.
 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return transition(from, to).ok
}

/**
 * Attempt the move, reporting either the new status or why it was refused.
 *
 * Checks run in this order:
 *   1. both statuses must be in the vocabulary — otherwise `unknown-status`;
 *   2. a terminal `from` refuses everything — `terminal`;
 *   3. anything else absent from the table is `illegal-transition`, which
 *      includes a self-transition (`pending -> pending` is not a move) and any
 *      backwards move in the happy path.
 */
export function transition(from: OrderStatus, to: OrderStatus): TransitionResult {
  if (!isOrderStatus(from)) {
    return {
      ok: false,
      reason: 'unknown-status',
      detail: `"${String(from)}" is not an order status; expected one of ${ORDER_STATUSES.join(
        ', ',
      )}.`,
    }
  }
  if (!isOrderStatus(to)) {
    return {
      ok: false,
      reason: 'unknown-status',
      detail: `"${String(to)}" is not an order status; expected one of ${ORDER_STATUSES.join(
        ', ',
      )}.`,
    }
  }
  if (isTerminal(from)) {
    return {
      ok: false,
      reason: 'terminal',
      detail: `${from} is terminal: it has no further transitions, so ${from} -> ${to} is refused.`,
    }
  }
  if (ORDER_TRANSITIONS[from].includes(to)) {
    return { ok: true, status: to }
  }
  return {
    ok: false,
    reason: 'illegal-transition',
    detail: `${from} -> ${to} is not a permitted transition; ${from} may move to ${ORDER_TRANSITIONS[
      from
    ].join(', ')}.`,
  }
}

/**
 * The order status each provider event type asserts.
 *
 * The mapping's domain is the closed `ProviderEventType` vocabulary from
 * `lib/commerce/provider.ts`, so every event type has an answer and nothing
 * falls through — an event type nobody has classified would be a hole in the
 * seam, not a quiet no-op.
 *
 * Three types map to `null`, because the event carries no order-status change:
 *
 *   - `payment.failed`       — a declined attempt is not an order state. The
 *                              order stays where it is (another attempt may
 *                              follow), and `ORDER_STATUSES` has no failure
 *                              member. Mapping it to `pending` would be a
 *                              no-op self-transition, which this machine
 *                              refuses anyway.
 *   - `subscription.updated` — a schedule's own state vocabulary belongs to the
 *                              provider and is reported in `ProviderEvent.raw`,
 *                              not in `order.status`.
 *   - `account.updated`      — a seller's KYC/payout capability changing does
 *                              not move a buyer's order.
 *
 * The remaining four each assert exactly one order status. The provider is the
 * record of fact: this function reads a verified event and Peak's tables not at
 * all. `ProviderEvent.status` carries the provider's normalised echo of the
 * same assertion; the value here is derived from the event's closed type, so a
 * consumer gets the answer without trusting a payload-derived field.
 */
const EVENT_ORDER_STATUS = new Map<ProviderEventType, OrderStatus | null>([
  ['payment.authorized', 'authorized'],
  ['payment.captured', 'paid'],
  ['payment.failed', null],
  ['payment.refunded', 'refunded'],
  ['payment.disputed', 'disputed'],
  ['subscription.updated', null],
  ['account.updated', null],
])

/**
 * The status a verified event asserts, or `null` when it asserts none.
 *
 * Refuses an event type outside the vocabulary rather than returning `null`:
 * `null` means "this event says nothing about an order", and an unrecognised
 * event saying nothing is a different, more dangerous claim.
 */
export function statusForEvent(event: ProviderEvent): OrderStatus | null {
  const status = EVENT_ORDER_STATUS.get(event.type)
  if (status === undefined) {
    throw new Error(
      `statusForEvent: unrecognised provider event type ${JSON.stringify(event.type)}; the ` +
        `vocabulary is ${PROVIDER_EVENT_TYPES.join(', ')}. Refusing to guess an order status.`,
    )
  }
  return status
}
