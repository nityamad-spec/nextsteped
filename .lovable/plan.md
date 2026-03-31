

## Plan: Confirm Existing Unverified Student Accounts

### Problem
Students who signed up before the auto-confirm fix have unverified email addresses. They cannot sign in ("Email not confirmed") and cannot re-register ("already been registered"). These accounts are stuck.

### Solution
Update the `student-signin` edge function to detect the "Email not confirmed" error and auto-confirm the user on-the-fly using the admin API, then retry the sign-in. This is a self-healing approach — no manual intervention needed, and it handles any stragglers automatically.

### Why Not a One-Time Bulk Script?
A bulk confirm script would work but requires knowing which users are affected. The self-healing approach is more robust: any unconfirmed student who tries to sign in gets confirmed automatically, with zero admin effort.

### Changes

**1. `supabase/functions/student-signin/index.ts`**

After the GoTrue `/token` call fails, check if the error is "Email not confirmed". If so:
1. Look up the user by email via `adminClient.auth.admin.listUsers()` 
2. Confirm them via `adminClient.auth.admin.updateUserById(userId, { email_confirm: true })`
3. Retry the `/token` call
4. Return tokens on success

```
// Pseudocode addition after token failure:
if (error === "Email not confirmed") {
  // Find user by email
  const { data: { users } } = await adminClient.auth.admin.listUsers({ filter: email });
  if (users.length > 0) {
    // Auto-confirm
    await adminClient.auth.admin.updateUserById(users[0].id, { email_confirm: true });
    // Retry sign-in
    const retryRes = await fetch(tokenEndpoint, ...);
    if (retryRes.ok) return retryRes tokens;
  }
}
```

### Security
- Only triggers for students using the student-signin edge function (teachers/admins unaffected)
- The student-signin function already uses the service role key server-side
- Per-email rate limiting on `signin_attempts` still applies
- This is equivalent to what the signup function now does — just retroactive

### Files Modified
- `supabase/functions/student-signin/index.ts` — add auto-confirm-on-signin logic

