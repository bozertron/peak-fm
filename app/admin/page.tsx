import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { USER_ROLES } from '@/lib/db/schema'
import { AccountGraphic } from '@/components/account-graphic'
import { money } from '@/components/surface'
import {
  getDashboardStats,
  getListingBreakdown,
  getMembers,
  getFlags,
  getInvites,
  getOpenReports,
  getRecentFeedback,
  getAuditLog,
  getMarkets,
} from '@/lib/queries/admin'
import {
  FlagToggle,
  MarketToggle,
  RoleSelect,
  InviteForm,
  RevokeInvite,
  ResolveReport,
} from './admin-controls'

/**
 * The beta operations dashboard.
 *
 * This route sits outside the (app) group deliberately: it has its own chrome
 * and must not carry the member navigation.
 *
 * The role check here is the same one that has always been written, but until
 * `role` was declared in `lib/auth.ts` and created in the database, nothing
 * ever populated it and this redirect fired for everybody. It works now.
 */
export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  if ((session.user as { role?: string }).role !== 'admin') redirect('/')

  const [stats, breakdown, members, flags, invites, reports, feedback, audit, markets] =
    await Promise.all([
      getDashboardStats(),
      getListingBreakdown(),
      getMembers(),
      getFlags(),
      getInvites(),
      getOpenReports(),
      getRecentFeedback(),
      getAuditLog(),
      getMarkets(),
    ])

  return (
    <main className="admin-page">
      <header className="admin-header">
        <Link className="wordmark" href="/">
          peak
        </Link>
        <span>Admin</span>
        <Link href="/" className="admin-link">
          Back to app
        </Link>
      </header>

      <div className="admin-content admin-wide">
        <p className="eyebrow-text">BETA OPERATIONS</p>
        <h1>Everything, as it actually is.</h1>
        <p className="auth-copy">
          Every number here is a live count. Nothing on this page is cached or estimated.
        </p>

        <section aria-label="Key numbers">
          <div className="admin-grid admin-grid-6">
            <Stat value={stats.members} label="members" sub={`${stats.admins} admin`} />
            <Stat value={stats.activeListings} label="live listings" sub={`${stats.listings} total`} />
            <Stat value={stats.paidOrders} label="paid orders" sub={money(stats.grossCents)} />
            <Stat value={stats.openFinds} label="open finds" sub={`${stats.finds} total`} />
            <Stat value={stats.threads} label="threads" sub={`${stats.messages} messages`} />
            <Stat value={stats.openReports} label="open reports" sub={`${stats.feedbackNew} new feedback`} />
          </div>
        </section>

        <AdminSection title="Markets" hint="A market must be open before anything in it is visible.">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Market</th>
                <th scope="col">Region</th>
                <th scope="col">Radius</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => (
                <tr key={m.id}>
                  <th scope="row">{m.name}</th>
                  <td>{m.region}</td>
                  <td>{m.radiusKm} km</td>
                  <td>
                    <MarketToggle marketId={m.id} active={m.active} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminSection>

        <AdminSection
          title="Feature flags"
          hint="Kill switches. A surface that is not finished ships off, and can be opened without a deploy."
        >
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Key</th>
                <th scope="col">What it controls</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((flag) => (
                <tr key={flag.key}>
                  <th scope="row">
                    <code>{flag.key}</code>
                  </th>
                  <td>{flag.description}</td>
                  <td>
                    <FlagToggle flagKey={flag.key} enabled={flag.enabled} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminSection>

        <AdminSection title="Beta invites" hint="Codes avoid I, O, 0 and 1 — they get read aloud and typed by hand.">
          <InviteForm />
          {invites.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">For</th>
                  <th scope="col">Uses</th>
                  <th scope="col">State</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id}>
                    <th scope="row">
                      <code>{invite.code}</code>
                    </th>
                    <td>{invite.email ?? invite.note ?? '—'}</td>
                    <td>
                      {invite.redemptionCount} / {invite.maxRedemptions}
                    </td>
                    <td>
                      <span
                        className={`status-chip status-${
                          invite.revokedAt ? 'withdrawn' : invite.redeemedAt ? 'completed' : 'open'
                        }`}
                      >
                        {invite.revokedAt ? 'revoked' : invite.redeemedAt ? 'redeemed' : 'open'}
                      </span>
                    </td>
                    <td>
                      {!invite.revokedAt && !invite.redeemedAt && <RevokeInvite inviteId={invite.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted-note">No invites issued yet.</p>
          )}
        </AdminSection>

        <AdminSection title="Members" hint="The last admin cannot be demoted — that would lock everyone out.">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Email</th>
                <th scope="col">Market</th>
                <th scope="col">Joined</th>
                <th scope="col">Role</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <th scope="row">
                    <span className="owner-inline">
                      <AccountGraphic name={m.name} kind={m.avatarKind} seed={m.avatarSeed} size={22} />
                      {m.name}
                    </span>
                  </th>
                  <td>{m.email}</td>
                  <td>{m.marketName ?? '—'}</td>
                  <td>{m.createdAt.toLocaleDateString('en-CA')}</td>
                  <td>
                    <RoleSelect userId={m.id} role={m.role} roles={USER_ROLES} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminSection>

        <AdminSection title="Supply by surface" hint="Where listings actually are, by kind and status.">
          {breakdown.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Kind</th>
                  <th scope="col">Status</th>
                  <th scope="col">Count</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((row) => (
                  <tr key={`${row.kind}-${row.status}`}>
                    <th scope="row">{row.kind}</th>
                    <td>
                      <span className={`status-chip status-${row.status}`}>{row.status}</span>
                    </td>
                    <td>{row.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted-note">No listings exist yet.</p>
          )}
        </AdminSection>

        <AdminSection title="Moderation queue" hint="Open reports only. Resolving one writes to the audit log.">
          {reports.length > 0 ? (
            <div className="report-list">
              {reports.map((report) => (
                <article className="report-row" key={report.id}>
                  <div>
                    <strong>
                      {report.entityType} · {report.reason}
                    </strong>
                    {report.detail && <p>{report.detail}</p>}
                    <span className="find-meta">
                      {report.entityId} · {report.createdAt.toLocaleString('en-CA')}
                    </span>
                  </div>
                  <ResolveReport reportId={report.id} />
                </article>
              ))}
            </div>
          ) : (
            <p className="muted-note">Nothing in the moderation queue.</p>
          )}
        </AdminSection>

        <AdminSection title="Beta feedback" hint="Raised in-app by testers. Distinct from reports about other members.">
          {feedback.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Surface</th>
                  <th scope="col">Kind</th>
                  <th scope="col">From</th>
                  <th scope="col">What they said</th>
                </tr>
              </thead>
              <tbody>
                {feedback.map((f) => (
                  <tr key={f.id}>
                    <th scope="row">{f.surface}</th>
                    <td>
                      <span className={`status-chip status-${f.kind}`}>{f.kind}</span>
                    </td>
                    <td>{f.userName ?? 'anonymous'}</td>
                    <td>{f.body}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted-note">No feedback submitted yet.</p>
          )}
        </AdminSection>

        <AdminSection title="Audit log" hint="Append-only. Every privileged action leaves a trace.">
          {audit.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">Action</th>
                  <th scope="col">Entity</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((entry) => (
                  <tr key={entry.id}>
                    <th scope="row">{entry.createdAt.toLocaleString('en-CA')}</th>
                    <td>{entry.actorEmail ?? entry.actorId ?? 'system'}</td>
                    <td>
                      <code>{entry.action}</code>
                    </td>
                    <td>
                      {entry.entityType}
                      {entry.entityId ? ` · ${entry.entityId}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted-note">No admin actions recorded yet.</p>
          )}
        </AdminSection>
      </div>
    </main>
  )
}

function Stat({ value, label, sub }: { value: number; label: string; sub?: string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
      {sub && <small className="stat-sub">{sub}</small>}
    </div>
  )
}

function AdminSection({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <section className="admin-section" aria-label={title}>
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <p>{hint}</p>
        </div>
      </div>
      {children}
    </section>
  )
}
