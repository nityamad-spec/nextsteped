

## Plan: Edge Function for Student Sign-In (Bypass IP Rate Limits)

### Problem
Student sign-in uses `supabase.auth.signInWithPassword()` directly from the client, which is subject to Supabase's per-IP rate limit of ~30 requests per 5 minutes. In shared lab environments, this causes disruptions.

### Approach

**1. New Edge Function: `supabase/functions/student-signin/index.ts`**

- Accepts `{ email, password }` via POST
- Validates input with Zod
- Per-email rate limiting: reuse `signup_attempts` table (or add a `signin_attempts` table) — max 10 failed attempts per 15 minutes per email to prevent brute force
- Uses `adminClient.auth.admin.listUsers()` to verify user exists, then calls `adminClient.auth.signInWithPassword()` — but **this won't work** because `signInWithPassword` is a client-side method, not an admin method
- **Correct approach**: Use the GoTrue REST API directly — POST to `{SUPABASE_URL}/auth/v1/token?grant_type=password` with the `service_role` key as `apikey` header. This bypasses the per-IP gateway limit because the request originates from the edge function, not the client IP
- Returns the session (access_token, refresh_token) on success
- Record failed attempts for rate limiting; reset on success

**2. New table: `signin_attempts` (migration)**

```sql
CREATE TABLE public.signin_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_signin_attempts_email_time ON public.signin_attempts (email, attempted_at);
ALTER TABLE public.signin_attempts ENABLE ROW LEVEL SECURITY;
-- No RLS policies — only service_role accesses this table
```

**3. Update `src/contexts/AuthContext.tsx`**

- Modify `signIn` to invoke the edge function via `supabase.functions.invoke("student-signin")`
- On success, use `supabase.auth.setSession()` with the returned access_token and refresh_token to establish the client session
- Keep existing `signInWithPassword` as fallback for non-student roles (teacher/admin sign-in volume is low)

**4. Update `src/pages/Auth.tsx`**

- The `signIn` call already goes through `AuthContext`, so the Auth page needs minimal changes
- After successful sign-in via edge function, the session is set client-side and `onAuthStateChange` fires as usual, triggering the existing role-check and navigation logic

**5. `supabase/config.toml`** — Add:
```toml
[functions.student-signin]
verify_jwt = false
```

### Security
- Per-email failed-attempt tracking (10 per 15 min) prevents brute force
- Successful login resets the counter (or we simply count failures only)
- Input validation via Zod
- Password verification still handled by Supabase Auth engine server-side
- `service_role` key only used within the edge function, never exposed to client

### Edge Function Core Logic
```typescript
// POST to GoTrue directly from edge function (server IP, not client IP)
const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "apikey": serviceRoleKey,
  },
  body: JSON.stringify({ email, password }),
});
const data = await res.json();
// Return { access_token, refresh_token, user } to client
```

### Client-Side Session Setup
```typescript
// In AuthContext.signIn:
const { data } = await supabase.functions.invoke("student-signin", { body: { email, password } });
if (data?.access_token) {
  await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
}
```

### Files Modified
- New: `supabase/functions/student-signin/index.ts`
- Database migration: `signin_attempts` table
- `src/contexts/AuthContext.tsx` — route sign-in through edge function
- `supabase/config.toml` — add function entry

