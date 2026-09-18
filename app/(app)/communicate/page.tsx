import Link from 'next/link'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getCurrentMarket, isEnabled } from '@/lib/queries/market'
import { listThreads } from '@/lib/queries/communicate'
import { listBulletin } from '@/lib/queries/bulletin'
import {
  ClosedNotice,
  EmptyState,
  SignedOutNotice,
  SurfaceHeading,
} from '@/components/surface'

/** Subject labels: a thread is always about the thing it came from. */
const SUBJECT_LABEL: Record<string, string> = {
  direct: 'Direct',
  listing: 'Listing',
  find: 'Find',
  plan: 'Plan',
  order: 'Order',
  community: 'Community',
}

/**
 * Communicate — the hub for all conversations, on all topics.
 *
 * Buying, selling, renting, trading, finding and planning all end as
 * conversations, so they land here together, attached to the thing they are
 * about. Archive and delete are per-participant: one side clearing their inbox
 * must never remove the other side's copy.
 */
export default async function CommunicatePage() {
  const [session, market, open] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    getCurrentMarket(),
    isEnabled('surface.communicate'),
  ])

  const bulletin = market ? await listBulletin(market.id) : []

  if (!session?.user) {
    return (
      <main className="page-section">
        <SurfaceHeading
          eyebrow="COMMUNICATE"
          title={
            <>
              Every conversation, <em>one place</em>
            </>
          }
          lede="Attached to the thing it is about. Easy to archive, easy to delete, easy to act on."
        />
        <SignedOutNotice what="Your conversations" />
      </main>
    )
  }

  const threads = await listThreads(session.user.id)
  const unread = threads.filter(
    (t) => t.lastMessageAt && (!t.lastReadAt || t.lastReadAt < t.lastMessageAt),
  )

  return (
    <main className="page-section">
      <SurfaceHeading
        eyebrow={`COMMUNICATE · ${market?.name.toUpperCase() ?? 'NO MARKET'}`}
        title={
          <>
            Every conversation, <em>one place</em>
          </>
        }
        lede="Attached to the thing it is about. Easy to archive, easy to delete, easy to act on."
        action={
          <Link href="/communicate/new" className="primary-button">
            Start a conversation
          </Link>
        }
      />

      {!open && <ClosedNotice label="Communicate" />}

      <div className="comms-layout">
        <section className="comms-threads" aria-label="Your conversations">
          <div className="section-heading">
            <div>
              <h2>Inbox</h2>
              <p>
                {threads.length} conversation{threads.length === 1 ? '' : 's'}
                {unread.length > 0 && ` · ${unread.length} unread`}
              </p>
            </div>
          </div>

          {threads.length > 0 ? (
            <ul className="thread-list">
              {threads.map((t) => {
                const isUnread =
                  t.lastMessageAt && (!t.lastReadAt || t.lastReadAt < t.lastMessageAt)
                return (
                  <li key={t.id} className={isUnread ? 'thread-row unread' : 'thread-row'}>
                    <Link href={`/communicate/${t.id}`}>
                      <span className="thread-subject">
                        {SUBJECT_LABEL[t.subjectType] ?? t.subjectType}
                      </span>
                      <strong>{t.title ?? 'Conversation'}</strong>
                      {t.lastMessagePreview && <p>{t.lastMessagePreview}</p>}
                      <span className="thread-meta">
                        {t.messageCount} message{t.messageCount === 1 ? '' : 's'}
                        {t.lastMessageAt && ` · ${t.lastMessageAt.toLocaleDateString('en-CA')}`}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState
              title="No conversations yet"
              body="Ask a seller a question, answer a Find, or reply to something on the bulletin — they all land here."
              action={
                <Link href="/buy" className="primary-button">
                  Browse what is for sale
                </Link>
              }
            />
          )}
        </section>

        <aside className="comms-bulletin" aria-label="Local bulletin">
          <div className="section-heading">
            <div>
              <h2>Bulletin</h2>
              <p>{market ? `Notes around ${market.name}` : 'No market'}</p>
            </div>
          </div>
          {bulletin.length > 0 ? (
            <div className="bulletin-list">
              {bulletin.map((post) => (
                <article className="bulletin-post" key={post.id}>
                  <div className="post-meta">
                    <span>{post.authorName}</span>
                    <time dateTime={post.createdAt.toISOString()}>
                      {post.createdAt.toLocaleDateString('en-CA')}
                    </time>
                  </div>
                  <h3>{post.title}</h3>
                  <p>{post.body}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted-note">
              Nothing on the bulletin yet. It fills up with local notes, not listings.
            </p>
          )}
          <Link href="/communicate/bulletin/new" className="ghost-button">
            Post to the bulletin
          </Link>
        </aside>
      </div>
    </main>
  )
}
