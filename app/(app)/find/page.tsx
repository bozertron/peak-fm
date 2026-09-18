import Link from 'next/link'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getCurrentMarket, isEnabled } from '@/lib/queries/market'
import { listMyFinds, listOpenFinds } from '@/lib/queries/find'
import { ClosedNotice, EmptyState, SurfaceHeading, money } from '@/components/surface'

/**
 * Find — demand, recorded permanently.
 *
 * A Find is raised by the [Find] button wherever one appears. It captures the
 * metadata of where it came from, logs it as a permanent opportunity until
 * satisfied, and acts as matchmaker between the people looking and the people
 * with the means to supply it.
 *
 * Anything that starts as a Find ends as a Find. There is no promotion path to
 * Buy, and there is no column in the schema that would allow one — that would
 * be redundant and would clutter the focused buying experience.
 */
export default async function FindPage() {
  const [session, market, open] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    getCurrentMarket(),
    isEnabled('surface.find'),
  ])

  if (!market) {
    return (
      <main className="page-section">
        <SurfaceHeading eyebrow="FIND" title="No market is open" lede="Find needs an active market." />
        <EmptyState title="No active market" body="Run pnpm db:seed to open Big White." />
      </main>
    )
  }

  const [mine, board] = await Promise.all([
    session?.user ? listMyFinds(session.user.id) : Promise.resolve([]),
    listOpenFinds(market.id, session?.user?.id),
  ])

  return (
    <main className="page-section">
      <SurfaceHeading
        eyebrow={`FIND · ${market.name.toUpperCase()}`}
        title={
          <>
            Say it once. <em>It stays said.</em>
          </>
        }
        lede="A Find is a standing request. It keeps looking until you say it is handled — and it never turns into a listing."
        action={
          <Link href="/find/new" className="primary-button">
            Raise a Find
          </Link>
        }
      />

      {!open && <ClosedNotice label="Find" />}

      {session?.user && (
        <section aria-label="Your Finds">
          <div className="section-heading">
            <div>
              <h2>What you are looking for</h2>
              <p>Open until you mark it satisfied. Nothing expires on you quietly.</p>
            </div>
          </div>
          {mine.length > 0 ? (
            <div className="find-list">
              {mine.map((find) => (
                <article className="find-row" key={find.id}>
                  <div className="find-main">
                    <strong>{find.title}</strong>
                    {find.details && <p>{find.details}</p>}
                    <span className="find-meta">
                      raised from {find.originSurface}
                      {find.categoryName && ` · ${find.categoryName}`}
                      {` · ${find.matchCount} match${find.matchCount === 1 ? '' : 'es'}`}
                    </span>
                  </div>
                  <div className="find-actions">
                    <span className={`status-chip status-${find.status}`}>{find.status}</span>
                    <Link href={`/find/${find.id}`} className="text-link">
                      Open →
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="You have not raised a Find yet"
              body="Look for the Find button while you are browsing. It remembers what you were looking at when you needed something."
              action={
                <Link href="/find/new" className="primary-button">
                  Raise a Find
                </Link>
              }
            />
          )}
        </section>
      )}

      <section aria-label="What the market wants">
        <div className="section-heading">
          <div>
            <h2>What {market.name} is looking for</h2>
            <p>If you can supply one of these, answer it directly or send a plan.</p>
          </div>
        </div>
        {board.length > 0 ? (
          <div className="find-list">
            {board.map((find) => (
              <article className="find-row" key={find.id}>
                <div className="find-main">
                  <strong>{find.title}</strong>
                  {find.details && <p>{find.details}</p>}
                  <span className="find-meta">
                    {find.seekerName}
                    {find.categoryName && ` · ${find.categoryName}`}
                    {find.budgetMaxCents !== null &&
                      ` · budget up to ${money(find.budgetMaxCents, find.currency)}`}
                  </span>
                </div>
                <div className="find-actions">
                  <Link href={`/find/${find.id}`} className="text-link">
                    I can help →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title={`Nobody in ${market.name} is looking for anything yet`}
            body="When someone raises a Find, it appears here for anyone who can supply it."
          />
        )}
      </section>
    </main>
  )
}
