> **ARCHIVED — SUPERSEDED 2026-09-18.**
> This ticket predates the local-market cloud redesign. It is retained as
> evidence and history only. Do not implement from it. The live backlog is
> `tickets/peak-cloud/`; what carried forward is recorded in
> `tickets/archive/SUPERSESSION-LEDGER.md`.

---

# [AREA-110] Ticket-to-code delta register

- Priority: P0
- Phase: 1 (gap analysis — input to the execution wave)
- Owner: Orchestrator
- Source: Read-only audit of AREA-101..108 against the working tree
- Dependencies: AREA-106
- Risk: planning integrity
- Status: Complete as a register. Four scoring questions await user ruling (section E).

## Method

A read-only agent audited AREA-106's eighteen numbered requirements against
`app/page.tsx`, `app/layout.tsx`, `app/admin/page.tsx`, `components/auth-form.tsx`,
`components/okanagan-map.tsx` and `app/globals.css`, with `file:line` evidence and
both apostrophe forms (ASCII `'` and U+2019) searched for every removal string.
Three high-impact findings were independently re-verified by the orchestrator.

## Headline result

**Every removal string AREA-106 demands is genuinely gone.** Confirmed absent
repo-wide (excluding `tickets/`, `node_modules/`, `.git/`): "town square",
"THE PEOPLE BEHIND THE GEAR", "Your network", "PEOPLE YOU'VE COLLECTED" (both
apostrophe forms), "Your cards", "Trust travels", "Every good interaction".
Requirements 5, 9 and 13 are **MET**. Requirement 7 (header order) is **MET**.

## Scoring summary (AREA-106 1..18)

| Status | Requirements |
|---|---|
| MET | 5, 7, 9, 13, 17 (client-only) |
| PARTIAL | 1, 2, 3, 6, 10, 14, 15, 16, 18 |
| ABSENT | 4, 12 |
| CONTRADICTED | 8, 11 |

## The two hard failures

### D1 — Requirement 4: the required hero headline does not exist (ABSENT)
AREA-101 and AREA-106 #4 require the exact string
**"The Champagne of Community Communications"**. It appears nowhere.

The nearest match is a *different word* on a *different page*:
`components/auth-form.tsx:44` → `THE CHAMPAGNE OF COMMUNITY COMMERCE`
— "COMMERCE", not "Communications"; uppercase; rendered on `/sign-in` and
`/sign-up`, not in the Communications hero; and styled by `.auth-eyebrow`
(`app/globals.css:26`, DM Mono 10px) rather than the required brown
western-display treatment.

*Orchestrator-verified.* This is a single-word substitution away from looking
correct, which is exactly why it survived earlier review. It must not be
"fixed" by editing the auth eyebrow — the requirement is a **hero** headline.

### D2 — Requirement 11: the peak→flow mark is in the wrong place (CONTRADICTED)
Required: the mark sits **in the centre of** the four panels, `peak` **over**
`flow`. Actual: `.people-grid` closes *before* `.flow-card`
(`app/page.tsx:74`), so the mark renders as a full-width bar **below** the
grid, and reads `peak → flow` on one line.

### Also ABSENT: Requirement 12 (Flow)
No Flow route exists (`app/` contains only `admin api globals.css layout.tsx
page.tsx sign-in sign-up`). No tax, invoice, receipt, or pipeline model.
`app/page.tsx:74` carries live-sounding product copy — "Deals, invoices, tax
notes, receipts, and the local services behind every exchange" — with nothing
behind it and **no "planned" label**, which AREA-103 explicitly forbids.

## Mislabeled and broken controls

Controls whose behavior contradicts their label. Each is a defect, not a nit.

