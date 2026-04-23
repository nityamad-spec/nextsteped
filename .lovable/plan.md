

## Fix "Go to Dashboard" button on Teacher Onboarding

### Problem

Clicking **Go to Dashboard** on `/teacher/onboarding` appears to do nothing on the first attempt; the user has to reload the page to make progress. Two underlying issues:

1. **No visible feedback during save.** `handleContinue` runs 4–6 sequential Supabase queries (profile read → profile insert/update → course read → course insert/update). The button stays enabled with the same label the entire time, so a slow network looks like a dead button. If the user clicks again, a second insert may run.
2. **Silent failures.** There is no `try/catch` around the whole flow. If any query throws (transient network error, RLS race right after sign-up, `setSession` not yet propagated), the handler aborts mid-way with no toast and no navigation. After reload, the partial state is detected and the second attempt succeeds — which is exactly the "reload to proceed" symptom.
3. **Auth-readiness race.** Right after sign-up, the Supabase JS client occasionally fires the `INITIAL_SESSION` event before the access token is fully attached to the client. The first DB write can therefore run with no `Authorization` header, get rejected by RLS, and throw — again silently.

### Fix

Tighten `src/pages/teacher/TeacherOnboarding.tsx` only. No DB changes, no schema changes, no routing changes.

#### 1. Add a `saving` state + double-submit guard

- New `const [saving, setSaving] = useState(false);`
- Guard at top of `handleContinue`: `if (saving || !user) return;` then `setSaving(true)` and `setSaving(false)` in a `finally` block.
- Button: `disabled={!isValid || saving}`; label flips to **"Saving…"** with a spinner icon while saving so the click is obviously registered.

#### 2. Wrap the whole flow in `try/catch/finally`

- Catch any thrown error and show `toast.error("Something went wrong. Please try again.")` with the error message appended.
- `finally { setSaving(false); }` so the button always re-enables.

#### 3. Ensure auth session is attached before the first write

- At the top of `handleContinue`, after the `saving` guard, call `await supabase.auth.getSession()` once and bail out with a toast if no `session?.access_token` is present. This forces the Supabase client to flush any pending `setSession` before the first RLS-protected query runs, eliminating the post-signup race.

#### 4. Parallelize the two independent reads

- Run the existing-profile lookup and existing-course lookup with `Promise.all([...])` instead of sequentially. Cuts perceived save time roughly in half on a slow network. The two writes (`update`/`insert`) still run sequentially because they depend on the read results.

#### 5. Defer context updates until after navigate decision

Keep the existing `setTeacherProfile` / `setCurrentCourse` calls, but only run them after both DB writes have succeeded, so a mid-flight failure never leaves the AppContext partially populated.

### Files touched

| Path | Change |
|---|---|
| `src/pages/teacher/TeacherOnboarding.tsx` | Add `saving` state, double-submit guard, `try/catch/finally`, `getSession()` warm-up, `Promise.all` for reads, button shows "Saving…" with spinner. |

### Out of scope

- No change to `useTeacherSetupStatus`, `TeacherRedirect`, or `TeacherLayout` gating logic — those already work once a course row exists.
- No change to the database, RLS, or edge functions.
- No change to other onboarding flows (student, admin).

