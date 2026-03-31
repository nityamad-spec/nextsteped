

## Plan: Edge Function for Student Signup (Bypass IP Rate Limits)

### Problem
Students in shared labs hit Supabase's per-IP Auth rate limits (30 signups/hour) because all requests originate from the same IP. The edge function will use the `service_role` key to create users server-side, shifting the bottleneck away from client IP.

### Approach

**1. New Edge Function: `supabase/functions/student-signup/index.ts`**

- Accepts `{ email, password, name, enrollment_code }` via POST
- Validates all inputs (Zod: valid email, password ≥ 6 chars, non-empty name, non-empty enrollment_code)
- **Per-email rate limiting**: Query a `signup_attempts` table to check if this email has attempted signup more than 5 times in the last hour. If so, return 429.
- Verify enrollment code against `courses` table (published + enrollment_open) — same logic as current client-side check
- Use `supabase.auth.admin.createUser()` with `service_role` key to create the user with metadata `{ name, role: "student", enrollment_code }`
- Insert a row into `signup_attempts` tracking the email and timestamp
- Return success or appropriate error
- CORS headers included
- No JWT verification needed (public endpoint), but input validation prevents abuse

**2. New table: `signup_attempts` (migration)**

```sql
CREATE TABLE public.signup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_signup_attempts_email_time ON public.signup_attempts (email, attempted_at);

-- Auto-cleanup old rows (optional: keep 24h)
-- No RLS needed — only accessed by edge function via service_role
ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;
```

No RLS select/insert policies for anon/authenticated — only the edge function (service_role) touches this table.

**3. Update `src/contexts/AuthContext.tsx`**

Change `signUp` to call the edge function instead of `supabase.auth.signUp()`:

```typescript
const signUp = async (email, password, name, role, enrollment_code?) => {
  const res = await supabase.functions.invoke("student-signup", {
    body: { email, password, name, enrollment_code }
  });
  if (res.error || res.data?.error) {
    return { error: res.data?.error || res.error.message };
  }
  return { error: null };
};
```

Keep the existing `supabase.auth.signUp` as fallback for non-student roles (teacher applications don't create auth users anyway).

**4. Update `src/pages/Auth.tsx`**

- After successful edge function signup, show "Check your email to verify your account" (same as now)
- The edge function will set `email_confirm: false` so the user still needs to verify via email

**5. `supabase/config.toml`** — Add function config:
```toml
[functions.student-signup]
verify_jwt = false
```

### Security
- Per-email rate limit (5 attempts/hour) prevents email enumeration and abuse
- Input validation via Zod in the edge function
- Enrollment code verification ensures only valid course enrollments
- Password hashing handled by Supabase Auth internally
- The `service_role` key is only used server-side, never exposed to client

### Files Modified
- New: `supabase/functions/student-signup/index.ts`
- Database migration: `signup_attempts` table
- `src/contexts/AuthContext.tsx` — route student signups through edge function
- `src/pages/Auth.tsx` — minor: adjust post-signup messaging if needed
- `supabase/config.toml` — add function entry

