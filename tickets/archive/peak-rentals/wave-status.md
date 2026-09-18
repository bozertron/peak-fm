> **ARCHIVED — SUPERSEDED 2026-09-18.**
> This ticket predates the local-market cloud redesign. It is retained as
> evidence and history only. Do not implement from it. The live backlog is
> `tickets/peak-cloud/`; what carried forward is recorded in
> `tickets/archive/SUPERSESSION-LEDGER.md`.

---

# Research Wave Status

## Wave 1 — Specialist research

Completed and queued outputs from five agents. Their chat IDs and focus areas are recorded in `source-index.md`.

## Wave 2 — Cross-functional synthesis

In progress. AREA-102 and AREA-105 now have verified UI handoffs: Discovery likes and map intro requests preserve listing context and open Communications with the Mountain Horn contact selected. Backend persistence, authorization, realtime transport, and moderation remain open implementation work. `wave-2/AREA-108-synthesis-and-scope.md` is the first cross-functional checkpoint, consolidating product naming, canonical tool homes, handoffs, open decisions, and implementation guardrails. Architecture/security reconciliation and QA/release synthesis remain queued.

## Wave 3 — Final ticket package

Will produce the ordered backlog, decision register, dependency graph, definitions of ready/done, release gates, and operational follow-through runbook.

## Current audit checkpoint

A direct requirement audit has been added as `AREA-106-requirements-audit.md`. The prior tickets were not fully exhaustive: they captured the five major areas, but omitted or underspecified several explicit copy removals, the seven-item landing-page inventory, map-as-secondary constraint, exact hero/header wording, Flow sub-capabilities, Lexicon tile behaviors, and the distinction between intentional Communications and ordinary close-contact conversations. Those requirements are now recorded and linked back to the five implementation tickets.

A deployment-governance ticket has been added as `AREA-107-agent-orchestration-protocol.md`. It captures every supplied agent constraint: one agent/one file, research-execute-test-return-stop, mandatory preamble and verbatim prohibited block, SKIP/STOP-SAFE, anti-clobber, probe pins, blind critic, kill-mutation, two-round cap, no agent commits, three-argument helper, and timeout classes. The canonical 11-rule PROHIBITED block itself was not present in the supplied note, so the first governed wave must retrieve it or stop and ask rather than inventing it.


## Wave 3 — Diagnostic, delta, and the native-first pivot

Wave 3 opened as the ordered execution backlog and was reshaped twice by
evidence.

- `wave-3/AREA-109` — sign-in 500 root cause. Reproduced locally across five
  controlled scenarios rather than waiting on preview logs. Established
  `GET /api/auth/ok` as a zero-cost health oracle, rejected the rollback
  recommendation as unsafe, and identified that **no deploy step ever creates
  the auth tables**. Finding F1 was later corrected after an independent code
  trace disproved it; the correction is recorded in the ticket rather than
  silently applied.
- `wave-3/AREA-110` — ticket-to-code delta register. Every removal string the
  audit demanded is genuinely absent. Two hard failures remain: the required
  hero headline does not exist (the nearest match says COMMERCE, on the auth
  page), and the peak/flow mark sits below the four panels instead of centred
  in them. Also catalogues six mislabeled controls and three state bugs.
- `wave-3/AREA-111` — execution wave plan. **Partly superseded by AREA-112.**
- `wave-3/AREA-112` — Tauri native-first architecture. Targets are Fedora
  Workstation and Android, local-first, with the discovery/sync server
  explicitly deferred. Withdraws the server-components recommendation and the
  `lib/data/*.ts` extraction step, and gives the unwired Drizzle schema and
  shadcn button a home.
- `wave-3/AREA-113` — typography. Implemented: fonts self-hosted, one family
  (Commissioner) plus the Baskerville `peak` wordmark.
- `doctrine/PROHIBITED.txt` — the canonical block, verbatim.
- `evidence/` — re-runnable reproduction scripts and per-scenario server stderr.

### Open and blocking

1. The PROHIBITED block contains **10** numbered rules; the doctrine calls it
   an 11-rule block. Not resolved, not invented. Gates the first governed wave.
2. Framework: Vite or Next static export (AREA-112 D1).
3. Offline map strategy (AREA-112 D2).
4. The four scoring questions in AREA-110 section E, and the naming collision
   between Discovery and Good Gear.
