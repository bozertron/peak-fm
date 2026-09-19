import Link from 'next/link'
import { SURFACES } from '@/lib/surfaces'

/**
 * Global 404.
 *
 * This file must live at the app root: a `not-found.tsx` inside the `(app)`
 * route group only catches `notFound()` calls raised within that group, not
 * URLs that match no route at all. Verified — the group version returned the
 * framework's default page for `/sell/new`.
 *
 * It therefore carries its own chrome rather than the app header, the same way
 * `/admin` and the auth pages do, and links into the surfaces by hand.
 *
 * Several call-to-action links in the surfaces point at routes whose tickets
 * have not run yet. `pnpm check:links` enumerates them, each with its owning
 * ticket, and this page is where they land in the meantime.
 */
export default function NotFound() {
  return (
    <main className="page-section notfound-page">
      <div className="empty-state">
        <Link href="/" className="wordmark notfound-brand">
          peak
        </Link>
        <p className="eyebrow-text">404</p>
        <h3>That page is not here</h3>
        <p>
          Either the link is wrong, or it points at something still being built. Everything that
          does exist is one tap away.
        </p>
        <div className="empty-actions">
          {SURFACES.map((surface) => (
            <Link key={surface.href} href={surface.href} className="ghost-button">
              {surface.label}
            </Link>
          ))}
        </div>
        <div className="empty-actions">
          <Link href="/" className="primary-button">
            Back to the start
          </Link>
        </div>
      </div>
    </main>
  )
}
