# [PEAK-232] In-chat checkout

- Priority: P0 · Area: Commerce · Status: OPEN
- Dependencies: PEAK-231, PEAK-300
- Risk: money / UX

## Intent
"When the time is right, the transaction can go down inside the chat itself due
to commerce integrations." Commerce is **not** a separate checkout surface.

## Scope
- A seller proposes terms in a thread → `message.kind = 'offer'`.
- Buyer accepts → `message.kind = 'checkout'` carrying the order reference in
  `payload`; `order.threadId` points back.
- Payment is completed in place, without leaving the conversation.
- Status changes post as `message.kind = 'system'` — paid, shipped, completed,
  refunded.
- The thread is the receipt. Both parties can export from it.

## Acceptance criteria
- Given an offer message, when the buyer accepts and pays, then an `order` row
  exists with `threadId` set and the thread shows the whole sequence.
- Given a page reload mid-checkout, then no duplicate order is created.
- Given a participant who is not the buyer, then the checkout control is not
  actionable for them.

## Verification evidence
A full browser round trip in Stripe test mode, screenshotted, with the resulting
`order` and `message` rows pasted.

## Rollback
Behind `commerce.checkout`. With it off, threads still work and terms can still
be agreed in text.
