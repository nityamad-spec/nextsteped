# Centralized Role-Based Route Guard

## Goal
Stop any signed-in user from landing in a section that doesn't match their role. Today the only role check lives inside `StudentRedirect`, and `/student/onboarding`, `/student/diagnostic`, all `/student/*` layout routes, every `/teacher/*` route, and every `/admin/*` route are unguarded against role mismatch. A teacher who lands on `/student/onboarding` (the exact bug reported earlier) renders the student onboarding form. A student who types `/teacher` or `/admin/dashboard` gets in past `ProtectedRoute`.

## Approach
Add one component, `RoleGuard`, that wraps role-scoped routes and enforces the allowed role(s). Reuse the role resolution we already have (`profiles.role` with `user_metadata.role` as fallback) so we don't add a second source of truth.

### New component: `src/components/RoleGuard.tsx`
- Props: `allow: Array<"student" | "teacher" | "admin">`, `children`.
- Reads `useAuth()`; if no user → `<Navigate to="/auth" replace />` (so it can also stand in for `ProtectedRoute` where convenient — but we will keep `ProtectedRoute` wrapping it to avoid churn).
- Resolves role once per user:
  - `select role from profiles where id = user.id`
  - Falls back to `user.user_metadata?.role` if the row is missing (JWT-propagation race), then `null`.
  - Caches the resolved role in a tiny module-level `Map<userId, role>` so navigating between guarded routes doesn't re-query on every transition.
- While resolving → render the same `Loading…` block used elsewhere.
- If resolved role is in `allow` → render children.
- Otherwise redirect to the user's home:
  - `teacher` → `/teacher`
  - `admin` → `/admin/dashboard`
  - `student` → `/student`
  - unknown/null → `/auth` (forces them to pick a role on the auth screen; matches the `AuthRedirect` fix already in place).

### Wiring in `src/App.tsx`
Wrap each role-scoped route/group with `RoleGuard` *inside* the existing `ProtectedRoute`:

```text
/teacher, /teacher/onboarding, /teacher/courses/new,
  and the TeacherLayout group         →  RoleGuard allow={["teacher"]}
/student, /student/onboarding,
  /student/diagnostic, /student/verify-email,
  and the StudentLayout group         →  RoleGuard allow={["student"]}
/admin and all nested admin routes    →  RoleGuard allow={["admin"]}
```

`/student/onboarding` and `/student/verify-email` are currently *not* wrapped in `ProtectedRoute` (they need to be reachable mid-signup). For those two we wrap in `RoleGuard` only when a user is signed in — if `useAuth().user` is null, `RoleGuard` renders children (lets the unauthenticated onboarding/verify flow work). The `allow` check only fires for authenticated sessions.

Public routes (`/`, `/auth`, `/intro/*`, `/reset-password`) stay untouched.

### What `StudentRedirect` and `TeacherRedirect` keep doing
They keep their *intra-role* logic (onboarding gates, diagnostic gate, first-course redirect). The cross-role bounce currently in `StudentRedirect` becomes redundant once `RoleGuard` wraps `/student`, so we remove those two lines to keep one source of truth.

### Edge cases
- **JWT race after sign-in**: handled by `user_metadata.role` fallback + the cached role from `AuthRedirect`'s lookup (we'll seed the cache from there too).
- **Account with no profile row** (stranded invite): `RoleGuard` on `/student` falls through to `null` role → redirect to `/auth`. The self-heal path in `StudentRedirect` won't run in that case anymore, so we keep `/student/onboarding` reachable for `role === "student"` and let the existing healer there handle stranded students. Stranded teachers/admins shouldn't exist (they go through approve-teacher), but if one appears they'll land on `/auth` rather than student onboarding.
- **Role change mid-session**: the cache is keyed by `user.id` and cleared on sign-out (subscribe to `onAuthStateChange` `SIGNED_OUT`).

## Files touched
- `src/components/RoleGuard.tsx` — new.
- `src/App.tsx` — wrap teacher / student / admin route trees with `RoleGuard`; remove the now-redundant role bounce from `StudentRedirect`.
- No backend, RLS, hook, or schema changes.

## Verification
1. Signed-in **teacher** typing `/student`, `/student/onboarding`, `/student/home`, `/student/chat` → all bounce to `/teacher`.
2. Signed-in **student** typing `/teacher`, `/teacher/courses/dashboard`, `/admin/dashboard` → bounce to `/student`.
3. Signed-in **admin** typing `/student/*` or `/teacher/*` → bounce to `/admin/dashboard`.
4. Unauthenticated user hitting any guarded route → `/auth` (unchanged).
5. New student mid-signup on `/student/onboarding` (not yet authenticated) → form renders (unchanged).
6. Existing teacher login flow still lands on `/teacher/courses/dashboard` on success.
