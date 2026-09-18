# [PEAK-204] Auth: roles that work, origins that work

- Priority: P0 · Area: Foundation · Status: **DONE — verified**
- Dependencies: none
- Risk: security / operations

## Intent
Two defects found while scaffolding. Both were live; neither was known.

## Defect 1 — the admin role never existed
`app/admin/page.tsx` has always read `session.user.role`. Nothing declared or
wrote that column, so **the admin route redirected everybody, including real
admins**. The check was correct; the data behind it was absent.

**Fix:** declare `role`, `avatarKind`, `avatarSeed`, `marketId` as Better Auth
`user.additionalFields` in `lib/auth.ts`. `role` carries `input: false`, so
nobody self-assigns `admin` through the sign-up form.

**Evidence:** sign-up now returns `"role":"member"`. A member gets `307 → /`; an
admin gets `200`.

## Defect 2 — no trusted origin off Vercel
`trustedOrigins` derived its production entries **only** from `VERCEL_URL` and
`VERCEL_PROJECT_PRODUCTION_URL`. On any other host — a container, a custom
domain — that list is empty and **every auth call returns 403**.

**Evidence:**
```
POST /api/auth/sign-in/email  (untrusted origin)
  {"message":"Invalid origin","code":"INVALID_ORIGIN"}   HTTP 403
POST /api/auth/sign-in/email  (trusted origin)
  {"redirect":false,"token":"...","user":{...}}          HTTP 200
```

**Fix:** always trust `BETTER_AUTH_URL`. It is now required in every
environment, documented in `.env.example` and `docs/PEAK-ARCHITECTURE.md` §4.2.

This defect would have broken the beta on day one on any non-Vercel host, and
would have looked like a mysterious sign-in failure rather than a config error.

## Follow-through
PEAK-250 must assert `BETTER_AUTH_URL` is set and matches the deployed origin.
