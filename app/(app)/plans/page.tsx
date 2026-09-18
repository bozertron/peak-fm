import Link from 'next/link'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getCurrentMarket, isEnabled } from '@/lib/queries/market'
import {
  listMyPlans,
  listProposalsForRecipient,
  listProposalsByProvider,
  listCommunityItems,
} from '@/lib/queries/plans'
import { ClosedNotice, EmptyState, SurfaceHeading, money } from '@/components/surface'

/**
 * Plans — Personal, Business, Community.
 *
 * One shape, three scopes, because the worked example crosses them: a
 * homeowner's Personal plan raises a Find; a plumber answers it with a
 * Business plan carrying price, timeline and guarantees. Community is the
 * local events and government announcements board.
 */
export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const raw = Array.isArray(params.scope) ? params.scope[0] : params.scope
  const scope = (raw === 'business' || raw === 'community' ? raw : 'personal') as
    | 'personal'
    | 'business'
    | 'community'

  const [session, market, open] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    getCurrentMarket(),
    isEnabled('surface.plans'),
  ])

  if (!market) {
    return (
      <main className="page-section">
        <SurfaceHeading eyebrow="PLANS" title="No market is open" lede="Plans needs an active market." />
        <EmptyState title="No active market" body="Run pnpm db:seed to open Big White." />
      </main>
    )
  }

  const userId = session?.user?.id
  const [myPlans, incoming, sent, community] = await Promise.all([
    userId && scope !== 'community' ? listMyPlans(userId, scope) : Promise.resolve([]),
    userId && scope === 'personal' ? listProposalsForRecipient(userId) : Promise.resolve([]),
    userId && scope === 'business' ? listProposalsByProvider(userId) : Promise.resolve([]),
    scope === 'community' ? listCommunityItems(market.id) : Promise.resolve([]),
  ])

  const TABS = [
    { key: 'personal', label: 'Personal', hint: 'Your own projects — a bathroom reno, a deck, a trip.' },
    { key: 'business', label: 'Business', hint: 'Service offers you send to people who need them.' },
    { key: 'community', label: 'Community', hint: 'Local events and announcements asking for feedback.' },
  ] as const

  const active = TABS.find((t) => t.key === scope)!

  return (
    <main className="page-section">
      <SurfaceHeading
        eyebrow={`PLANS · ${market.name.toUpperCase()}`}
        title={
          <>
            Plan it, quote it, <em>decide it together</em>
          </>
        }
        lede={active.hint}
        action={
          scope !== 'community' ? (
            <Link href={`/plans/new?scope=${scope}`} className="primary-button">
              New {scope} plan
            </Link>
          ) : undefined
        }
      />

      {!open && <ClosedNotice label="Plans" />}

      <nav className="scope-tabs" aria-label="Plan scope">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/plans?scope=${tab.key}`}
            className={`filter-tab ${scope === tab.key ? 'selected' : ''}`}
            aria-current={scope === tab.key ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {scope === 'community' ? (
        community.length > 0 ? (
          <div className="community-list">
            {community.map((item) => (
              <article className="community-row" key={item.id}>
                <div>
                  <span className={`status-chip status-${item.kind}`}>{item.kind}</span>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                  <span className="find-meta">
                    {item.sourceName ?? 'Community'}
                    {item.locationName && ` · ${item.locationName}`}
                    {item.startsAt && ` · ${item.startsAt.toLocaleDateString('en-CA')}`}
                  </span>
                </div>
                {item.feedbackOpen && (
                  <Link href={`/plans/community/${item.id}`} className="text-link">
                    Give feedback →
                  </Link>
                )}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title={`Nothing posted for ${market.name} yet`}
            body="Local events and government announcements looking for citizen feedback will appear here."
          />
        )
      ) : !session?.user ? (
        <EmptyState
          title="Sign in to see your plans"
          body="Plans are tied to your account."
          action={
            <Link href="/sign-in" className="primary-button">
              Sign in
            </Link>
          }
        />
      ) : (
        <>
          {incoming.length > 0 && (
            <section aria-label="Proposals you have received">
              <div className="section-heading">
                <div>
                  <h2>Offers on your plans</h2>
                  <p>Sent by people who saw what you were trying to find.</p>
                </div>
              </div>
              <div className="find-list">
                {incoming.map((p) => (
                  <article className="find-row" key={p.id}>
                    <div className="find-main">
                      <strong>{p.planTitle}</strong>
                      <span className="find-meta">
                        {p.providerName} · {money(p.priceCents, p.currency)}
                        {p.guaranteeText && ` · ${p.guaranteeText}`}
                      </span>
                    </div>
                    <div className="find-actions">
                      <span className={`status-chip status-${p.status}`}>{p.status}</span>
                      <Link href={`/plans/proposal/${p.id}`} className="text-link">
                        Review →
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {sent.length > 0 && (
            <section aria-label="Proposals you have sent">
              <div className="section-heading">
                <div>
                  <h2>Proposals you have sent</h2>
                  <p>Plan, price, timeline and guarantee.</p>
                </div>
              </div>
              <div className="find-list">
                {sent.map((p) => (
                  <article className="find-row" key={p.id}>
                    <div className="find-main">
                      <strong>{p.planTitle}</strong>
                      <span className="find-meta">{money(p.priceCents, p.currency)}</span>
                    </div>
                    <div className="find-actions">
                      <span className={`status-chip status-${p.status}`}>{p.status}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section aria-label="Your plans">
            <div className="section-heading">
              <div>
                <h2>Your {scope} plans</h2>
                <p>
                  {scope === 'business'
                    ? 'Reusable offers you can send in answer to a Find.'
                    : 'Private until you choose to share them.'}
                </p>
              </div>
            </div>
            {myPlans.length > 0 ? (
              <div className="find-list">
                {myPlans.map((p) => (
                  <article className="find-row" key={p.id}>
                    <div className="find-main">
                      <strong>{p.title}</strong>
                      {p.summary && <p>{p.summary}</p>}
                      <span className="find-meta">
                        {p.budgetCents !== null && `budget ${money(p.budgetCents, p.currency)} · `}
                        {p.visibility}
                      </span>
                    </div>
                    <div className="find-actions">
                      <span className={`status-chip status-${p.status}`}>{p.status}</span>
                      <Link href={`/plans/${p.id}`} className="text-link">
                        Open →
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title={`No ${scope} plans yet`}
                body={
                  scope === 'business'
                    ? 'Build an offer once, then send it whenever a matching Find comes up.'
                    : 'Start with the project you are actually thinking about. You can raise a Find from inside it.'
                }
                action={
                  <Link href={`/plans/new?scope=${scope}`} className="primary-button">
                    New {scope} plan
                  </Link>
                }
              />
            )}
          </section>
        </>
      )}
    </main>
  )
}
