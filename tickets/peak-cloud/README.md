# peak-cloud — Live Backlog

The implementation backlog for Peak as a **local-market cloud application**.
Supersedes `../archive/peak-rentals/` in full.

## Before you write anything

1. `../doctrine/PROHIBITED.txt` — 10 rules plus a closer. Binding. Note **D1**.
2. `../doctrine/AREA-107-agent-orchestration-protocol.md` — how waves are run.
3. `docs/PEAK-PRODUCT-SPEC.md` — what the product is.
4. `OPEN-DECISIONS.md` — what you must **not** decide yourself.

## Numbering

| Range | Area |
|---|---|
| PEAK-200–209 | Foundation — schema, shell, migrations, auth |
| PEAK-210–219 | Buy |
| PEAK-220–229 | Sell |
| PEAK-230–239 | Commerce |
| PEAK-240–249 | Admin and beta operations |
| PEAK-250–259 | Platform — deploy, observability, CI |
| PEAK-260–269 | Rent |
| PEAK-270–279 | Trade |
| PEAK-280–289 | Find |
| PEAK-290–299 | Plans |
| PEAK-300–309 | Communicate |
| PEAK-310–319 | Account |

## Status

`STATUS.md` is the single board. Foundation tickets PEAK-200 to PEAK-204 are
**done and verified**; everything else is open.

## Operating rules

1. **No stubs.** An honest empty state is not a stub; a `// TODO: implement` is.
2. **Additive by default.** The foundation is working code — extend it.
3. **Every ticket carries** dependencies, acceptance criteria, verification
   evidence, and a rollback note.
4. **Proof, not assertion.** "Done" requires the real command run and its actual
   output pasted. AREA-109 exists because something was assumed to work.
5. **`pnpm typecheck && pnpm build && pnpm db:check` must pass** before any
   ticket is closed.
6. **Contradictions become decisions, not silent choices.** Add to
   `OPEN-DECISIONS.md` and stop.
