

## Plan: Rate Limiting & Retry with Backoff for Auth Page

### Problem
The signup and login forms hit Supabase Auth endpoints that can return rate limit errors, but there's no client-side throttling or retry logic — the raw error message is shown directly.

### Changes

**`src/pages/Auth.tsx`**

1. **Rate limiting** — Add a `lastSubmitTime` ref and enforce a 3-second cooldown between form submissions. Show a warning toast if the user clicks too fast. Disable the submit button during cooldown via a brief `isCooldown` state.

2. **Retry with exponential backoff** — Wrap `signIn`, `signUp`, and the teacher application insert in a retry helper:
   - On error messages containing "rate limit" or "too many requests" (case-insensitive): wait 2s → 4s → 8s, retry up to 3 times
   - Show "Rate limited, retrying…" toast on each retry attempt
   - On final failure, show the error as today

3. **Enrollment code verification** — Apply the same retry logic to the `verifyEnrollmentCode` Supabase query

### Files Modified
- `src/pages/Auth.tsx` — cooldown ref/state, retry wrapper, apply to all auth operations

