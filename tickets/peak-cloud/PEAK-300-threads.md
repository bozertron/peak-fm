# [PEAK-300] Communicate: threads and messaging

|  |  |
|---|---|
| **Wave** | **1** |
| **Status** | OPEN |
| **Area** | Communicate |
| **Depends on** | PEAK-200, PEAK-202 |
| **Blocks** | **PEAK-211, PEAK-232, PEAK-270, PEAK-290** |
| **Blocked by decision** | — |
| **Files you own** | `app/(app)/communicate/**`, `components/thread/**`, `lib/queries/communicate.ts` |
| **Risk** | privacy / performance |

> **Never edit a registrar file.** `app/globals.css`, `lib/surfaces.ts`,
> `lib/db/schema/index.ts`, `components/peak-header.tsx`, `app/(app)/layout.tsx`,
> `app/layout.tsx`, `package.json` and `drizzle.config.ts` belong to the
> sequential registrar.
> `components/composer/**` becomes registrar-owned **once PEAK-222 lands**, and
> `components/thread/registry.ts` **once PEAK-300 lands** — until then they
> belong to the ticket building them. Surface-specific CSS goes in your
> surface's own stylesheet, never in `globals.css`.

> **CRITICAL PATH.** Four tickets cannot start until this lands, and the
> renderer registry below is the reason they will not collide when they do.

## Intent
"The hub for all the communications between users, on all the topics. Easy to
archive/delete, etc. Also easy to action against."

## Scope
- Thread view with message history, composer, and attachments.
- Real-time delivery. Server-Sent Events or WebSocket — pick one, justify it in
  the ticket, and account for the hosting decision (**D3**), because a
  serverless host constrains long-lived connections.
- Message kinds rendered distinctly: `text`, `offer`, `checkout`, `question`,
  `system`.
- Read state via `thread_participant.lastReadAt`, driving the header badge that
  already exists.
- **Actions from the thread**: accept an offer, answer a question set, open the
  listing, export the package. "Easy to action against" is a requirement.
- Archive, mute, delete — all per participant.

## The message renderer registry — build this, it is not optional

**Five tickets need to render a message kind into this view** (PEAK-211
`question`, PEAK-232 `checkout`, PEAK-270 `offer`, PEAK-290 proposals, and this
one for `text` and `system`). If each edits the thread component, they clobber
each other. The pressure test flagged this as the second-worst collision in the
backlog.

So this ticket ships an extension point, not just a view:

```ts
// components/thread/registry.ts — owned by the registrar after this lands
export type MessageRenderer = (msg: Message, ctx: ThreadContext) => ReactNode
export const MESSAGE_RENDERERS: Record<string, MessageRenderer> = { ... }
```

Each downstream ticket then adds **one new file**
(`components/thread/kinds/<kind>.tsx`) plus **one line** in the registry. The
registry line is the only contended edit in the whole thread surface, and it
goes through the registrar.

A message whose `kind` has no registered renderer falls back to a visible
"unsupported message type" notice — never a blank bubble, never a crash. That
is rule 2: an unknown kind is surfaced, not swallowed.

## Privacy rule — the important one
**Archive, mute and delete are per-participant, never on `thread`.** One side
clearing their inbox must not remove the other side's copy. The schema already
enforces the shape; the code must respect it.

## Performance
Paginate history. Do not load a thousand messages to render a thread. The
inbox query is already denormalised on `thread.lastMessageAt` — keep it
accurate on every write.

## Acceptance criteria
- Given two participants, when one deletes the thread, then the other still has
  it intact.
- Given a new message, then the recipient's badge increments without a reload.
- Given an `offer` message, then the recipient can accept from the thread.
- Given a message with an unregistered `kind`, then the view shows an explicit
  unsupported notice rather than rendering nothing.
- Given 1,000 messages, then the thread renders the most recent page quickly and
  scrolls back.

## Verification evidence
Two-browser test proving per-participant delete and live delivery. A 1,000-
message thread with the render timing pasted.

## Rollback
Behind `surface.communicate`.

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
