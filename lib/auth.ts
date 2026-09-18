import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
  emailAndPassword: { enabled: true, autoSignIn: true },

  /**
   * Columns Peak adds to Better Auth's `user` table.
   *
   * `app/admin/page.tsx` has always read `session.user.role`, but nothing ever
   * declared or wrote that column, so the admin route redirected everyone —
   * including real admins. Registering the fields here is what creates them in
   * the migration AND surfaces them on the session object.
   *
   * `input: false` means a field cannot be set by the client during sign-up.
   * Nobody self-assigns `role: 'admin'` through the registration form.
   */
  user: {
    additionalFields: {
      role: { type: 'string', required: false, defaultValue: 'member', input: false },
      avatarKind: { type: 'string', required: false, defaultValue: 'initials', input: true },
      avatarSeed: { type: 'string', required: false, input: true },
      marketId: { type: 'string', required: false, input: true },
    },
  },

  trustedOrigins: [
    /**
     * The configured public origin is always trusted.
     *
     * Without this, a deployment that is not on Vercel — a container host, a
     * custom domain, a preview URL — has NO trusted origin in production and
     * every auth call fails with INVALID_ORIGIN. Reproduced directly: signing
     * in against an origin absent from this list returns 403.
     */
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
    ...(process.env.NODE_ENV === 'development'
      ? [
          'http://localhost:3000',
          ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
          ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
          ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
          ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : []),
        ]
      : []),
    ...(process.env.NODE_ENV === 'production'
      ? [
          ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
          ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
            : []),
        ]
      : []),
  ],
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  ...(process.env.NODE_ENV === 'development'
    ? {
        advanced: {
          defaultCookieAttributes: { sameSite: 'none' as const, secure: true },
        },
      }
    : {}),
})
