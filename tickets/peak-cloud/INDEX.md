# Ticket Index

Every ticket, its wave, and what it waits on. Generated from the ticket
headers — if this disagrees with a ticket, the ticket is right.

| # | Wave | Ticket | Depends on | Status |
|---|---|---|---|---|
| [200](PEAK-200-domain-schema.md) | — | Domain schema | none | **DONE — verified** |
| [201](PEAK-201-migration-runner.md) | — | Migration runner and schema verification | PEAK-200 | **DONE — verified** |
| [202](PEAK-202-app-shell.md) | — | Eight-surface app shell | PEAK-200 | **DONE — verified** |
| [203](PEAK-203-admin-dashboard.md) | — | Admin dashboard for beta operations | PEAK-200, PEAK-204 | **DONE — verified** |
| [204](PEAK-204-auth-fixes.md) | — | Auth: roles that work, origins that work | none | **DONE — verified** |
| [205](PEAK-205-route-inventory.md) | — | Route inventory and the dead-link guard | none | **PARTLY DONE** — guard shipped, 18 routes still open |
| [206](PEAK-206-test-harness.md) | **0** | Test harness | none | **DONE — verified** (W-PEAK-00, 2026-09-19) |
| [207](PEAK-207-lint-and-format.md) | **0** | Lint and format | none | **DONE — verified** (W-PEAK-00, 2026-09-19) |
| [208](PEAK-208-continuous-integration.md) | **0** | Continuous integration | PEAK-206, PEAK-207 | **PARTLY DONE** — workflow written and YAML-validated, never executed; smoke step blocked on the `<Analytics/>` 404 question |
| [209](PEAK-209-media-storage.md) | **1** | Media storage | none | **PARTLY DONE** — interface, validation, EXIF strip, test store, orphans, resolver all land and verify; **backend blocked by D3** |
| [210](PEAK-210-buy-browse-filters.md) | **2** | Buy: category browse and deep filtering | PEAK-213, PEAK-220 *(needs real supply)* | OPEN |
| [211](PEAK-211-buyer-questions.md) | **3** | Buy: buyer question sets | PEAK-210, **PEAK-300** | OPEN |
| [212](PEAK-212-accounting-package.md) | **3** | Accounting Package export | PEAK-230, PEAK-232 | OPEN — **tax fields blocked by D5** |
| [213](PEAK-213-listing-detail.md) | **2** | Listing detail page | PEAK-220 | OPEN |
| [220](PEAK-220-presentation-builder.md) | **2** | Sell: Build Product Presentation | **PEAK-222**, PEAK-209 | OPEN |
| [221](PEAK-221-product-widget-creator.md) | **2** | Sell: LLM-assisted Product Widget Creator | **PEAK-222** | OPEN — manual path unblocked, **LLM path blocked by D6** |
| [222](PEAK-222-listing-composer.md) | **1** | Shared listing composer | PEAK-209 | OPEN |
| [230](PEAK-230-payment-provider-seam.md) | **1** | Payment provider seam | PEAK-200 | **DONE — verified** (W-PEAK-01a, 2026-09-19) |
| [231](PEAK-231-stripe-connect.md) | **2** | Stripe Connect implementation | PEAK-230 | OPEN — **blocked by D4** |
| [232](PEAK-232-in-chat-checkout.md) | **3** | In-chat checkout | PEAK-231, **PEAK-300** | OPEN |
| [240](PEAK-240-invite-redemption.md) | **1** | Beta invite redemption | PEAK-203, PEAK-204 | **PARTLY DONE** — server-side enforcement is verified (13 attack classes refused at the real endpoint, final-use race proven), and the conditional field is implemented (`auth-form.tsx:39`); **but bar 240.A7's render proof has no artifact on disk**, so the DONE is withdrawn until a test renders it (W-PEAK-01a-closure-2) |
| [241](PEAK-241-flag-rollout.md) | **3** | Feature flag rollout evaluation | PEAK-203 | OPEN |
| [242](PEAK-242-beta-feedback-widget.md) | **2** | In-app beta feedback widget | PEAK-203 | OPEN |
| [243](PEAK-243-report-creation.md) | **3** (registrar placement pass) | Member-side reporting | PEAK-203 | OPEN |
| [250](PEAK-250-deploy-pipeline.md) | **3** | Deploy pipeline and predeploy gate | PEAK-201, PEAK-208 | OPEN — **blocked by D3** |
| [260](PEAK-260-build-rental.md) | **2** | Rent: Build Rental | **PEAK-222**, PEAK-261 *(feeds it)* | OPEN |
| [261](PEAK-261-roi-explorer.md) | **2** | Rent: Explore ROI | none | OPEN |
| [262](PEAK-262-autopay-contracts.md) | **3** | Rent: Auto-Pay Contracts | PEAK-231 | OPEN |
| [270](PEAK-270-trade-offers.md) | **2** | Trade: offers, Bid as Sale, counters, blocks | **PEAK-222**, PEAK-300 | OPEN |
| [280](PEAK-280-find-capture.md) | **2** (280a) · **3** (280b placement) | Find: the [Find] button and permanent capture | PEAK-200, PEAK-202 | OPEN |
| [281](PEAK-281-find-matchmaker.md) | **3** | Find: matchmaking | PEAK-280, PEAK-210 | OPEN |
| [290](PEAK-290-plans.md) | **3** | Plans: Personal and Business | PEAK-280, **PEAK-300** | OPEN |
| [291](PEAK-291-community-board.md) | **2** | Plans: Community board | PEAK-200 | OPEN |
| [300](PEAK-300-threads.md) | **1** | Communicate: threads and messaging | PEAK-200, PEAK-202 | OPEN |
| [310](PEAK-310-account-history.md) | **3** | Account: Buy & Sell History | PEAK-232, PEAK-212 | OPEN |

## Reading order for a cold start

1. `../doctrine/PROHIBITED.txt` — binding, 11 rules
2. `../../docs/PEAK-PRODUCT-SPEC.md` — what Peak is
3. `STATUS.md` — the wave plan and why it is ordered that way
4. `OPEN-DECISIONS.md` — what you must not decide yourself
5. your ticket
