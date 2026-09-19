# [PEAK-207] Lint and format

- Priority: **P0 — blocks the wave** · Area: Platform · Status: OPEN
- Dependencies: none
- Risk: review cost at scale

## Why this is first

**There is no linter and no formatter.** No ESLint, no Prettier, no Biome, no
`.editorconfig`. With one author that is a preference. With a rolling wave it
is a tax on every review: twenty agents will produce twenty brace styles,
twenty import orders, and diffs full of noise that hides the actual change.

## Scope
- Pick one tool and configure it. **Recommendation:** Biome — single binary,
  lint and format together, fast, no plugin matrix to maintain. ESLint +
  Prettier is acceptable; choose deliberately.
- Wire `pnpm lint` and `pnpm format`, and add `pnpm lint` to the definition of
  done in `README.md`.
- Match the existing style rather than reformatting the world: single quotes,
  no semicolons, 2-space indent, 100-column soft wrap. **The first commit must
  not be a 100-file reformat** — configure to match, then fix only genuine
  violations.
- Rules worth enforcing beyond style, because they encode this repo's doctrine:
  - no unused variables or imports (rule 9 — an orphan is unwired code)
  - no empty catch blocks (rule 2 — no silent failures)
  - no `any` without an inline justification comment
  - `import type` for type-only imports

## Acceptance criteria
- Given the current tree, when `pnpm lint` runs, then it passes with no
  file-wide reformatting in the diff.
- Given an unused import, then lint fails.
- Given an empty catch, then lint fails.

## Verification evidence
Paste `pnpm lint` output on the clean tree, and `git diff --stat` for the
configuration commit showing it is not a mass reformat.

## Rollback
Remove the config and the scripts.
