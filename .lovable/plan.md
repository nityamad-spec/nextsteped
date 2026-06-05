## Root cause

`useStudentStatus` only sets `hasProfile = true` when `profile.role === "student"`. So any signed-in **teacher** (or admin) that hits a `/student*` route is treated as "no profile" and `StudentRedirect` sends them to `/student/onboarding`. There is no role-mismatch guard.

A teacher can reach `/student` in three different ways today, and all three are bugged:

1. **`AuthRedirect`** (`src/App.tsx:228-256`) — when an already-authenticated user visits `/auth`. If the `profiles` row hasn't propagated yet (fresh JWT race) or RLS transiently denies the read, the query returns `null` and the code falls back to `r = profileRole || "student"` → `Navigate("/student")` → for a teacher, that becomes `/student/onboarding`.
2. **`Auth.tsx` login handler** (`src/pages/Auth.tsx:101-146`) — after a teacher signs in, it fetches `profiles`. If the row comes back `null` (same race), `userRole` falls back to `user.user_metadata?.role || role`. Legacy users whose `user_metadata.role` is `"student"` get navigated to `/student`. The mismatch guard `profile && profile.role !== role` is skipped because `profile` is null.
3. **Direct nav / refresh on `/student`** by an authenticated teacher — `StudentRedirect` has no role check at all, so they're unconditionally pushed to `/student/onboarding`.

The session replay matches this: the page loads at `/student/onboarding`, and ~1s later the "teacher" badge appears once the profile finally resolves — i.e. the role context arrives *after* the redirect.

## Decision (defaulting since you skipped)

Silent role-based redirect, no sign-out, no toast. A signed-in teacher landing on a student route goes to `/teacher`; a signed-in admin goes to `/admin/dashboard`. Matches the existing Landing-page behaviour and is the least disruptive for the common "I clicked the wrong button / refreshed the wrong tab" case.

## Fix plan (frontend only — no backend or schema changes)

### 1. `StudentRedirect` — add role-mismatch guard (primary fix)
File: `src/App.tsx` (lines ~149-226)

- Fetch `profile.role` once at the top of the component (alongside `useStudentStatus`, or extend the hook to expose `role`).
- Before any of the existing redirects:
  - `role === "teacher"` → `<Navigate to="/teacher" replace />`
  - `role === "admin"` → `<Navigate to="/admin/dashboard" replace />`
- Only when `role === "student"` *or* no profile row exists at all do we keep the current logic (`/student/onboarding` → diagnostic → home).
- Keeps the self-heal block for pending invited students (their profile genuinely doesn't exist yet, so the `student`/no-profile branch still runs).

Simplest implementation: extend `useStudentStatus` to also return `role: string | null` (it already selects `role`), then branch in `StudentRedirect`.

### 2. `AuthRedirect` — remove the "default to student" fallback
File: `src/App.tsx:228-256`

- If `profileRole` is `null` after the query, do **not** assume student. Use this resolution order:
  1. `profile.role` if present,
  2. else `user.user_metadata?.role` if present,
  3. else fall through to a Loading… state (and let `StudentRedirect`/`TeacherRedirect`'s own checks take over once the user navigates) — or render the `<Auth />` form so the user can explicitly pick a role.
- Concretely: replace `const r = profileRole || "student";` with an explicit check; if neither source yields a role, render `<Auth />` (signed-in but unclassified user gets to choose) instead of guessing.

### 3. `Auth.tsx` teacher-login path — tighten the mismatch guard
File: `src/pages/Auth.tsx:101-146`

- When `role !== "student"` and the profile fetch returns `null`, retry the `profiles` select **once** after a 300 ms delay (covers the JWT-propagation race). If still null:
  - Trust the URL `role` param the user signed in under (it was `teacher` here), and navigate accordingly. Do **not** consult `user_metadata.role` as a tiebreaker — that's the field that's been routing legacy users to `/student`.
- Existing mismatch behaviour (`profile.role !== role` → toast + sign-out) is unchanged.

### 4. Sanity-check related paths (no changes expected)
- `Landing.tsx` `goReturningProfessor` / `goReturningStudent` already gate on `profile.role` correctly — leave as is.
- `StudentOnboarding.tsx` already self-redirects `student`-role users to `/student`, but does nothing for teachers who land there. Fix #1 prevents teachers from being sent here in the first place, so no edit needed.

## Files to edit

- `src/hooks/useStudentStatus.ts` — expose `role: string | null` from the profile select.
- `src/App.tsx` — `StudentRedirect` (add teacher/admin guard) and `AuthRedirect` (drop default-to-student fallback).
- `src/pages/Auth.tsx` — small retry + remove `user_metadata.role` fallback in the non-student login branch.

## Out of scope

- No edge-function or RLS changes. The `"Invalid login credentials"` error in your earlier paste was the student-signin function rejecting a teacher email — unrelated to this redirect bug and already gated by the role param on the form.
- No changes to `TeacherRedirect`, layouts, or onboarding pages.

## How I'll verify

1. Sign in as teacher from `/auth?role=teacher` → lands on `/teacher/courses/dashboard` (or `/teacher/setup` / `/teacher/courses/new` per existing TeacherRedirect logic). Never `/student/*`.
2. While signed in as teacher, manually visit `/student` and `/student/onboarding` → both bounce to `/teacher`.
3. While signed in as teacher, manually visit `/auth` → `AuthRedirect` sends to `/teacher`, never `/student`.
4. Sign in as student → unchanged: `/student/home` (or onboarding/diagnostic when appropriate).
5. Admin login still routes to `/admin/dashboard`.