| Label | file:line | Actual behavior |
|---|---|---|
| `Open dealflow` | `app/page.tsx:74` | `setActive('communications')` — no Flow surface exists |
| `View widget` | `app/page.tsx:76` | `setActive('communications')` — no widget detail view |
| `Add a tile` | `app/page.tsx:76` | Opens the **invite-a-friend** modal; no tile creation path exists |
| `Send invitation` | `app/page.tsx:78` | Closes the modal; the email input is uncontrolled and never read |
| `Send message` | `app/page.tsx:50,68` | `sendChat` clears the input; nothing is sent, stored or rendered |
| `Notifications` | `app/page.tsx:61` | **No `onClick` at all** — dead control with an accessible name |

### Three state-correctness bugs (orchestrator-verified)

1. **Skip desynchronises under search.** `app/page.tsx:72` advances
   `% listings.length` (always 7) while the card reads
   `discoveryListings[listingIndex % discoveryListings.length]` (`:48`) — the
   *filtered* set. With a filter active, skip can re-show the same listing
   twice, violating AREA-102 "Skip advances without duplicate state changes."
2. **Thumbnail clicks open the wrong listing.** The strip computes an index
   into the unfiltered `listings`, but the card reads the filtered set
   (`app/page.tsx:72`, `:48`). Under an active filter, clicking a thumbnail
   shows a different listing than the one clicked.
3. **The Horn displays two recipients at once.** `Reply in the Horn`
   (`app/page.tsx:67`) sets `contactChoice` to a bulletin author such as
   "Okanagan Trail Crew", but the Contact `<select>` (`:68`) only offers four
   names. The select silently falls back to its first option while the stage
   reads "Message Okanagan Trail Crew".

### Session state is never read
`authClient` is imported at `app/page.tsx:5` and **never called** — verified,
exactly one occurrence in the file. The account menu (`:61`) therefore always
renders "Sign in" / "Create account" under the heading "Your Peak account",
even for an authenticated user. This is the client-side twin of the `/admin`
role defect: the app has working auth it does not consult.

## Naming collision is live in code (AREA-108 open decision 1)

Nav says **Discovery** (`app/page.tsx:56`); the page beneath it says **Good
Gear** (`:72` `<h1>Good <em>Gear.</em></h1>`). AREA-106 #8 permits "Good Gear"
*only* as the Discovery destination label, but it also appears at
`app/page.tsx:72` (`good gear, nearby`), `app/layout.tsx:6` (page title) and
`components/auth-form.tsx:46`. Three of four uses are non-compliant.
**This blocks AREA-101 and AREA-102 and must be ruled on before copy work.**

## E. Questions requiring a user ruling

1. **"Circle" or "circle"?** AREA-106 #3 specifies capital *Circle*; AREA-102
   specifies lowercase *circle*. Code has lowercase (`app/page.tsx:72`). The
   two tickets contradict each other.
2. **Is requirement 18 scorable?** "Must use researched UI/UX patterns" has no
   source-level predicate. Score it, or mark it not statically verifiable?
3. **Does requirement 1 constrain Discovery?** Communications contains no map,
   so #1 is literally satisfied — but in Discovery the map column is the
   *larger* one (`.discover-layout` 1.25fr vs 0.75fr, `app/globals.css:32`),
   which AREA-102 forbids.
4. **What counts as "the landing-page map area"?** The seven items render in
   `.listing-strip` *below* the map; the map itself has one marker
   (`components/okanagan-map.tsx:36`). Also: four prices are two-digit
   (`$65`, `$90`, `$40`, `$55`), not the required `$XXX` form, and the strip
   renders `filteredListings`, so the count drops below seven when the search
   box is used.

## Acceptance criteria

- Each of the four questions above has a recorded ruling.
- Every PARTIAL/ABSENT/CONTRADICTED row maps to a bounded execution ticket or a
  documented deferral.
- No mislabeled control ships without either real behavior or an explicit
  planned/unavailable state.

## Rollout and rollback

Register only; no code change. Supersedes nothing. AREA-106 remains the release
gate; this ticket supplies its evidence.
