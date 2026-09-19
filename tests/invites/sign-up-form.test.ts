/**
 * PEAK-240, bar row 240.A7 — THE RENDER PROOF FOR THE INVITE FIELD.
 *
 * WHY THIS FILE EXISTS
 * The rest of PEAK-240 is proven at the server: `tests/invites/enforcement.test.ts`
 * drives `auth.handler()` and shows that a sign-up without a redeemable code is
 * refused with a 403 and leaves no `user` row. That is the half that counts, and it
 * is deliberately NOT what this file tests. What was never proven — and what the
 * wave bar asks for in row 240.A7 — is the other half of the same decision: the
 * form a human actually sees. `components/auth-form.tsx` decides, at line 39,
 * `const needsInvite = isSignUp && inviteRequired`, and renders the beta-code input
 * at line 100. Until this file, no artifact in the repository rendered that
 * component: `grep -rn renderToStaticMarkup tests/` returned zero. A guard that can
 * be deleted without any test noticing is a guard that will be deleted, and a DONE
 * status resting on an artifact that does not exist is a false DONE.
 *
 * WHAT IS PROVEN, AND WHAT WOULD BE THE BUG
 *   - flag ON + `mode="sign-up"`  -> the invite field IS in the markup;
 *   - flag OFF + `mode="sign-up"` -> it is NOT, while the name/email/password
 *     fields still are (so "absent" cannot be satisfied by rendering nothing);
 *   - `mode="sign-in"` + flag ON  -> it is NOT: an existing account never needed a
 *     code, and a sign-in URL that showed the field would be a second, wrong UI.
 *
 * The assertions are made on the RENDERED HTML, not on the component's internals,
 * because the rendered HTML is the artifact the ticket names. Each field is located
 * as a real `<input>` tag and its attributes are read one by one — a label, a name,
 * a `maxLength`, an `autoComplete` — so the test fails on the day an attribute is
 * dropped or loosened (a `maxLength` that grew, an `autoComplete` that went back to
 * the browser's autofill behaviour, a `required` that got added and would suppress
 * the component's own message). "The string got longer" is not an assertion, and is
 * not made anywhere below.
 *
 * WHAT IS MOCKED, AND WHY NOTHING ELSE IS
 * `AuthForm` is a `'use client'` component, so its two browser-side seams are
 * replaced, and only those two — the same way `tests/examples/action-authz.test.ts`
 * replaces `next/headers`:
 *
 *   1. `useRouter` from `next/navigation`. Outside a Next server there is no app
 *      router and no request storage, so the real hook throws. The stub records
 *      that it was called, which is how each test proves the REAL component was on
 *      the render path rather than a mock standing in for it.
 *   2. `authClient` from `@/lib/auth-client` (`better-auth/react`'s
 *      `createAuthClient`). It is a network client with no server behind it in a
 *      unit render; the stubs resolve the shape `handleSubmit` branches on
 *      (`result.error`) and are never called by a static render — the component's
 *      submit path is exercised for real, over HTTP, in `enforcement.test.ts`.
 *
 * The component itself, `next/link`, React and `renderToStaticMarkup` are all real.
 * Nothing is asserted against a mock: the mocks are seams, the component is the
 * subject.
 *
 * NO DOM IS USED, ON PURPOSE (bar row cx3.A5)
 * `renderToStaticMarkup` from `react-dom/server` needs no `document`, so there is
 * no jsdom, no happy-dom and no @testing-library here — no new dependency, and no
 * DOM emulation whose behaviour could differ from the markup Next actually serves.
 * The vitest environment stays `node` (see `vitest.config.ts`).
 *
 * STATUS: real implementation.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthForm } from '@/components/auth-form'

/**
 * The mocked seams, in one hoisted container.
 *
 * `vi.mock` factories are hoisted above the imports, so they may not close over an
 * ordinary top-level binding — it would still be in its temporal dead zone when the
 * mocked module is first imported (the same reason `tests/examples/action-authz.test.ts`
 * uses `vi.hoisted`). Plain functions, not `vi.fn()`, are used for the router stub:
 * the global config sets `restoreMocks: true`, and `mockRestore()` would empty a
 * `vi.fn`'s implementation before every test. A counter has no such lifecycle, so
 * the "the real component rendered through this seam" assertion is deterministic.
 */
