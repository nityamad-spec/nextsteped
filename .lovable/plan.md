## Root cause

The teacher invite email's `redirect_to` parameter is being set from the caller's browser origin. When you approve a teacher from inside the Lovable editor, the request's `Origin`/`Referer` header resolves to `https://lovable.dev` (the editor shell), not the preview iframe. So Supabase builds an invite link containing `redirect_to=https://lovable.dev/reset-password`. Since `lovable.dev` isn't in the project's auth redirect allow-list, the invite lands on `lovable.dev` itself — which shows the Lovable login page from your screenshot.

Backend auth config is fine:
- Site URL: `https://nextsteped.lovable.app`
- Allow-list already includes preview + published domains (no `lovable.dev` entry, and we should NOT add one).

## Fix

Stop trusting the caller's `Origin`/`Referer` for the invite `redirectTo`. Always send teachers to the published app.

### Files to change

1. `supabase/functions/approve-teacher/index.ts`
   - Replace the dynamic `origin`-based `redirectTo` with a constant:
     `const redirectTo = "https://nextsteped.lovable.app/reset-password";`
   - Pass it to `adminClient.auth.admin.inviteUserByEmail(...)` as before.

2. `supabase/functions/resend-teacher-invite/index.ts`
   - Same change: hard-code `redirectTo` to `https://nextsteped.lovable.app/reset-password` for both the invite and the recovery fallback paths.

### Out of scope (not touching now)

- `student-pending-signup` — same pattern exists, but you only asked about the teacher flow. Happy to apply the same fix there in a follow-up if you want.
- No changes to Site URL, allow-list, edge function CORS, or client code.
- No new migration.

### Verification

- Approve a test teacher from the Lovable editor.
- Open the invite email — the link's `redirect_to` query param should be `https://nextsteped.lovable.app/reset-password`.
- Clicking it should land on your app's password reset page, not on `lovable.dev`.

Want me to apply the same hard-coded redirect to `student-pending-signup` in the same change, or leave it alone for now?