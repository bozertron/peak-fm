import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { PeakHeader, type HeaderUser } from '@/components/peak-header'
import { getCurrentMarket } from '@/lib/queries/market'
import { countUnreadThreads } from '@/lib/queries/communicate'

/**
 * The application shell: every surface in the header renders inside this.
 *
 * Sign-in, sign-up and /admin sit outside the group deliberately — they have
 * their own chrome and must not offer the primary nav.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })

  const sessionUser = session?.user as
    | { name: string; email: string; role?: string; avatarKind?: string; avatarSeed?: string | null }
    | undefined

  const user: HeaderUser = sessionUser
    ? {
        name: sessionUser.name,
        email: sessionUser.email,
        role: sessionUser.role ?? 'member',
        avatarKind: sessionUser.avatarKind ?? 'initials',
        avatarSeed: sessionUser.avatarSeed ?? null,
      }
    : null

  const market = await getCurrentMarket()
  const unread = session?.user ? await countUnreadThreads(session.user.id) : 0

  return (
    <div className="peak-app">
      <PeakHeader user={user} marketName={market?.name ?? null} unreadCount={unread} />
      {children}
    </div>
  )
}
