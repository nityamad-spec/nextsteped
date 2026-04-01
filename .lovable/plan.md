

## Fix: Student Sign-In Hangs on "Please wait..."

### Root Cause

After the edge function returns tokens successfully, `Auth.tsx` lines 152-162 make **two additional sequential network calls** before navigating:

1. `supabase.auth.getUser()` — round-trip to Supabase auth server
2. `supabase.from("profiles").select("role")` — database query with RLS

These are redundant for student sign-in because:
- The user object is already available from `setSession()` (set in AuthContext)
- The role is already known — it's `"student"` (passed as the `role` parameter)

If either of these calls is slow (cold connection, RLS overhead), the button stays stuck on "Please wait..." indefinitely.

### Solution

After a successful student sign-in via the edge function, skip the redundant `getUser()` and `profiles` queries. Navigate immediately since the role is already known.

### Changes

**`src/pages/Auth.tsx` — lines 140-178**

After the `signIn()` call succeeds for students, navigate directly to `/student` without the extra queries. Keep the profile-role-check logic only for non-student (teacher/admin) sign-ins where the role needs verification.

```typescript
if (isLogin) {
  const { error } = await withRetry(
    () => signIn(email, password, role),
    (r) => r.error
  );
  if (error) {
    toast.error(error);
    setLoading(false);
    return;
  }

  // Students signed in via edge function — role is known, skip extra queries
  if (role === "student") {
    toast.success("Welcome back!");
    navigate("/student");
    return;
  }

  // Non-student: verify profile role as before
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { setLoading(false); return; }

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();

  const userRole = profile?.role || user.user_metadata?.role || role;

  if (profile && profile.role !== role && role !== "admin") {
    toast.error(`This account is registered as a ${profile.role}...`);
    await supabase.auth.signOut();
    setLoading(false);
    return;
  }

  toast.success("Welcome back!");
  if (userRole === "admin") navigate("/admin/dashboard");
  else navigate(userRole === "teacher" ? "/teacher" : "/student");
}
```

This eliminates 2 network round-trips for student sign-in, making navigation near-instant after the edge function returns.

### Files Modified
- `src/pages/Auth.tsx` — skip redundant getUser + profile queries for student login

