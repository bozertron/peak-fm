'use client'

import { type FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const isSignUp = mode === 'sign-up'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = isSignUp
        ? await authClient.signUp.email({ name, email, password })
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
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={loading}>{loading ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'} <span>→</span></button>
        </form>
        <p className="auth-switch">{isSignUp ? 'Already have an account?' : 'New to Peak?'} <Link href={isSignUp ? '/sign-in' : '/sign-up'}>{isSignUp ? 'Sign in' : 'Create an account'}</Link></p>
      </section>
    </main>
  )
}
