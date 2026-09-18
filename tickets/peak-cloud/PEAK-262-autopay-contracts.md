# [PEAK-262] Rent: Auto-Pay Contracts

- Priority: P2 · Area: Rent · Status: OPEN
- Dependencies: PEAK-231
- Risk: money / trust

## Intent
Option 3 of three: recurring collection via the financial integration.

## Scope
Create a contract against a `rental_agreement`: cadence, amount, start, end.
Both parties review the full schedule before it activates. Cancellation by
either side, with notice. A visible schedule of past and upcoming collections
for both parties.

## Non-negotiable
**`ownerAcceptedAt` and `renterAcceptedAt` must both be set before `active` may
be true.** No money moves on a schedule that one side did not accept. Enforce in
code and with a database CHECK constraint.

## Acceptance criteria
- Given one acceptance, then `active` stays false and nothing is collected.
- Given both, then the provider subscription is created and `providerRef` stored.
- Given cancellation, then no further collection occurs and both are notified.
- Given a failed collection, then both are notified and the contract is not
  silently deactivated.

## Verification evidence
Stripe test mode across at least two cycles, including an induced failure.

## Rollback
Behind `commerce.autopay`.
