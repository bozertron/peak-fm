/**
 * Schema barrel.
 *
 * One file per bounded area so that parallel agents own disjoint files — the
 * anti-clobber rule in `tickets/doctrine/AREA-107-agent-orchestration-protocol.md`
 * could not be applied while the whole app lived in one module. THIS file is
 * shared: it belongs to the sequential registrar, not to a builder agent.
 */
export * from './_shared'
export * from './auth'
export * from './market'
export * from './listing'
export * from './commerce'
export * from './rental'
export * from './trade'
export * from './find'
export * from './plan'
export * from './comms'
export * from './admin'

import * as auth from './auth'
import * as market from './market'
import * as listing from './listing'
import * as commerce from './commerce'
import * as rental from './rental'
import * as trade from './trade'
import * as find from './find'
import * as plan from './plan'
import * as comms from './comms'
import * as admin from './admin'

/** Passed to `drizzle()` in `lib/db/index.ts` for the relational query API. */
export const schema = {
  ...auth,
  ...market,
  ...listing,
  ...commerce,
  ...rental,
  ...trade,
  ...find,
  ...plan,
  ...comms,
  ...admin,
}
