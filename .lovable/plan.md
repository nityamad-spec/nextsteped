

## Plan: Fix "Edge Function returned a non-2xx status code" on Student Signup

### Problem
The student signup uses `supabase.functions.invoke("student-signup", ...)` which throws a generic "Edge Function returned a non-2xx status code" error whenever the edge function returns a non-2xx status (400 for validation errors, 429 for rate limits, etc.). The actual error message from the function body is lost -- exactly the same issue we already fixed for student sign-in.

### Root Cause
`supabase.functions.invoke()` does not parse the response body on non-2xx responses. It just throws with a generic message. The edge function correctly returns specific errors (e.g., "Invalid enrollment code", "Too many signup attempts", "Account already exists") but the client never reads them.

### Fix
Replace `supabase.functions.invoke` with a direct `fetch` call in the `signUp` method for students, mirroring the pattern already used in `signIn`.

### Changes: `src/contexts/AuthContext.tsx`

Replace lines 39-50 (the student signup branch) with:

```typescript
try {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/student-signup`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ email, password, name, enrollment_code }),
    }
  );
  const data = await response.json();
  if (!response.ok) {
    return { error: data?.error || "Signup failed" };
  }
  return { error: null };
} catch (err: any) {
  return { error: err.message || "Signup failed" };
}
```

### Files Modified
- `src/contexts/AuthContext.tsx` -- switch student signup from `supabase.functions.invoke` to direct `fetch`

