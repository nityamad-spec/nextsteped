## Root cause: Course Analytics gated behind full setup completion, not by admin permissions

### What's happening
Even when admin grants `/teacher/analytics` in `teacher_nav_permissions.allowed_paths`, the page stays inaccessible because a **separate** gate — the "setup complete" gate — blocks every non-setup route for teachers whose Course Setup pipeline isn't fully finished.

Two independent lockouts sit on top of that page:

1. **Sidebar lock (visual)** — `src/layouts/TeacherLayout.tsx`:
   ```
   const isLocked = (item) => !item.alwaysUnlocked && !setupComplete;
   ```
   Analytics has no `alwaysUnlocked` flag in `src/config/teacherNav.ts`, so it renders with a Lock icon and a "Complete your Course Setup to unlock this" tooltip — it is not clickable.

2. **Route redirect (hard)** — same file:
   ```
   const ALWAYS_OPEN_PATHS = ["/teacher/setup", "/teacher/support"];
   useEffect(() => {
     if (setupComplete) return;
     if (!ALWAYS_OPEN_PATHS.matches(pathname)) navigate("/teacher/setup", { replace: true });
   });
   ```
   Any teacher whose setup is incomplete is bounced to `/teacher/setup` regardless of `allowed_paths`.

`setupComplete` (from `useTeacherSetupStatus`) requires **all** of: profile name+department, course basics, ≥1 uploaded material, ≥1 confirmed concept, AND a published lesson plan file in storage. Missing any one → `setupComplete=false` → Analytics locked + redirected.

That's why "no one" sees it: none of the current teachers satisfy every requirement, and admin permissions have no effect on this second gate.

Quick DB confirmation I plan to run before building:
- For each teacher owner, check whether they have a published lesson plan and ≥1 concept — expected outcome: none do, which matches the reported symptom.

### Options to fix

Pick the intended behavior — this is a policy question, not a technical one:

- **A. Admin permission overrides setup gate.** If admin explicitly granted `/teacher/analytics`, allow it even when setup is incomplete. Sidebar shows it unlocked; route loads. Setup remains required for everything else.
- **B. Analytics is `alwaysUnlocked` for every teacher.** Drop the setup gate on Analytics only (analytics of an empty course simply shows empty state). Admin permission still controls visibility.
- **C. Keep current gating**, but fix the misleading UX: hide Analytics from the sidebar entirely (not just lock icon) when setup is incomplete, and remove any expectation that admin permission alone unlocks it. Document that Analytics requires setup completion.
- **D. Loosen the "setup complete" definition** so it doesn't require a published lesson plan (or require only profile + course basics). Any teacher who's created a course sees Analytics.

### Recommended: A
Rationale: admin permissions should be the source of truth for what a teacher can access. Setup gating should protect only the *setup pipeline itself*, not admin-granted pages. Fix is small and localized to `TeacherLayout` (sidebar lock + redirect) and doesn't touch the setup logic.

### Files that will change (once approved)
- `src/layouts/TeacherLayout.tsx` — `isLocked` and the setup-redirect effect both check `isAllowed(path)` before locking/redirecting.
- Possibly `src/config/teacherNav.ts` — no change needed for A; would set `alwaysUnlocked: true` on Analytics only for B.
- No DB / migration changes.

### Verification
- Playwright not possible for a specific limited teacher (session injection is admin-only in this sandbox), so I'll verify via:
  - Unit test on a new helper `isRouteAccessible(path, { setupComplete, isAllowed, ownsAnyCourse })` covering: admin-granted analytics with incomplete setup → true; non-granted route with incomplete setup → false → redirect to setup.
  - Manual: you sign in as a teacher with `/teacher/analytics` granted and confirm the sidebar item is unlocked and the page loads.

### Question
Which option (A / B / C / D) matches your intent? I'll default to **A** unless you say otherwise.
