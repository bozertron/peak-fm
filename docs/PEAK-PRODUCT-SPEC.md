# Peak — Product Specification

**Status:** Authoritative. The single source of truth for what Peak is.
**Last updated:** 2026-09-18

---

## 1. What Peak is

Peak is a **local-market cloud application**. The first market is **Big White**,
British Columbia, with the surrounding Okanagan queued behind it.

The header calls the focus of the tools and the intent of the target user:

```
peak   Buy   Sell   Rent   Trade   Find   Plans   Communicate        [Account]
```

Eight controls. Seven are verbs — things a person in a small mountain town
actually does. The eighth is who they are. The `peak` wordmark stays where it
is, at the left.

This is a return to roots, and it is narrower than what came before on purpose.
Many of the same tools remain; the framing is different.

## 2. The pitch, and why it is a design constraint

The landing page has one job: answer **"why would I download yet another
communications or marketplace app?"**

That question governs three rules that bind the whole product.

1. **A signed-out visitor must see real supply.** The pitch cannot be gated
   behind a social graph or a sign-up wall. This is why the vouch-chain
   visibility model in the archived backlog was demoted (see
   `tickets/HISTORY.md` §1.3).
2. **Nothing on the pitch may be invented.** Counts are live queries. An empty
   market says it is empty. A pitch built on fake inventory breaks the first
   time somebody taps it.
3. **The answer is the combination, not any one surface.** Individually, each
   verb has competitors. Together — one market, one contact list, one thread,
   and the paperwork at the end — they do not.

## 3. The seven surfaces

### 3.1 Buy

Shows a sampling of what is for sale in each category, browsed the way people
browse anything they enjoy. On top of that sits **filtering sharp enough to
zero in on exactly what the user wants to purchase** — that is the differentiator,
not the browse.

A buyer who is interested can **set up questions for the seller to answer**.
Questions belong to the buyer/listing pair, not to the listing, so two buyers
never see each other's diligence.

When the time is right, **the transaction happens inside the chat**, through the
commerce integration. Commerce is not a separate checkout surface.

Afterwards, **Buy History → Download Accounting Package** produces:

| Field | Source |
|---|---|
| Description of item | `accounting_record.itemDescription` |
| Its purpose | `accounting_record.itemPurpose` |
| Cost | `accounting_record.costCents` |
| Tax allocation(s) | `accounting_record.taxAllocations` |
| Account from → to | `accountFrom` / `accountTo`, only if the user opted into tracking |
| Research-validated tax relief / write-off potential | `taxTreatment`, `reliefNotes`, `researchSources`, `confidence` |

**Constraint on the last row.** `reliefNotes` may never be populated without a
non-empty `researchSources` and an explicit `confidence`. A package that cannot
cite a source says so on its face rather than asserting a write-off. This is
research output presented as research, never as advice.

**Filters are data, not code.** They read `listing_attribute`, so adding a facet
to a category does not require a deploy.

### 3.2 Sell

The user may be selling **goods or a service**.

**Build Product Presentation** is full-featured: a file picker **plus a camera
option**, so on a mobile device the user shoots a photo *directly into the
presentation*. `listing_media.capturedInApp` records which path a photo took.

**Product Widget Creator** — LLM-assisted.
- **Optional** for a physical product.
- **Mandatory** for a service product presentation.

The widget renders at the **top level** of the listing as *service overview +
pricing + booking tool*, so a neighbour can view a local individual's house-
cleaning service and book it without sending a message.

`service_widget.generatedBy` and `generationLog` record whether the LLM drafted
it. LLM output is never silently presented as the seller's own words, and the
seller keeps editorial control.

Same accounting package output, **contextualised for sales** — the same order
exports a different document to buyer and seller (`accounting_record.perspective`).

### 3.3 Rent

The user sees rental items available and can create their own. Creation offers
**three equal options**, not a wizard:

1. **Build Rental** — the direct route, when the price is already known.
2. **Explore ROI** — the financial reality of the offer, so the user can decide
   *whether they want to do it at all*: acquisition cost, maintenance, observed
   historical demand, desire to recoup, resulting rate and break-even. Conditions
   are decided here with the numbers in view. It **exports directly into Build
   Rental with only a Review stage before posting**.
