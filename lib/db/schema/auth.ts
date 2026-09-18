/**
 * Better Auth core tables.
 *
 * These four tables are owned by Better Auth's own migration planner
 * (`pnpm db:migrate`, via `getMigrations`). Drizzle mirrors them so the rest of
 * the schema can declare real foreign keys against `user.id`.
 *
 * `role` is the one addition, and it is NOT invented here: `app/admin/page.tsx`
 * already reads `session.user.role`. Until now nothing ever wrote that column,
 * so the admin route redirected every visitor including real admins. Declaring
 * it here and registering it as a Better Auth additional field in `lib/auth.ts`
 * is what makes that existing check function.
 */
import { pgTable, text, timestamp, boolean, index } from 'drizzle-orm/pg-core'
import { USER_ROLES, type UserRole } from './_shared'

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('emailVerified').notNull().default(false),
    image: text('image'),

    /** 'member' | 'moderator' | 'admin' — see USER_ROLES. */
    role: text('role').$type<UserRole>().notNull().default(USER_ROLES[0]),

    /**
     * The user-applied interactive graphic in the header Account control.
     * `avatarKind` selects the renderer; `avatarSeed` is its deterministic
     * input so the same user draws identically on every device.
     */
    avatarKind: text('avatarKind').notNull().default('initials'),
    avatarSeed: text('avatarSeed'),

    /** Home market. Drives default filtering across every surface. */
    marketId: text('marketId'),

    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (t) => [index('user_market_idx').on(t.marketId), index('user_role_idx').on(t.role)],
)

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

export type User = typeof user.$inferSelect
