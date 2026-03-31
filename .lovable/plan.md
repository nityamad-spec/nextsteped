

## Root Cause Analysis: Missing Verification Emails

### The Problem

The `student-signup` edge function creates users with `email_confirm: false` (line 96), which tells Supabase's GoTrue to send a confirmation email. While the edge function successfully bypasses the **signup API** per-IP rate limit using the service role key, the **email delivery** itself is still subject to Supabase's internal email sending rate limits (~3-4 emails per hour per recipient, ~30 emails per hour globally on small instances). With an entire class signing up simultaneously from a shared network, these email rate limits are quickly exhausted, silently suppressing confirmation emails for later signups.

The auth logs confirm this: many users are successfully created (status 200 on `/admin/users`) but then immediately fail sign-in with "Email not confirmed" -- meaning the account exists but the confirmation email was never delivered or was throttled.

### Recommended Fix

Since students already prove legitimacy via an **enrollment code** tied to a published course, email verification adds friction without meaningful security benefit. The fix is to **auto-confirm student accounts** at creation time and **return a session immediately**, eliminating the email verification step entirely.

### Changes

**1. `supabase/functions/student-signup/index.ts`**

- Change `email_confirm: false` to `email_confirm: true` on line 96
- After successful user creation, sign them in immediately using the GoTrue `/token?grant_type=password` endpoint (same pattern as `student-signin`)
- Return the `access_token` and `refresh_token` in the response so the client can establish a session

**2. `src/contexts/AuthContext.tsx`**

- In the student signup branch, after a successful response, call `applySessionFromFunctionResponse(data)` to hydrate the session (the helper already exists)
- Remove or update the "Check your email to verify" success message since verification is no longer needed

**3. `src/pages/Auth.tsx`** (if applicable)

- Update any post-signup toast/message that tells students to check their email

### Why This Is Safe

- Enrollment codes already gate access -- only students with a valid code from their instructor can create accounts
- The code validates the course exists, is published, and has enrollment open
- Per-email rate limiting on `signup_attempts` still prevents abuse
- This matches common patterns where invitation/enrollment-based signups skip email verification

### Alternative (if email verification is still desired)

If you want to keep email verification, the alternative is to set up custom SMTP via Lovable's email domain system so emails are sent through your own domain rather than Supabase's shared infrastructure, avoiding the built-in rate limits. This requires DNS configuration and is more complex.