3. **Create Auto-Pay Contract** — recurring collection via the financial
   integration.

An ROI model exists **before** a listing does; `roi_model.listingId` stays null
until export. That ordering is the point of the feature.

Auto-pay requires **both** `ownerAcceptedAt` and `renterAcceptedAt` before any
money moves on a schedule.

### 3.4 Trade

Trade proposes flows based on the rest of the items — it reuses the listing
spine. The one unique addition is **Bid as Sale**.

- Bid as Sale is set **once at creation** and is **not a negotiable field**.
- With it on, a potential buyer may offer **any item or any amount of money they
  believe is reasonable**.
- The owner may **accept**, **counter**, or **remove visibility from that user**
  if they do not want to deal with that person.

"Remove visibility" writes a `listing_block` row rather than deleting the offer,
so a blocked bidder's history stays auditable instead of vanishing. Counters are
new offers with a `parentOfferId`, producing a full negotiation chain rather
than a mutable row.

### 3.5 Find

Wherever applicable there is a **[Find]** button. Pressing it:

1. reads the **metadata of where it came from** (`originSurface`,
   `originEntityType`, `originEntityId`, `originMetadata`),
2. **logs it as a permanent opportunity until satisfied**, and
3. acts as **matchmaker** between those looking and those with the means to
   satisfy the demand.

> **Invariant.** Anything that starts as a Find **ends as a Find**. It never
> migrates to a Buy item, because that would be redundant and would clutter the
> focused buying experience.

This is enforced structurally: there is no `convertedToListingId` column in
`find_request`, deliberately. Only the seeker may mark a Find satisfied — a
match does not satisfy it.

### 3.6 Plans

Three sub-categories, one shape:

1. **Personal** — e.g. a plan for a bathroom reno.
2. **Business** — intended for service offers. A plumber who found "Bathroom
   Reno" in their Find area can send the person trying to find help **their plan
   + price, including timelines and guarantees**.
3. **Community** — starts as a local events and government announcements board
   looking for citizen feedback.

The worked example crosses scopes, which is why they share one table: a Personal
plan raises a Find; a Business plan answers it via `plan_proposal.findRequestId`.

### 3.7 Communicate

The hub for **all communications between users, on all topics**. Easy to
archive and delete, and easy to action against.

Threads are polymorphic over their subject (`listing`, `find`, `plan`, `order`,
`community`, `direct`), so a conversation is always attached to the thing it is
about.

**Archive and delete are per-participant.** One side clearing their inbox must
never remove the other side's copy — `thread_participant.archivedAt` and
`deletedAt`, never a column on `thread`.

Because commerce runs inside the thread (`message.kind = 'checkout'`, and
`order.threadId`), the receipt and the conversation never drift apart.

### 3.8 Account Management + Settings

A **user-applied interactive graphic + name** in the header.

The graphic is a pure deterministic function of `(avatarKind, avatarSeed, name)`,
so the same user draws identically on every device and during SSR — no image
host, no upload pipeline, no network request. Two renderers ship: `initials`
and `ridge`. The picker previews live as the user changes the seed.

Account also owns home-market selection and is the entry point to Buy & Sell
History.

## 4. Cross-cutting rules

| Rule | Why |
|---|---|
| Every listing, Find, plan and thread belongs to exactly one `market` | "Local" is the pitch; it is enforced in data, not copy |
| Money is integer cents plus an ISO currency, never a float | Rounding errors in an accounting product are unacceptable |
| Filters run as SQL predicates, never client-side array filtering | A market with 10,000 listings must not ship its catalogue to a browser |
| Filter state lives in the URL | Shareable, back-button-correct, server-renderable |
| Every Server Function re-checks the session itself | They are reachable by direct POST, not only through the UI |
| Unknown feature flags read as OFF | A flag that was never seeded must not open a half-built surface |
| Privileged actions write `admin_audit_log` | Append-only; a moderator who removes a listing leaves a trace |

## 5. Retired vocabulary

These names are retired and must not reappear:

The Daily Yoddle · The Mountain Horn · Good Gear · Discovery · Good People ·
The GREAT Community! · Lexicon · peak → flow · "trusted circle" as an access
gate · "The Champagne of Community Commerce"

Rationale and replacements: `tickets/HISTORY.md` §1.2.
