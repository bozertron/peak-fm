# [AREA-107] Agent Orchestration and Context-Safety Protocol

- Priority: P0
- Phase: 3–6
- Owner: Orchestrator
- Source requirements: User-provided agent deployment doctrine, including the 21-line deployment note
- Dependencies: AREA-101, AREA-102, AREA-103, AREA-104, AREA-105, AREA-106
- Risk: operations / data / UX / security

## Intent

Make every future composed implementation wave auditable, bounded, non-destructive, and safe for high-value product requirements and intellectual property. This ticket records the user's deployment rules as an explicit operating contract rather than allowing them to remain implicit in chat history.

## Scope

### Deployment unit

- Short-run exclusively.
- One agent, one file, per deployment; no exceptions.
- One agent may have one file-specific goal only.
- Each deployment follows: RESEARCH → EXECUTE → TEST → RETURN → STOP.
- If an agent is unsure about anything, it must stop and ask a question directly.
- Agents never commit. The orchestrator verifies disk state and commits separately.
- Agents must write a report, commit-equivalent handoff, or teardown record when required by the wave, but must not perform the commit.

### Prompt composition

- Every agent prompt must be tightly scoped and hyper-detailed.
- Prompts must include patterns, line-numbered integration points, methods, and all context required to execute without other project knowledge.
- Prompts should target work that is normally completable in five minutes or less, including setup, execution, testing, and teardown.
- Agents should not expend more than 150K tokens except where a documented exception is necessary.
- The preamble must be assembled as `[identity, PROHIBITED, LIBRARIAN, RECIPE, STOPSAFE].join("\\n")`.
- The full 11-rule PROHIBITED block must be pasted verbatim into every agent prompt. It is a required input to the deployment system; do not paraphrase it or fabricate a replacement when the canonical block is unavailable.

### Safety guards

- Apply an idempotent SKIP guard; do not rebuild what already works.
- Apply STOP-SAFE behavior: halt on ambiguity and never decide silently.
- Enforce anti-clobber rules: parallel agents may touch only their own disjoint files.
- Shared files, including `App.tsx` and `lexicon.ts`, belong to the sequential registrar.
- Use a probe to pin anchors first.
- Inject probe data into builder prompts as context strings.
- Give the registrar truncated prior-builder output only as needed.
- The critic must be blind: it grades the disk and must never see builder reports.
- Kill-mutation is mandatory for critic work.
- Cap critic/fix cycles at two rounds, then halt for human review.

### Orchestration API and runtime limits

- Use the three-argument helper `a(label, prompt, opts)` exclusively.
- The four-argument arity bug silently swallows prompts and is prohibited.
- Timeouts: probe 300K; builder 600K; registrar, critic, fix, and verify 900K; docs 600K.

## Acceptance criteria

- Given a composed wave, when prompts are generated, then every agent is assigned one disjoint file or one file-specific goal.
- Given any agent prompt, when it is inspected, then the prompt contains the assembled preamble and the canonical verbatim PROHIBITED block.
- Given uncertainty or missing context, when an agent encounters it, then it stops and asks instead of making a silent product or architecture decision.
- Given parallel work, when files are changed, then no two agents mutate the same file and shared registrar-owned files remain untouched.
- Given a critic run, when grading occurs, then the critic receives disk state only, mutation is disabled, and no more than two fix rounds are allowed.
- Given a completed wave, when the orchestrator closes it, then disk verification, testing evidence, teardown/reporting, and commit ownership are recorded.
- Given the current project, when requirements are captured, then no product/IP detail is summarized away as merely a broad area label.

## Verification evidence

- Prompt inspection showing the required preamble and canonical block.
- File ownership matrix for the wave.
- Probe, builder, registrar, critic, fix, and verify outputs with timestamps and timeout classes.
- Disk diff reviewed by the orchestrator.
- Browser or automated QA evidence appropriate to the changed file.
- A final report confirming no agent committed changes.

## Rollout and rollback

Roll out on the next composed wave, beginning with a probe-only dry run. Roll back by stopping the wave, restoring the last verified disk state, and moving any superseded ticket or artifact to `tickets/peak-rentals/purge/` only after explicit obsolescence is recorded.

## Follow-through checkpoints

- Post-merge check: verify ownership boundaries and required prompt preamble.
- Deployment check: confirm timeout class and STOP-SAFE behavior.
- Monitoring window: inspect reports, disk diff, tests, and critic evidence before the next wave.
- Owner and escalation path: Orchestrator; unresolved ambiguity escalates directly to the user.

## Open requirement — RESOLVED 2026-09-19

**Original requirement, kept for the record (no longer binding):**

> The user references a canonical 11-rule PROHIBITED block, but the supplied note names it without including its verbatim contents. Before the first agent deployment under this protocol, retrieve the canonical block from the user's source or ask the user to provide it. Do not invent or paraphrase it.

**Resolution (2026-09-19):** satisfied. The design owner supplied the missing
text as a ruling rather than having it invented: the canonical governed block is
the **11-rule** block, rules 1–10 already being byte-identical between this
doctrine's referenced block and the repository file, and rule 11 being
`NO GREP-ABSENCE = INTENT-ABSENCE`.

The canonical 11-rule block is now in the repository at
`tickets/doctrine/PROHIBITED.txt` (rules 1–11 plus the `STAY SHORT` closer), from
which every agent prompt is pasted verbatim. The requirement above therefore no
longer blocks the first agent deployment, and agents no longer need to ask for
the block or to paraphrase one. D1 in
`../peak-cloud/OPEN-DECISIONS.md` records the closure.
