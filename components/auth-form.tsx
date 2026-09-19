'use client'

import { type FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

/**
 * The wire contract between this form and the server half of PEAK-240
 * (`lib/auth.ts`): the beta code travels as a request header on the sign-up
 * request. It is a header, and not a field on the user schema, because the code
 * is not user data — it is a gate — and a schema field would mean a column and a
 * migration for something that is thrown away the moment it is redeemed.
 */
const INVITE_CODE_HEADER = 'x-peak-invite-code'

export function AuthForm({
  mode,
  inviteRequired = false,
}: {
  mode: 'sign-in' | 'sign-up'
  inviteRequired?: boolean
}) {
  const router = useRouter()
  const isSignUp = mode === 'sign-up'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  /**
   * The field exists only for a sign-up while the beta is closed. Sign-in never
   * shows it (an existing account never needed a code to get in), and sign-up
   * with the flag off never shows it (the default, so the plain caller and every
   * render the flag reader has not answered yet stay unchanged).
   */
  const needsInvite = isSignUp && inviteRequired

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    // Normalised the same way the server normalises it: `normaliseInviteCode` in
    // `lib/invites.ts` trims and upper-cases too. Belt and braces, so a code
    // retyped in lower case from a text message still matches the row — and the
    // server re-normalises regardless, which means nothing here is load-bearing
    // for correctness.
    const invite = inviteCode.trim().toUpperCase()

    // A CONVENIENCE, NOT THE ENFORCEMENT. This spares a doomed round-trip for the
    // person using the form. It cannot be the enforcement, because anyone can POST
    // the auth endpoint directly and never load this component: the refusal that
    // counts is the one in `lib/auth.ts` (PEAK-240 unit 240-2), keyed on
    // `isEnabled('beta.invite_only')`.
    if (needsInvite && invite.length === 0) {
      setError('Enter your beta code — it is required while the beta is closed.')
      return
    }

    setLoading(true)
    try {
      const result = isSignUp
        ? await authClient.signUp.email({
            name,
            email,
            password,
            // Sent only when the server is gating sign-up: with the beta open, a
            // code left over in state must not ride along on the request.
            ...(needsInvite ? { fetchOptions: { headers: { [INVITE_CODE_HEADER]: invite } } } : {}),
          })
        : await authClient.signIn.email({ email, password })

      if (result.error) {
        setError('We could not complete that request. Check your details and try again.')
        return
      }

      router.push('/')
      router.refresh()
    } catch {
      setError('We could not reach Peak right now. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <Link className="auth-brand" href="/">peak</Link>
        <div className="auth-eyebrow">YOUR LOCAL MARKET</div>
        <h1 id="auth-title">{isSignUp ? 'Join your local market.' : 'Welcome back.'}</h1>
        <p className="auth-lede">{isSignUp ? 'Buy, sell, rent, trade, find and plan — with the people around you.' : 'Sign in to pick up where you left off.'}</p>
        <form onSubmit={handleSubmit} className="auth-form">
          {isSignUp && <label>Name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>}
          <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required /></label>
          <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} minLength={8} required /></label>
          {needsInvite && <label>Beta code
            {/* No `required` attribute, unlike the fields above: the browser's own
                constraint validation would block submit before `handleSubmit` ran,
                so the message below would never be shown. The code is required — by
                `lib/auth.ts`, and by the empty-code check in `handleSubmit`. */}
            <input
              name="inviteCode"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              autoComplete="off"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={8}
              aria-required="true"
              aria-describedby="invite-code-note"
            />
            <small id="invite-code-note" className="muted-note">Peak is invite-only while the beta is closed, so a code is required to create an account.</small>
          </label>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={loading}>{loading ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'} <span>→</span></button>
        </form>
        <p className="auth-switch">{isSignUp ? 'Already have an account?' : 'New to Peak?'} <Link href={isSignUp ? '/sign-in' : '/sign-up'}>{isSignUp ? 'Sign in' : 'Create an account'}</Link></p>
      </section>
    </main>
  )
}
