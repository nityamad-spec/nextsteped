## Issue identified on `/teacher/onboarding` auto-populate

The auto-populate effect in `src/pages/teacher/TeacherOnboarding.tsx` (lines 40–99) has three concrete bugs that cause it to silently fail or show stale data.

### Bug 1 — Race condition: queries run before the access token is attached

The effect fires as soon as `authLoading` is `false` and `user` is non-null. But `useAuth` flips `loading` to false on the very first `INITIAL_SESSION` event, which can fire **before** `supabase.auth.setSession({ access_token, refresh_token })` finishes propagating the token to the JS client (especially right after sign-up, or on first load with `AUTH_BYPASS`).

Result: the `profiles` and `courses` SELECTs run with no `Authorization` header, RLS returns 0 rows, and the form renders empty even though the data exists in the DB. There is no error — just no auto-populate.

The save handler `handleContinue` (line 117) already protects against this with `await supabase.auth.getSession()` as a warm-up. The read effect does **not**.

### Bug 2 — `currentCourseId` from localStorage is never validated

Line 49 reads `localStorage.getItem("currentCourseId")` and line 61 queries that exact id. If the course was deleted (e.g. via `wipe-courses`, admin action, or switching test accounts), the query returns `null` and the effect **does not fall back** to the "latest owned course" branch (line 63) — that branch only runs when `storedCourseId` is falsy. Result: form stays blank for a teacher who actually has a course.

This is the same class of bug we fixed last loop in `CourseCreation.tsx`.

### Bug 3 — No try/catch + 4 s safety timeout masks failures

Lines 47–94 have no `try/catch`. Any thrown error (network blip, RLS rejection from Bug 1, JSON parse) aborts the effect mid-way, `setLoading(false)` on line 92 never runs, and the user sees the skeleton until the 4 s safety timeout (line 97) fires — at which point the form renders **empty**, indistinguishable from a brand-new teacher. The thrown error is also swallowed silently (no `console.error`, no toast), so the bug is invisible in dev.

### Bug 4 (minor) — `graduation_year` only restores the first entry

Line 84–86 reads `graduation_year[0]` even though the column is a `text[]`. If a teacher saved multiple years on a later setup screen, the onboarding form silently drops the rest on re-edit. Low priority but worth noting.

---

## Fix plan

Single file: `src/pages/teacher/TeacherOnboarding.tsx`. No DB, RLS, edge function, or routing changes.

### 1. Warm up the session before the read queries

At the top of `fetchExistingData` (after `setLoading(true)`), call `await supabase.auth.getSession()` once and bail out gracefully if no `access_token` is present (set `loading=false`, return). This forces the JS client to flush any pending `setSession` and eliminates the post-signup / cold-start RLS race. Mirrors what `handleContinue` already does on line 117.

### 2. Validate `storedCourseId` before trusting it; fall back to "latest owned course"

Refactor the course resolution block (lines 59–70) so:

- If `storedCourseId` is set, query it.
- **If that query returns `null`**, clear `localStorage.currentCourseId` and re-run the "latest owned course" lookup (the same query already on line 63).
- If neither yields a row, leave the course fields empty (new teacher case).

### 3. Wrap the whole effect in `try/catch/finally`

- `try { ... }` around the existing read flow.
- `catch (err) { console.error("Onboarding auto-populate failed:", err); toast.error("Couldn't load your saved info. You can re-enter it below."); }`
- `finally { setLoading(false); }` — guarantees the skeleton always clears, regardless of error path. Removes the need for the 4 s `setTimeout` safety net (delete lines 96–98), which currently masks the symptom.

### 4. Use `cancelled` flag to prevent state writes after unmount

The current effect can call `setName` etc. after the component unmounts (e.g. user clicks Sign Out mid-load). Add a `let cancelled = false;` guard and `return () => { cancelled = true; };` cleanup, gating each `setState` on `if (!cancelled)`. Standard React pattern; prevents the noisy "state update on unmounted component" warning.

### 5. (Optional, low-cost) Restore all `graduation_year` entries

If you later add multi-year support to onboarding, this is where to fix it. For now, keep `[0]` behavior — out of scope unless you want it.

### Files touched

| Path | Change |
|---|---|
| `src/pages/teacher/TeacherOnboarding.tsx` | Add `getSession()` warm-up to the load effect; validate `storedCourseId` and fall back to latest owned course on miss; wrap effect in `try/catch/finally`; add `cancelled` cleanup guard; remove the 4 s `setTimeout` safety net (no longer needed). |

### Out of scope

- No changes to `useAuth`, `AuthContext`, or `App.tsx` redirects — the auth bootstrap is fine; we just need to wait for the token before issuing RLS-protected reads.
- No changes to `handleContinue` — it already does the right thing.
- No DB/RLS/edge-function changes.
