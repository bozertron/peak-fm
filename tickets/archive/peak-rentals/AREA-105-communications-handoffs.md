> **ARCHIVED — SUPERSEDED 2026-09-18.**
> This ticket predates the local-market cloud redesign. It is retained as
> evidence and history only. Do not implement from it. The live backlog is
> `tickets/peak-cloud/`; what carried forward is recorded in
> `tickets/archive/SUPERSESSION-LEDGER.md`.

---

# [AREA-105] Communications handoffs and Mountain Horn intents

- Priority: P0
- Phase: 3
- Owner: v0 implementation
- Status: UI intents and Discovery handoff implemented; realtime and server persistence pending
- Source requirements: Latest product direction — Communications, intros, transactions
- Dependencies: AREA-101
- Risk: privacy / operations / UX

## Intent
Make the Mountain Horn the shared destination for intentional contact, introductions, listing conversations, and ordinary personal connection.

## Scope
Support Text, Audio, Video, Ask AI, and Yoddle actions plus a Contact selector. “Ask for an Intro...” and listing likes must open the right Communications context. The Horn must support both trusted-circle contact and simple “I miss you / say hello” conversations; circle membership must not be described as the only reason to use it. Define durable message/call intent persistence, authorization, presence, and future AI/media boundaries.

## Acceptance criteria
- Given the Mountain Horn, when a user selects Text, Audio, Video, Ask AI, or Yoddle, then the selected intent is visually clear and has an accessible label.
- Ask AI is clearly separated from peer communication and does not imply access to private circle data without authorization.
- Yoddle posts to the Bulletin Board through a validated, user-scoped flow.
- An intro request preserves the intended recipient and source context.
- Audio/video are represented as explicit call intents until a production realtime provider is integrated; no fake connected-call state is shown.
- Messages and contact metadata are protected server-side and auditable.

## Verification evidence
- Browser tests for every mode and handoff.
- Authenticated privacy and authorization tests.
- Error, retry, and offline-state QA.
- Console/network review for accidental secret or private-data exposure.

## Additional explicit requirements
- Communications is the intentional contact/deal destination; ordinary close-contact updates and P2P communication may remain available from a person’s identity/Card panel.
- Hovering or activating “Ask for an Intro...” must route to Communications while preserving source listing, recipient, and context.
- Mountain Horn must support contacting someone simply because the user misses them; Circle membership is not the only permitted intent.

## Rollout and rollback
Ship UI states independently from realtime transport; fall back to text intent with a clear unavailable state if audio/video infrastructure is absent.

## Follow-through checkpoints
- Post-merge: verify all five modes and handoffs.
- Deployment: test authenticated and signed-out behavior.
- Monitoring: instrument delivery/call-intent failures.
- Owner and escalation path: TBD.
                                                                                                                                                
