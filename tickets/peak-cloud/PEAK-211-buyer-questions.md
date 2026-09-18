# [PEAK-211] Buy: buyer question sets

- Priority: P1 · Area: Buy · Status: OPEN
- Dependencies: PEAK-210, PEAK-300
- Risk: privacy

## Intent
"The user clicks the add, and if they're interested, they can set up questions
for the seller to answer."

## Scope
- Compose an ordered question set against a listing before committing to buy.
- Post the set into the listing thread as a `message.kind = 'question'`.
- Seller answers inline; answers write back to `buyer_question.answer` and
  `answeredAt` so they are structured data, not just chat text.
- Suggested questions per category (a plain lookup — **not** the LLM surface).
- Buyer sees their own sets across listings from Buy History.

## Privacy constraint — the important one
`buyer_question` is keyed on **(listingId, buyerId)**. Two buyers must never see
each other's diligence, and the seller sees each buyer's set separately. A
query that returns a listing's questions without scoping to a buyer is a defect.

## Acceptance criteria
- Given two buyers with question sets on one listing, when either loads the
  listing, then they see only their own.
- Given a seller answering, then `answer` and `answeredAt` are persisted and the
  buyer is notified in the thread.
- Given an unauthenticated request for `buyer_question` rows, then it is refused.

## Verification evidence
A test with two buyer accounts proving isolation. Paste the actual output.

## Rollback
Behind `surface.buy`.
