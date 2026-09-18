# [PEAK-290] Plans: Personal and Business

- Priority: P2 · Area: Plans · Status: OPEN
- Dependencies: PEAK-280, PEAK-300
- Risk: UX

## Intent
Personal: "a plan for a Bathroom Reno." Business: "A Plumber found 'Bathroom
Reno' in their Find area and based on the details, they can send the person
who's trying to Find help their plan + price that includes timelines and
guarantees."

## Scope
- Plan composer: title, summary, budget, dates, ordered `plan_step` rows with
  duration and cost.
- Raise a **Find directly from a plan step** — this is the join that makes the
  worked example work (PEAK-280).
- Business plans are **reusable templates** a provider sends repeatedly. Sending
  creates a `plan_proposal` with price, `timeline`, `guaranteeText` and
  `validUntil`, linked to the `find_request` it answers.
- Recipient reviews, accepts, declines, or opens a thread to negotiate.
- Accepting a proposal is the hand-off into commerce.

## Acceptance criteria
- Given a personal plan step, when Find is raised from it, then
  `originEntityType = 'plan'` and the step is in `originMetadata`.
- Given a provider answering a Find, then the recipient is the Find's seeker and
  `findRequestId` is set.
- Given `validUntil` passing, then the proposal becomes `expired` and cannot be
  accepted.
- Given acceptance, then a thread exists carrying the agreed terms.

## Verification evidence
The full worked example, two accounts: homeowner plan → Find → plumber proposal
→ acceptance. Paste the rows at each step.

## Rollback
Behind `surface.plans`.
