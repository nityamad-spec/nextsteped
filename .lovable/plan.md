# Plan: Resend Verification Email for Approved Teachers

Add a "Resend email" button on each card in the Admin Dashboard's **Approved** tab that re-sends the invite/password-setup email (the same one sent on initial approval) to that teacher's address.

## Why an edge function

Resending the invite requires `auth.admin.inviteUserByEmail` (or `generateLink`), which needs the **service role key** and must run server-side. We'll mirror the auth pattern used in `approve-teacher` (verify caller is admin, then act with admin client).

## Changes

### 1. New edge function: `supabase/functions/resend-teacher-invite/index.ts`
- CORS + OPTIONS handling.
- Verify caller via `auth.getClaims` and check `profiles.role === 'admin'` (same pattern as `approve-teacher`).
- Body: `{ applicationId: string }`.
- Look up the `teacher_applications` row; ensure `status === 'approved'`.
- Compute `redirectTo = ${origin}/reset-password` from request headers.
- Call `adminClient.auth.admin.inviteUserByEmail(application.email, { data: { name, role: 'teacher' }, redirectTo })` to re-trigger the invite email.
- If that errors because the user already accepted (no longer needs setup), fall back to `auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })` so they can set/reset their password — Supabase sends the recovery email automatically.
- Also re-set `profiles.needs_password_setup = true` for that user when sending an invite-style email (so the reset-password page treats it correctly).
- Return `{ message }` on success.

No `supabase/config.toml` change needed (defaults to `verify_jwt = false`; we validate in code).

### 2. UI: `src/pages/admin/AdminDashboard.tsx` — Approved tab card
- Add a `Button` (variant `outline`, size `sm`) labeled "Resend email" with a `Mail` icon, placed in the card header next to the "Approved" badge (or in `CardContent` footer row).
- Track per-row loading state: `const [resendingId, setResendingId] = useState<string | null>(null)`.
- Handler `handleResend(app)`:
  - `setResendingId(app.id)`
  - `await supabase.functions.invoke('resend-teacher-invite', { body: { applicationId: app.id } })`
  - On success: `toast.success("Verification email resent to " + app.email)`
  - On error: `toast.error(error.message)`
  - `finally` clear `resendingId`.
- Disable the button while `resendingId === app.id`; show "Sending…" label.

## Out of scope
- No DB schema changes.
- No changes to the initial approval flow.
- No rate-limiting UI (Supabase enforces its own limits; surface errors via toast).

## Files touched
- `supabase/functions/resend-teacher-invite/index.ts` (new)
- `src/pages/admin/AdminDashboard.tsx` (Approved tab card + handler)
