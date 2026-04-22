

## Temporarily skip auth after `/intro/teacher` → go directly to Course Setup

### Goal

When the teacher clicks "Get Started" (or equivalent CTA) on `/intro/teacher`, route them straight into the teacher flow — bypassing `/auth?role=teacher`. Since `AUTH_BYPASS` is already `true` in `src/lib/authBypass.ts` (auto-signs-in as the seeded admin), we can safely skip the auth screen and let `TeacherRedirect` decide whether to land them on `/teacher/onboarding`, `/teacher/setup`, or `/teacher/courses/dashboard`.

### Change

**File:** `src/pages/TeacherIntro.tsx`

- Locate the CTA button currently calling `navigate("/auth?role=teacher")`.
- Replace target with `navigate("/teacher")` (the role gate route).
- `/teacher` is already wired in `App.tsx` to render `<TeacherRedirect />`, which:
  - Checks for an existing course → if none, sends to `/teacher/onboarding`
  - Checks `useTeacherSetupStatus()` → if incomplete, sends to `/teacher/setup`
  - Otherwise sends to `/teacher/courses/dashboard`
- Because `AUTH_BYPASS = true`, `ProtectedRoute` will not redirect to `/auth`, and `AuthContext` auto-signs-in the seeded admin so RLS queries still work.

### Why this is safe and minimal

- No changes to auth logic, `AUTH_BYPASS`, or routing guards.
- No new routes added.
- One-line redirect change in `TeacherIntro.tsx` only.
- Reverting later = change the `navigate(...)` target back to `/auth?role=teacher`.

### Out of scope

- Not touching `StudentIntro.tsx` (request is teacher-only).
- Not modifying `AUTH_BYPASS` flag or `AuthContext`.
- Not removing the `/auth` route — still reachable directly and from Landing's "Admin Login".
- No memory update — this is a temporary dev convenience, not a product decision.

