# [PEAK-221] Sell: LLM-assisted Product Widget Creator

|  |  |
|---|---|
| **Wave** | **2** |
| **Status** | OPEN — manual path unblocked, **LLM path blocked by D6** |
| **Area** | Sell |
| **Depends on** | **PEAK-222** |
| **Blocks** | nothing |
| **Blocked by decision** | **D6** (LLM path only) |
| **Files you own** | `lib/llm/**`, the service-widget composer section |
| **Risk** | cost / trust / UX |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

## Intent
"Optional for physical product but **mandatory** for Service Product
Presentation." The widget renders at the **top level** of the listing as
*service overview + pricing + booking tool*, so someone viewing a local
individual's house-cleaning service can book it there and then.

## Depends on the shared composer

The widget is a composer section supplied by this ticket, rendered by
**PEAK-222**'s composer. Build the section and the booking tool in this
ticket's own files.

## Scope
- LLM drafts `service_widget.headline` and `overview` from what the seller has
  already entered, plus suggested `service_pricing_tier` rows.
- The seller edits everything. **The seller keeps editorial control.**
- `generatedBy` records `llm` or `manual`; `generationLog` keeps prompt, model
  and the revisions the seller kept.
- Booking tool: `request` (seller confirms) or `instant`, with `leadTimeHours`
  and `serviceAreaKm`, writing `service_booking`.
- **Enforcement:** a listing with `offeringType = 'service'` cannot reach
  `status = 'active'` without a `service_widget`. Enforce in the publish path
  and with a database constraint.

## Trust rules
1. LLM output is **never** silently presented as the seller's own words. The
   draft is labelled until the seller accepts it.
2. The LLM never invents credentials, certifications, insurance or guarantees.
   If the seller did not state it, it does not appear.
3. Generation is server-side only. No key reaches the browser.
4. A per-listing cost ceiling, enforced before the call.

## Blocked
**D6** — model, key ownership, cost ceiling. The schema (`generatedBy`,
`generationLog`) is ready. Build the manual path and the booking tool first;
they are not blocked and are most of the value.

## Acceptance criteria
- Given a service listing without a widget, when publish is attempted, then it
  is refused with a clear reason.
- Given a generated draft, when the seller publishes unchanged, then
  `generatedBy = 'llm'` and the log records it.
- Given `instant` booking, when a customer books an open slot, then
  `service_booking` is created and both parties get a thread message.

## Verification evidence
Publish-refusal test. A booking round trip. The generation log for one draft.

## Rollback
Behind `llm.widget_creator` for the LLM path and `surface.sell` overall. The
manual path stays available if the LLM path is switched off.

---

## Definition of done

Every one of these, with **actual output pasted** — rule 6 of
`../doctrine/PROHIBITED.txt` does not accept an assertion:

```bash
pnpm lint         # once PEAK-207 lands
pnpm typecheck
pnpm build
pnpm test         # once PEAK-206 lands
pnpm db:check     # all tables verified
pnpm check:links  # no unowned dead links
```

Plus this ticket's own **Verification evidence** above.

If your ticket creates a route, **delete its line from `KNOWN_MISSING` in
`scripts/check-links.mjs` in the same commit.** If it links to a route that
does not exist yet, add the line with your ticket number. That list may only
shrink.
