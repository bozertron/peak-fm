# Open Decisions — peak-cloud

Decisions that are **not** the execution team's to make. Per STOP-SAFE in
`../doctrine/AREA-107-agent-orchestration-protocol.md`, an agent that reaches
one of these **halts and asks**. It does not pick an answer and proceed.

Each entry names who decides, what is blocked, and what has already been done
to keep the blockage from spreading.

---

## D1 — The PROHIBITED rule count *(carried forward, still open)*

**Decides:** the user.
**Blocks:** the first governed agent wave.

`../doctrine/AREA-107-agent-orchestration-protocol.md` requires an **11-rule**
PROHIBITED block pasted verbatim into every agent prompt, and forbids
paraphrasing or inventing a replacement.

`../doctrine/PROHIBITED.txt` contains **10** numbered rules plus an unnumbered
`STAY SHORT:` closer.

No eleventh rule has been written. The closer has not been promoted to rule 11.
This has been open since AREA-111 and is carried forward unresolved rather than
quietly closed.

**To unblock:** supply the canonical block verbatim, or confirm that the 10-rule
file plus its closer *is* the canonical block and the doctrine's "11" is an
error.

---

## D2 — Tailwind and shadcn: adopt or remove

**Decides:** the user.
**Blocks:** nothing today. Blocks any new shadcn component.

`postcss.config.mjs` loads `@tailwindcss/postcss` and `components.json`
describes a shadcn `base-nova` setup — but **`app/globals.css` never imports
Tailwind, so no utility classes are generated at all**.

Consequence: `components/ui/button.tsx` is pure Tailwind and would render
unstyled even if imported. It is imported nowhere.

Per rule 9 it was not deleted. Everything scaffolded uses the hand-written CSS
system, which works and is documented in `docs/PEAK-DESIGN-SYSTEM.md`.

**Options:**
1. **Remove** Tailwind, shadcn and `button.tsx`. Commit to hand-written CSS.
2. **Adopt** Tailwind: add `@import "tailwindcss"`, define the theme from the
   existing tokens, migrate ~340 lines of CSS and 14 components.
3. **Leave as is** — but then `button.tsx` stays orphaned, which rule 9 dislikes
   and which will confuse every future agent exactly as it confused AREA-112.

---

## D3 — Hosting target

**Decides:** the user.
**Blocks:** the deploy pipeline ticket (PEAK-250).

`app/layout.tsx` renders `@vercel/analytics` in production. Off Vercel it
requests `/_vercel/insights/script.js` and 404s — the only console error in the
running application.

Not fatal, but it is a live signal about an undecided question. The answer also
determines how `BETTER_AUTH_URL`, `DATABASE_URL` and the predeploy `db:check`
gate are wired.

**Options:** Vercel + a hosted Postgres · a container host · something else.
The component was not deleted pending this.

---

## D4 — Payment account model

**Decides:** the user, with whatever advice they take on regulation.
**Blocks:** PEAK-230 (provider seam) can be written; PEAK-231 (Stripe
implementation) cannot ship without this.

Does Peak **hold funds** at any point, or is it purely a facilitator moving
money between buyer and seller? This changes Peak's regulatory posture in
Canada, not just its code.

---

## D5 — Tax calculation scope for BC

**Decides:** the user.
**Blocks:** the tax fields of the Accounting Package (PEAK-212).

Does Peak **calculate** GST/PST, **collect** it, or only **record** what the
parties tell it? Three different products with three different liabilities.

Note what is already settled regardless: `reliefNotes` may never be populated
without a non-empty `researchSources` and an explicit `confidence`. Research is
presented as research, never as advice. That constraint is not open.

---

## D6 — LLM provider for the Product Widget Creator

**Decides:** the user.
**Blocks:** PEAK-221.

The widget creator is LLM-assisted and **mandatory** for service listings, so
this is on the critical path for Sell, not a nice-to-have.

Needed: which model, whose key, what the per-listing cost ceiling is, and
whether drafts are generated server-side only. `service_widget.generationLog`
already exists to record prompt, model and the revisions the seller kept.

---

## D7 — Native wrapper, re-sequenced

**Decides:** the user. **Blocks:** nothing now.

AREA-112's Tauri native-first architecture is withdrawn, not refused. If a
native app is still wanted it becomes a **client of the cloud API** rather than
the architecture. Raise it when the web beta is stable; do not design for it
now.

---

## Closed by the new direction

| Was open | Resolution |
|---|---|
| AREA-108 #1 — "Discovery" or "Good Gear"? | Moot. Both retired; the surface is **Buy** |
| AREA-112 D1 — Vite or Next static export? | Moot. **Next.js, server-rendered, cloud-hosted** |
| AREA-112 D2 — offline map strategy | Moot for v1. Online tiles are fine in a cloud app |
| AREA-108 #5 — first release boundary for "flow" | The **Accounting Package** is in scope for Buy and Sell |
| AREA-108 #2 — is Ask AI advisory or can it send? | Moot. Ask AI is retired; the LLM surface is the Widget Creator (D6) |
