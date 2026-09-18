import Link from 'next/link'
import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { getAllMarkets } from '@/lib/queries/market'
import { SignedOutNotice, SurfaceHeading } from '@/components/surface'
import { AccountForm } from './account-form'

/**
 * Account management and settings.
 *
 * The header control is "a user applied interactive graphic + name", so this
 * is where both are chosen. Role is displayed but never editable here — see
 * `setUserRole` in ./actions.ts for the one path that can change it.
 */
export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user) {
    return (
      <main className="page-section">
        <SurfaceHeading eyebrow="ACCOUNT" title="Account & settings" lede="Your profile, your market, your history." />
        <SignedOutNotice what="Your account" />
      </main>
    )
  }

  // Read from the database rather than the session: the session is a snapshot
  // and can be a few minutes behind a change made in another tab.
  const [row] = await db
    .select({
      name: user.name,
      email: user.email,
      role: user.role,
      avatarKind: user.avatarKind,
      avatarSeed: user.avatarSeed,
      marketId: user.marketId,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1)

  if (!row) {
    // The session points at a user that is not in the database. That is a real
    // inconsistency and is surfaced rather than rendered as an empty form.
    throw new Error(
      `Session user ${session.user.id} has no row in "user". The session and the database disagree.`,
    )
  }

  const markets = await getAllMarkets()

  return (
    <main className="page-section">
      <SurfaceHeading
        eyebrow="ACCOUNT"
        title={
          <>
            Account &amp; <em>settings</em>
          </>
        }
        lede="Your profile graphic, your display name, and the market you call local."
        action={
          <Link href="/account/history" className="ghost-button">
            Buy &amp; sell history →
          </Link>
        }
      />

      <div className="account-meta">
        <span>
          Member since {row.createdAt.toLocaleDateString('en-CA', { year: 'numeric', month: 'long' })}
        </span>
        <span className={`status-chip status-${row.role}`}>{row.role}</span>
      </div>

      <AccountForm
        initial={{
          name: row.name,
          email: row.email,
          avatarKind: row.avatarKind,
          avatarSeed: row.avatarSeed,
          marketId: row.marketId,
        }}
        markets={markets.map((m) => ({ id: m.id, name: m.name, region: m.region, active: m.active }))}
      />

      {row.role === 'admin' && (
        <div className="notice notice-info">
          <strong>You are an admin.</strong>
          <span>
            The <Link href="/admin">admin dashboard</Link> has members, invites, moderation,
            feature flags and the audit log.
          </span>
        </div>
      )}
    </main>
  )
}
