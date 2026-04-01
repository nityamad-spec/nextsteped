

## Fix: Add Timeout Fallback for Initial Auth Loading

### Problem

When the Supabase connection is cold (sandbox wake-up, slow network), `supabase.auth.getSession()` can take 10+ seconds. During this time, `loading` stays `true` and the entire app shows a blank "Loading..." screen — blocking both authenticated and unauthenticated users.

### Solution

Add a timeout in `AuthContext` that caps the loading state at 3 seconds. If `getSession()` hasn't responded by then, set `loading = false` with `user = null`, allowing the app to render (unauthenticated users see the auth page immediately). When the session eventually resolves, `onAuthStateChange` will update the state and redirect logged-in users automatically.

### Changes

**`src/contexts/AuthContext.tsx`** — Add a 3-second safety timeout:

```typescript
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
    setUser(session?.user ?? null);
    setLoading(false);
  });

  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session);
    setUser(session?.user ?? null);
    setLoading(false);
  });

  // Safety timeout — stop blocking the UI after 3 seconds
  const timeout = setTimeout(() => {
    setLoading(false);
  }, 3000);

  return () => {
    subscription.unsubscribe();
    clearTimeout(timeout);
  };
}, []);
```

This ensures the app never hangs on "Loading..." for more than 3 seconds. If the user is actually logged in, `onAuthStateChange` will fire once the connection completes and seamlessly update the UI.

### Files Modified
- `src/contexts/AuthContext.tsx` — add 3-second loading timeout