const seams = vi.hoisted(() => {
  const counters = { routerCalls: 0 }
  return {
    counters,
    /**
     * The `useRouter()` stub. `push`/`refresh` exist because `handleSubmit` calls
     * them; a static render never submits, so they are never reached, and they are
     * deliberately not asserted on — the submit path is the auth endpoint's story.
     */
    useRouter: () => {
      counters.routerCalls += 1
      return {
        push: () => undefined,
        refresh: () => undefined,
      }
    },
    /**
     * The auth client stub. The resolved value is the shape `handleSubmit` reads:
     * `result.error` (falsy = success, so the form would navigate rather than
     * report). `data` names a user because that is what the endpoint returns.
     */
    signUpEmail: async () => ({
      data: { token: 'stub-token', user: { id: 'stub-user-id' } },
      error: null,
    }),
    signInEmail: async () => ({
      data: { token: 'stub-token', user: { id: 'stub-user-id' } },
      error: null,
    }),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: seams.useRouter,
}))

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signUp: { email: seams.signUpEmail },
    signIn: { email: seams.signInEmail },
  },
}))

/** The props the two real call sites pass — see `app/sign-up/page.tsx`. */
type AuthFormProps = {
  mode: 'sign-in' | 'sign-up'
  inviteRequired?: boolean
}

/** Render the REAL component to an HTML string. No DOM, no test renderer. */
function renderAuthForm(props: AuthFormProps): string {
  return renderToStaticMarkup(createElement(AuthForm, props))
}

/**
 * Attribute names are ASCII case-insensitive in HTML, and React's server renderer
 * emits the camelCase prop name it was given (`maxLength="8"`), so the tag is read
 * into a lowercased-name map: the assertions then talk about `maxlength`, the
 * attribute HTML actually defines, instead of about whichever spelling React
 * happens to emit. Values are compared exactly, never lowercased.
 */
const ATTRIBUTE = /([a-zA-Z][a-zA-Z0-9-]*)(?:="([^"]*)")?/g

function attributesOf(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const match of tag.replace(/^<\w+/, '').replace(/\/?>$/, '').matchAll(ATTRIBUTE)) {
    const name = match[1]
    if (name !== undefined) attributes[name.toLowerCase()] = match[2] ?? ''
  }
  return attributes
}

/** Every `<input …>` tag in the markup, in document order. */
function inputTags(html: string): string[] {
  return html.match(/<input[^>]*>/g) ?? []
}

/** The first `<input>` whose `attribute` equals `value`, or null if there is none. */
function findInput(html: string, attribute: string, value: string): string | null {
  for (const tag of inputTags(html)) {
    if (attributesOf(tag)[attribute] === value) return tag
  }
  return null
}

/**
 * The beta-code input, or a thrown error carrying the whole rendered markup. Used
 * by the case that REQUIRES the field, so a missing field reports what was rendered
 * instead of a bare `expected null not to be null`.
 */
function requireInviteInput(html: string): string {
  const tag = findInput(html, 'name', 'inviteCode')
  if (tag === null) {
    throw new Error(
      'expected the beta-code field (<input name="inviteCode">) to be rendered for a ' +
        `sign-up with inviteRequired, but the markup contains no such input. Rendered: ${html}`,
    )
  }
  return tag
}

beforeEach(() => {
  // The counter is module state shared by every test in this file; reset it so each
  // test's assertion is about its own render and not about an earlier one's.
  seams.counters.routerCalls = 0
})

