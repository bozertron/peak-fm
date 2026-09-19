# [PEAK-207] Lint and format

|  |  |
|---|---|
| **Wave** | **0** |
| **Status** | OPEN |
| **Area** | Platform |
| **Depends on** | none |
| **Blocks** | **every ticket** (review cost) |
| **Blocked by decision** | — |
| **Files you own** | lint/format config at the repo root |
| **Risk** | review cost at scale |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

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
