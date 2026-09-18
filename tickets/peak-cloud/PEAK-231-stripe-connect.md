# [PEAK-231] Stripe Connect implementation

- Priority: P0 · Area: Commerce · Status: OPEN — **blocked by D4**
- Dependencies: PEAK-230
- Risk: money / compliance

## Intent
Implement `PaymentProvider` against Stripe Connect, per the mapping in
`docs/PEAK-COMMERCE.md` §3.

## Scope
Express connected accounts with hosted onboarding; PaymentIntents with
`application_fee_amount`; **separate charges and transfers** so a refund does
not have to claw back a completed payout; Stripe Billing for rental auto-pay;
webhook endpoint with signature verification writing back to `order` and
`autopay_contract`.

## Blocked
**D4** — does Peak hold funds or purely facilitate? This is a regulatory
posture in Canada, not a coding choice. Halt and ask.

## Acceptance criteria
- Given a seller, when they complete onboarding, then `chargesEnabled` and
  `payoutsEnabled` are reflected and they can publish a priced listing.
- Given a buyer paying, then the order reaches `paid` **only** from the webhook.
- Given a refund, then the record reconciles without a negative payout balance.

## Verification evidence
Stripe test mode, end to end, with the webhook log pasted. Test keys only —
no live key in any environment file.

## Rollback
Behind `commerce.checkout`.
