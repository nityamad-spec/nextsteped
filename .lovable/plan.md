## Root cause

**Issue A — Blank form on first load, button looks dead**
With `AUTH_BYPASS = true` and no cached session, `AuthContext` has to do a real `signInWithPassword` round-trip to log in as `admin@nextstep.ai`. While that's pending:
- The 3-second safety `setTimeout` in `AuthContext` fires `setLoading(false)` *before* `setUser` runs.
- `TeacherOnboarding`'s effect sees `authLoading=false && user=null`, hits the `if (!user) return` early-out, and clears its own loading.
- The form renders empty. Since `isValid` requires every field to be truthy, the "Go to Course Setup" button is disabled — that's the "button doesn't work."
- A moment later `setUser` finally fires, the effect re-runs, and the data loads — but only if you wait. On reload `getSession()` resolves immediately from localStorage, so the first effect run already has `user`.

**Issue B — Form auto-fills with "Admin" / "admin@nextstep.ai"**
Not a form bug. `AUTH_BYPASS` silently signs every visitor in as the seeded admin (`admin@nextstep.ai`). The "Admin" name and that email are the actual values stored in `profiles` for that account, so the auto-populate is correctly loading the admin's profile — because that *is* the current user. Whatever email you typed on `/auth` was ignored by the bypass codepath.

## Solution

### 1. Fix the race in `TeacherOnboarding.tsx` (file: `src/pages/teacher/TeacherOnboarding.tsx`)
- Replace the `if (authLoading) return; if (!user) { setLoading(false); return; }` gate with an explicit auth-ready check that waits for **both** `authLoading === false` **and** `user !== null` (or a definitive "no user" signal) before deciding what to do.
- Concretely: keep the page's local `loading` state `true` while `authLoading || user === undefined`. Only set it to `false` (and render the empty form) once we know auth has fully resolved with no user. This eliminates the "blank form between safety timeout and bypass signin completing" window.
- Add a small visible "Authenticating…" hint above the skeletons so the user doesn't try to click a disabled button.

### 2. Remove the 3-second silent fallback for the bypass path (file: `src/contexts/AuthContext.tsx`)
The `setTimeout(() => setLoading(false), 3000)` is what causes `authLoading` to flip false before `user` is set. Two options — pick one:
- **Option A (preferred while bypass is on):** When `AUTH_BYPASS` is true, do not arm the safety timeout until *after* `ensureBypassAdminSession()` resolves. That way `loading` only flips to `false` after `user` is populated (or the bypass genuinely failed).
- **Option B:** Keep the timeout but also expose an `isReady` flag (`!loading && (user !== null || bypassAttempted)`) and have consumers gate on that instead of `loading`.

### 3. Stop the bypass profile from leaking into the form (files: `src/pages/teacher/TeacherOnboarding.tsx`, `src/lib/authBypass.ts`)
Two complementary fixes:
- **Short-term, low-risk:** In `TeacherOnboarding.tsx`, only auto-populate `name` / `institution` / `department` / `designation` from `profiles` when `profiles.role === 'teacher'`. If the signed-in user is the bypass admin (`role === 'admin'`), skip auto-fill of identity fields and leave them blank so the form behaves like a real first-time teacher onboarding. Apply the same guard to the disabled email input — show a placeholder instead of `user.email` when the user is the bypass admin.
- **Proper fix (when ready):** Set `AUTH_BYPASS = false` in `src/lib/authBypass.ts` so each visitor goes through real auth and lands as their own user. Then the auto-populate is correctly scoped to that teacher's data.

### 4. (Optional polish) Surface the disabled-button reason
On the "Go to Course Setup" button, when `!isValid`, show a small helper line ("Fill all fields to continue") under the button. That removes the perception that the button is broken when it's just disabled.

## Files to edit
- `src/pages/teacher/TeacherOnboarding.tsx` — gate render on real auth-ready, skip auto-fill when current user is admin, add helper text under disabled button.
- `src/contexts/AuthContext.tsx` — defer/scope the 3s safety timeout so it doesn't flip `loading` false before bypass signin completes.
- `src/lib/authBypass.ts` — (only if user wants the bypass off) flip `AUTH_BYPASS` to `false`.

## Out of scope
- Reworking the entire auth flow into a `useAuthReady` hook (can be done later; the targeted fix above resolves the symptom without a refactor).
- Changing the seeded admin's profile data.
