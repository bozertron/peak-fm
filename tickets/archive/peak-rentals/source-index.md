> **ARCHIVED — SUPERSEDED 2026-09-18.**
> This ticket predates the local-market cloud redesign. It is retained as
> evidence and history only. Do not implement from it. The live backlog is
> `tickets/peak-cloud/`; what carried forward is recorded in
> `tickets/archive/SUPERSESSION-LEDGER.md`.

---

# Source Index

## Governing sources

1. Peak Rentals: Vision Integration Master Guide
2. Peak LLM Implementation Checklist
3. Peak Aesthetic System
4. Peak Communications / WebLink Integration
5. Peak Map Interface

## Non-negotiable preservation boundary

Existing equipment CRUD, Stripe Connect payments, search with unfulfilled logging, admin analytics, and NextAuth authentication are production-ready and must remain stable. New work is additive unless a ticket explicitly documents an approved extension.

## Required phase order

1. Non-destructive schema extensions
2. Trust-system API routes
3. WebLink communications integration
4. Map interface layer
5. Aesthetic transformation
6. Trading card / gallery system

## Wave 1 research agents

- Architecture: `fMNVDvHBbbj`
- Trust and communications: `eTpQ6VglgxN`
- Map and UX: `hfbAkPR6jM0`
- QA and operations: `ghdYXu4zBAf`
- Delivery planning: `tx28PTkFymy`

Wave 1 findings identified release-blocking concerns around authorization policy, privacy-preserving location handling, durable messaging, serverless/WebSocket assumptions, idempotency, schema migration safety, accessibility, observability, and regression coverage.

## Product-direction audit

- `AREA-101` through `AREA-105` cover the main implementation areas.
- `AREA-106-requirements-audit.md` is the release-gate audit for the supplied Communications / Discovery / Good People / Flow / GREAT Community prompt. It enumerates the explicit copy, layout, interaction, and configuration requirements that were missing or underspecified in the earlier tickets.
- `AREA-107-agent-orchestration-protocol.md` records the user's one-agent/one-file deployment contract, prompt preamble, anti-clobber rules, blind critic policy, timeout classes, STOP-SAFE behavior, and the missing canonical 11-rule PROHIBITED block.
- No code-harvesting skill was available in the project skill registry; no such tool or process was represented as used.
