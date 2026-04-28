## Goal

Remove the auto admin sign-in on `/` so the landing page always loads signed-out. Normal Supabase session persistence (across reloads within the same browser session, until sign-out) remains untouched.

## Root Cause

`src/lib/authBypass.ts` exports `AUTH_BYPASS = true`. On every load, `AuthContext` sees no session and auto-signs-in the seeded admin (`admin@nextstep.ai`). It also makes `ProtectedRoute` a no-op.

## Change

**1. `src/lib/authBypass.ts`** — flip the flag:
```ts
export const AUTH_BYPASS = false;
```

That single change:
- Stops the auto admin sign-in in `AuthContext` (the `if (!session && AUTH_BYPASS)` branch is skipped).
- Re-enables real gating in `ProtectedRoute` (`src/App.tsx`) so protected routes require a session.
- Leaves Supabase's default session persistence intact — once a user signs in, their session is stored in localStorage and restored automatically on reload via `supabase.auth.getSession()` and the `onAuthStateChange` listener already wired up in `AuthContext`. They stay signed in until they explicitly sign out or the refresh token expires.
- Landing page bypass-redirect logic in `src/pages/Landing.tsx` becomes inert (guarded by `AUTH_BYPASS &&`).

## Out of Scope

- No changes to `AuthContext` logic, `ProtectedRoute`, or sign-in/sign-up flows.
- The `BYPASS_ADMIN_EMAIL/PASSWORD` constants and the bypass code paths stay in place (dormant) so the flag can be flipped back on later if needed for debugging.

## Verification

- Load `/` while signed out → Landing page renders, no auto-redirect to admin dashboard.
- Sign in as any user → redirected per role, refresh page → still signed in (session persisted).
- Click sign out → returned to `/` signed out, refresh → stays signed out.