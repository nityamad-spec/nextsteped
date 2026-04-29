## Problem

After a new student clicks the verification link in their email and sets a password on `/reset-password`, they should land in the diagnostic / student dashboard. Instead they get stuck on a "Loading…" screen, the `profiles` row is never created, and the `pending_signups` row stays unconsumed.

## Root cause

`complete-student-signup` is never called for the just-verified student. Tracing it:

1. The Supabase invite link redirects to `/reset-password#access_token=…&type=invite&…`.
2. `ResetPassword.tsx` only treats `type === "recovery"` from the hash as a special case — `type=invite` is ignored.
3. The fallback path queries `public.pending_signups` from the authenticated student to decide if this is an invite. But the only RLS policy on `pending_signups` is "Admins can manage pending_signups" (`is_admin(auth.uid())`). The student's `select` returns no rows, so the page falls back to `mode = "recovery"`.
4. `handleSubmit` updates the password successfully, but because `mode` is `"recovery"` it skips calling `complete-student-signup` and navigates to `/auth`.
5. Result: auth user exists with a password, no `profiles` row, no `enrollments` row, `pending_signups.consumed_at` is still null. Any later visit to a student route shows the "Loading…" gate (or onboarding) and never recovers.

The currently affected user `akashsinha.ai@gmail.com` matches this exactly:
- `pending_signups`: 1 row, `consumed_at IS NULL`, `course_id` set.
- `profiles`: 0 rows.
- Edge logs: `complete-student-signup` has never been invoked.

## Fix

### 1. Detect `type=invite` from the URL hash in `ResetPassword.tsx`

Treat both `recovery` and `invite` hash types as authoritative. When `type=invite` is present, set `mode = "invite"` immediately so we don't depend on a follow-up DB query.

### 2. Add a safe RLS policy so a signed-in student can read their own pending row

New policy on `public.pending_signups`:

```sql
create policy "Users can read own pending signup by email"
on public.pending_signups
for select
to authenticated
using (lower(email) = lower((auth.jwt() ->> 'email')));
```

This keeps writes admin-only but lets the student / page reliably detect their own invite. Read-only, scoped to their own email.

### 3. Make `handleSubmit` resilient

After `supabase.auth.updateUser({ password })` succeeds, always re-check for a pending row for the current user's email (now permitted by the new policy). If one exists, call `complete-student-signup` regardless of what `mode` ended up as. This protects against any future detection regressions.

### 4. Self-heal stuck students in `StudentRedirect`

`useStudentStatus` already returns `hasProfile = false` for the affected user. In `StudentRedirect` (`src/App.tsx`), before redirecting to `/student/onboarding`, look up `pending_signups` for the signed-in user's email. If a pending row exists, invoke `complete-student-signup` and then re-evaluate. This recovers anyone (including the current account) who got stranded by the original bug, and adds defense-in-depth for any future flow that bypasses `/reset-password`.

If `complete-student-signup` succeeds, navigate to `/student/diagnostic?course=<course_id>`. If it fails, fall back to `/student/onboarding` so the user can manually re-enroll.

### 5. Recover the existing stuck account

The data-only repair for `akashsinha.ai@gmail.com` happens automatically once fix #4 is deployed: their next visit to any `/student/*` route will trigger `complete-student-signup`, which is already idempotent (it upserts the profile + enrollment and marks the pending row consumed). No manual SQL needed.

## Files to edit / create

- `supabase/migrations/<timestamp>_pending_signup_self_read.sql` — new SELECT policy on `pending_signups`.
- `src/pages/ResetPassword.tsx` — recognise `type=invite` in the hash; always re-check pending after password update and call `complete-student-signup` when applicable.
- `src/App.tsx` — in `StudentRedirect`, when `hasProfile === false`, attempt the self-heal via `complete-student-signup` before sending the user to `/student/onboarding`.

## Out of scope

- The "Course Enrollment Code" / publish-banner work from earlier turns is unaffected.
- No changes to `student-pending-signup` or `complete-student-signup` are required — `complete-student-signup` is already idempotent and handles the existing-session case correctly.
