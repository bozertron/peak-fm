# [PEAK-261] Rent: Explore ROI

- Priority: P1 · Area: Rent · Status: OPEN
- Dependencies: PEAK-200 · Feeds: PEAK-260
- Risk: correctness / trust

## Intent
"User can explore the financial reality of the offer and decide if they want to
do it" — and if so, set conditions and price from historical demand plus their
desire to recoup costs. **It exports directly into Build Rental with only a
Review stage before posting.**

This is the most distinctive thing in Rent. An owner arrives not knowing whether
to list at all; every other marketplace assumes they have already decided.

## Scope
- Inputs: acquisition cost, annual maintenance, annual carrying cost, target
  recoup months, expected utilisation.
- **Demand evidence, real not invented:** observed rental activity for the
  category in that market — completed agreements, view and enquiry counts,
  realised rates. When there is not enough local history, say so plainly and
  widen the window or the region, labelled. **Never fabricate a demand curve.**
- Outputs: suggested rate, break-even months, and a scenario table across rate ×
  utilisation, all recomputed on every edit and stored in `roi_model`.
- Conditions decided here carry into the agreement.
- Export sets `listingId` and `exportedAt` and hands off to PEAK-260.

## Honesty rules
1. A suggestion with thin evidence is **labelled as thin**, with n shown.
2. `demandEvidence` records what the numbers were derived from, so a suggestion
   can always be explained.
3. No projection is presented as a guarantee of income.

## Acceptance criteria
- Given a market with no history for a category, then the model says so and does
  not emit a confident rate.
- Given inputs, when any changes, then outputs and the scenario table recompute.
- Given export, then Build Rental opens pre-filled with only Review remaining.

## Verification evidence
Break-even arithmetic unit tests. A thin-evidence case proving the label
appears. Paste the run.

## Rollback
Behind `surface.rent`.
