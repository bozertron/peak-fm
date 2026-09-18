> **ARCHIVED — SUPERSEDED 2026-09-18.**
> This ticket predates the local-market cloud redesign. It is retained as
> evidence and history only. Do not implement from it. The live backlog is
> `tickets/peak-cloud/`; what carried forward is recorded in
> `tickets/archive/SUPERSESSION-LEDGER.md`.

---

# [AREA-113] Typography system — Commissioner, self-hosted

- Priority: P1
- Phase: 5 (aesthetic)
- Owner: Orchestrator
- Source: User direction — keep Libre Baskerville for the `peak` wordmark; everything else Commissioner
- Dependencies: AREA-112
- Risk: brand / offline correctness
- Status: **Implemented and verified.** Three follow-ups remain (S5).

## Intent

One typeface family, differentiated by weight, size and tracking, with the
`peak` wordmark as the single deliberate exception. Fonts bundled, never
fetched, because this ships native.

## S1 — Offline correctness (the non-negotiable part)

`app/globals.css:1` previously began:

    @import url('https://fonts.googleapis.com/css2?family=DM+Mono...&family=Libre+Baskerville...');

For a Tauri app on Fedora and Android that is a cold-start network dependency
and a guaranteed flash of unstyled text — or no brand type at all — with no
connection. Replaced with local `@font-face` declarations against bundled files.

| File | Bytes | Covers |
|---|---|---|
| `public/fonts/commissioner-latin.woff2` | 36,700 | Commissioner, variable, weight 100-900, latin |
| `public/fonts/commissioner-latin-ext.woff2` | 30,988 | as above, latin-ext |
| `public/fonts/libre-baskerville-700-latin.woff2` | 20,436 | wordmark only, 700 |

~88KB total. Commissioner is a **single variable file** spanning 100-900, which
is why liberal use of weight costs nothing extra — a deliberate choice given
Target 2 is Android.

Original Google unicode-range subsetting was preserved verbatim, so latin-ext
still loads only when needed.

## S2 — Families replaced

| Was | Sites | Now |
|---|---|---|
| `'Libre Baskerville',serif` | 25 | Commissioner (except the 3 wordmark selectors) |
| `'DM Mono',monospace` | 14 | Commissioner at high tracking |
| `Arial,sans-serif` / bare `Arial` | 4 | Commissioner |

Note the body default was `Arial`, so body copy is an upgrade, not a swap.

### The wordmark has THREE selectors, not two
`.wordmark`, `.topbar .brand`, **and `.auth-brand`**. The third renders `peak`
at `components/auth-form.tsx:43` and would have been swept into the
substitution. It is restored by name after the substitution, so the later rule
wins on equal specificity.

## S3 — The scale

Two design rules govern the weights, and both are non-obvious:

**Weight compensation.** The old headings were Libre Baskerville at **400**. A
serif at 400 carries more visual texture than a sans at 400, so a like-for-like
swap reads as limp. Display sizes are compensated to 600-700 with tightened
tracking.

**Emphasis is weight, never slant.** Only the upright Commissioner file is
bundled. Any `<em>` would be synthesised into a fake oblique, which looks broken
at display size. `<em>` inside display headings is therefore rendered at weight
**250** against a 660-690 stem — "The Daily" heavy, "Yoddle" light. This is
more striking than the italic it replaces and costs nothing, because the
variable font already contains both ends.

| Role | Weight | Tracking | Notes |
|---|---|---|---|
| `peak` wordmark | 700 Baskerville | −.08em | unchanged |
| Masthead display | 690 | −.045em | line-height .95 |
| Section display | 670 | −.04em | line-height .97 |
| Hero / page heading | 660 | −.038em | |
| Auth / admin heading | 640 | −.032em | |
| Display `<em>` accent | 250 | −.03em | `font-style:normal` — no synthetic oblique |
| Panel heading | 640 | −.028em | |
| Section heading | 610 | −.022em | |
| Tile / card heading | 590-600 | −.015 to −.02em | |
| Eyebrow / kicker | 580 | **+.165em** | uppercase; replaces DM Mono's label texture |
| Stat numerals | 680 | −.045em | tabular figures |
| Card number / tile index | 520 | +.07em | tabular figures |
| Small emphatic label | 620 | −.004em | was Arial 700 |
| Nav link / chat mode | 530 | −.006em | 640 when active |
| Buttons | 560 | −.004em | |
| Body | 400 | — | line-height 1.55 |

**Tabular figures** are applied to prices, stat numerals and counts so values do
not jitter horizontally as they change.

**The `peak → flow` mark** uses weight contrast as a lockup: `peak` at 300,
the arrow `<em>` at 720. See S5.1 — its final form is still open.

## S4 — Verification evidence

- `pnpm typecheck` — exits 0.
- `pnpm build` — passes with TypeScript checking **enabled**.
- All three font files serve HTTP 200 at their declared byte sizes.
- **Zero** `fonts.googleapis` / `fonts.gstatic` references remain in the built CSS.
- Communications and sign-in routes rendered in Chromium at 2x: wordmark holds
  Baskerville, all other text picks up Commissioner, eyebrows read as labels,
  and the 690/250 display contrast renders as designed.

## S5 — Remaining work

1. **`peak → flow` needs a ruling.** It renders inline as `peak → flow` in one
   `<span>`. AREA-106 #11 requires `peak` **over** `flow`. Two questions: does
   the `peak` in that lockup count as the wordmark (and so keep Baskerville),
   and should it stack? Splitting it needs a `page.tsx` change, so it is
   deferred to the decomposition wave rather than done piecemeal here.
2. **AREA-110 D1 is now visible.** The sign-in eyebrow reads "THE CHAMPAGNE OF
   COMMUNITY **COMMERCE**". AREA-101 requires "The Champagne of Community
   **Communications**" — different word, and it belongs in the Communications
   hero, not on an auth page. Typography is correct; the copy is not.
3. **Android rendering check.** Variable-font weight rendering and the −.045em
   display tracking must be confirmed on a real Android WebView before Target 2
   is called done. Hinting and subpixel behavior differ from desktop Chromium.

## Acceptance criteria

- No remote font fetch at runtime on any target. **Met.**
- `peak` renders in Libre Baskerville in all three locations. **Met.**
- No other text uses Baskerville, DM Mono or Arial. **Met.**
- No synthesised oblique anywhere. **Met.**
- Type renders correctly with networking disabled. Met on desktop; Android
  pending S5.3.

## Rollout and rollback

Self-contained: `app/globals.css` plus three binary font files. Revert is a
single commit revert. No data, config or behavioral implications.
