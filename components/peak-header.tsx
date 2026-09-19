'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { AccountGraphic } from '@/components/account-graphic'
import { SURFACES } from '@/lib/surfaces'


export type HeaderUser = {
  name: string
  email: string
  role: string
  avatarKind: string
  avatarSeed: string | null
} | null

export function PeakHeader({
  user,
  marketName,
  unreadCount = 0,
}: {
  user: HeaderUser
  marketName: string | null
  unreadCount?: number
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  /**
   * Better Auth's sign-out endpoint takes a JSON POST, so a plain HTML form
   * would post the wrong content type and fail without saying so. Going
   * through the client keeps the cookie clearing and the redirect honest, and
   * a failure surfaces instead of leaving the menu stuck.
   */
  async function signOut() {
    setSigningOut(true)
    try {
      await authClient.signOut()
      router.replace('/')
      router.refresh()
    } finally {
      setSigningOut(false)
    }
  }

  // Close on outside click and on Escape — a menu you cannot dismiss with the
  // keyboard is a trap for anyone not using a mouse.
  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  // Close the menu whenever the route changes.
  useEffect(() => {
    // The route change IS the trigger: reading `pathname` here is what makes
    // the dependency real rather than incidental.
    if (pathname) setMenuOpen(false)
  }, [pathname])

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <header className="topbar">
      <Link href="/" className="brand" aria-label="Peak home">
        peak
      </Link>

      <nav className="main-nav" aria-label="Primary">
        {SURFACES.map((surface) => (
          <Link
            key={surface.href}
            href={surface.href}
            className={`nav-link ${isActive(surface.href) ? 'active' : ''}`}
            aria-current={isActive(surface.href) ? 'page' : undefined}
          >
            {surface.label}
            {surface.href === '/communicate' && unreadCount > 0 && (
              <span className="nav-badge" role="status" aria-label={`${unreadCount} unread`}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="top-actions">
        {marketName && (
          <span className="market-pill" title="Your local market">
            {marketName}
          </span>
        )}

        {user ? (
          <div className="account-wrap" ref={menuRef}>
            <button
              type="button"
              className="profile-button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <AccountGraphic
                name={user.name}
                kind={user.avatarKind}
                seed={user.avatarSeed}
                size={28}
              />
              <span className="profile-name">{user.name}</span>
            </button>

            {menuOpen && (
              <div className="account-menu" role="menu">
                <span className="account-menu-email">{user.email}</span>
                <Link href="/account" role="menuitem">
                  Account &amp; settings
                </Link>
                <Link href="/account/history" role="menuitem">
                  Buy &amp; sell history
                </Link>
                {user.role === 'admin' && (
                  <Link href="/admin" role="menuitem">
                    Admin
                  </Link>
                )}
                <button type="button" role="menuitem" onClick={signOut} disabled={signingOut}>
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="account-wrap">
            <Link href="/sign-in" className="profile-button">
              Sign in
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
