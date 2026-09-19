# Peak — Design System

**Status:** Implemented in `app/globals.css`. **Last updated:** 2026-09-18

The previous aesthetic document described a Tailwind config and a component
library that were **never built**, with a palette that did not match what
actually shipped. It was deleted on 2026-09-19. This file describes the system
that is really in the tree.

## Ownership

`app/globals.css` is the shared design surface. Per the anti-clobber rule in
`tickets/doctrine/AREA-107-agent-orchestration-protocol.md`, it belongs to the
**sequential registrar**. Parallel builder agents must not edit it.

## Approach

Hand-written CSS with custom properties and semantic class names.

**Not Tailwind, and this is now settled.** Tailwind's PostCSS plugin was
configured but `globals.css` never imported it, so it generated zero utility
classes; the one shadcn component in the tree was therefore unstyled and
unreferenced. Decision **D2** closed as *remove* on 2026-09-19, and the whole
stack — `tailwindcss`, `@tailwindcss/postcss`, `components.json`,
`postcss.config.mjs`, `@base-ui/react`, `class-variance-authority`, `clsx`,
`tailwind-merge` — went with it.

Adding a component means writing CSS in this file. If you want a utility
framework back, that is a new decision and a migration ticket, not a drive-by.

Roughly 340 lines, organised by section, covering every class the app uses.

## Tokens

```css
--cream:    #f4f0e8   /* page background          */
--snow:     #fbfaf7   /* raised surfaces, cards   */
--charcoal: #242622   /* primary text             */
--slate:    #68706a   /* secondary text           */
--forest:   #244b3a   /* primary action, accent   */
--wood:     #a56b43   /* eyebrows, rules, flags   */
--burgundy: #743f3f   /* errors, unread badge     */
--navy:     #334653   /* tertiary                 */
--line:     #ded8cd   /* borders, dividers        */
```

Dark mode redefines these under `@media (prefers-color-scheme: dark)`, including
a lighter `--wood` for contrast on dark ground. Every status chip has a dark
variant.

## Typography

- **Commissioner** — one variable file, weights 100–900, self-hosted.
- **Libre Baskerville 700** — the `peak` wordmark **only**.

Both self-hosted with `unicode-range` subsetting. No Google Fonts request at
runtime: a webfont fetched at render is a layout shift and a third-party
dependency on every cold start. This is the one part of the archived design
work that shipped (AREA-113) and it is kept.

Display headings are large, tight (`letter-spacing: -.045em`), regular weight,
with an italic `<em>` in `--forest` carrying the emphasis.

## Core patterns

| Class | Use |
|---|---|
| `.page-section` | max 1280px, responsive padding, every surface page |
| `.surface-heading` | eyebrow + display h1 + lede + optional action |
| `.section-heading` | h2 + hint, used within a page |
| `.listing-grid` / `.listing-card` | the shared card grid for Buy/Rent/Trade |
| `.find-row` family | shared row for finds, offers, ROI, community, reports |
| `.empty-state` | dashed border, centred, honest text + action |
| `.notice` + `.notice-warn` / `.notice-info` | operator-caused states |
| `.status-chip` + `.status-*` | one chip system, semantic colour groups |
| `.data-table` | admin tables, horizontally scrollable on mobile |
| `.primary-button` / `.ghost-button` | the only two button styles |

### Status chips

Statuses across nine tables share one chip system, grouped by meaning rather
than by table — `active`, `open`, `paid`, `accepted` all read green; `draft`,
`pending`, `proposed` read amber; `withdrawn`, `declined`, `cancelled` read red.
Adding a status to a table needs no new CSS if it joins an existing group.

## The account graphic

`components/account-graphic.tsx` — a pure deterministic function of
`(kind, seed, name)`:

- **`initials`** — letterform on a colour picked by FNV-1a hash of the seed.
- **`ridge`** — an SVG mountain ridge, two ranges, generated from an xorshift
  sequence off the same hash.

No randomness, no network, no image host, identical on server and client. The
account form previews it live as the user edits the seed, which is what makes
it *interactive* rather than an upload dialog.

## Accessibility commitments

- `:focus-visible` gets a 2px `--forest` outline at 2px offset, globally.
- Nav marks `aria-current="page"`; the account menu is `role="menu"` and closes
  on outside click **and** Escape.
- Tables use `<th scope>` on both axes.
- Status is conveyed by text as well as colour.
- The unread badge carries an `aria-label` with the count.

## Responsive

Three breakpoints: 1080px collapses two-column layouts, 760px makes the header
nav horizontally scrollable and tables scroll, and the grid systems use
`auto-fit`/`minmax` so most of the layout never needs a query at all.