describe('AuthForm renders the beta-code field only where it is required (PEAK-240, 240.A7)', () => {
  it('renders the invite field for a sign-up while the beta is closed', () => {
    const html = renderAuthForm({ mode: 'sign-up', inviteRequired: true })

    // The field itself, located by the `name` the component's own `handleSubmit`
    // reads out of state — not by a substring of the page.
    const invite = requireInviteInput(html)
    const attributes = attributesOf(invite)

    // Its label text, immediately followed by the input it labels.
    expect(html).toContain('Beta code')
    expect(html).toContain('Beta code<input')

    // The attributes the field actually carries, asserted one by one.
    expect(attributes.name).toBe('inviteCode')
    expect(attributes.maxlength).toBe('8')
    expect(attributes.autocomplete).toBe('off')
    expect(attributes.inputmode).toBe('text')
    expect(attributes.autocapitalize).toBe('characters')
    expect(attributes.autocorrect).toBe('off')
    expect(attributes.spellcheck).toBe('false')

    // Accessibility wiring: required to a screen reader, and described by the note
    // that explains WHY it is required. The `id` must exist for the reference to
    // mean anything, which is why the note is asserted too.
    expect(attributes['aria-required']).toBe('true')
    expect(attributes['aria-describedby']).toBe('invite-code-note')
    expect(html).toContain('id="invite-code-note"')
    expect(html).toContain('Peak is invite-only while the beta is closed')

    // The deliberate ABSENCE of the HTML `required` attribute, per the comment in
    // `components/auth-form.tsx`: the browser's own validation would block submit
    // before `handleSubmit` could show the component's message. Adding `required`
    // back would silently replace that message with the browser's.
    expect(attributes.required).toBeUndefined()

    // The seam was on the render path — the real component rendered, and the
    // mocked module was not bypassed by a stub component.
    expect(seams.counters.routerCalls).toBe(1)
  })

  it('omits the invite field for a sign-up with the beta open, and still renders the other fields', () => {
    // `inviteRequired` is left off, which is the component's own default and the
    // way `app/sign-up/page.tsx` calls it when `isEnabled('beta.invite_only')` is
    // false. An unknown flag key is OFF (`lib/queries/market.ts`), so this is also
    // the state every visitor sees before the flag reader has answered.
    const html = renderAuthForm({ mode: 'sign-up' })

    // The absence.
    expect(findInput(html, 'name', 'inviteCode')).toBeNull()
    expect(html).not.toContain('Beta code')
    expect(html).not.toContain('invite-code-note')

    // ...asserted POSITIVELY alongside it, so a markup string that had been emptied
    // (or a component that failed to render a form at all) could not pass this test.
    const nameField = findInput(html, 'autocomplete', 'name')
    expect(nameField).not.toBeNull()
    expect(attributesOf(nameField ?? '').required).toBe('')

    const emailField = findInput(html, 'autocomplete', 'email')
    expect(emailField).not.toBeNull()
    expect(attributesOf(emailField ?? '').type).toBe('email')

    const passwordField = findInput(html, 'autocomplete', 'new-password')
    expect(passwordField).not.toBeNull()
    const passwordAttributes = attributesOf(passwordField ?? '')
    expect(passwordAttributes.type).toBe('password')
    expect(passwordAttributes.minlength).toBe('8')

    // And this is the sign-up page, so the open-beta copy and the sign-up submit
    // label are present: the field is missing because the flag is off, not because
    // the wrong form rendered.
    expect(html).toContain('Join your local market.')
    expect(html).toContain('Create account')

    expect(seams.counters.routerCalls).toBe(1)
  })

  it('omits the invite field for a sign-in even when inviteRequired is true', () => {
    // The flag is passed as true on purpose: sign-in is an existing account and
    // never needed a code, so the component's `isSignUp &&` half must hold on its
    // own. A mutation that dropped `isSignUp &&` from line 39 fails here.
    const html = renderAuthForm({ mode: 'sign-in', inviteRequired: true })

    expect(findInput(html, 'name', 'inviteCode')).toBeNull()
    expect(html).not.toContain('Beta code')
    expect(html).not.toContain('invite-code-note')

    // Positive assertions again: this is the sign-in form, with the sign-in
    // password autofill hint rather than the sign-up one, and no name field.
    expect(findInput(html, 'autocomplete', 'name')).toBeNull()
    expect(findInput(html, 'autocomplete', 'email')).not.toBeNull()

    const passwordField = findInput(html, 'autocomplete', 'current-password')
    expect(passwordField).not.toBeNull()
    expect(attributesOf(passwordField ?? '').type).toBe('password')
    expect(findInput(html, 'autocomplete', 'new-password')).toBeNull()

    expect(html).toContain('Welcome back.')
    expect(html).toContain('Sign in')

    expect(seams.counters.routerCalls).toBe(1)
  })
})
