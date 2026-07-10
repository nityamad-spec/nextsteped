## Fix teacher nav permission bypass

### What we know
- Admin-saved permissions live in `teacher_nav_permissions.allowed_paths`. Example current rows:
  - Teacher A: `[/teacher/support, /teacher/setup, /teacher/content-library]`
  - Teacher B: `[/teacher/support, /teacher/setup, /teacher/courses/dashboard]` (+can_create_courses)
  - Newly approved teacher: `[/teacher/support]` only
- `useTeacherNavPermissions` correctly defaults new teachers to Support-only. Filtering in `TeacherLayout` looks correct on paper, yet the user reports teachers with a saved, restricted row see extra sidebar items. So something is either:
  1. rendering nav items before `permLoading` resolves (initial state is Support-only, but a stale/cached render may leak more), or
  2. matching too loosely via `startsWith` (e.g. `/teacher/setup` grant unintentionally lighting up sub-paths that appear in nav), or
  3. an item flagged `alwaysVisible`/`alwaysUnlocked` slipping through, or
  4. a saved row silently getting overwritten with a wider set by the admin dialog.

Before shipping a fix I want to reproduce and screenshot the actual sidebar for teacher A (limited row) to pinpoint (1)-(4). No code changes during that step.

### Fix (defense in depth, once root cause confirmed)

1) **Strict nav filtering** in `src/layouts/TeacherLayout.tsx`
   - While `permLoading` is true, render an empty nav (or a skeleton) — never render items using the default state.
   - Replace `startsWith(p + "/")` broadening with an exact-match check per top-level nav item. Sub-routes remain reachable only if their own top-level entry is granted.
   - Remove the `alwaysVisible` escape hatch for anything except Support, and ignore `alwaysUnlocked` for visibility decisions (it currently only affects the lock icon, but I want to audit it doesn't leak).

2) **Per-route guard** `RequireTeacherPath` in `src/App.tsx`
   - Wrap every child of the TeacherLayout route (`/teacher/courses/dashboard`, `/teacher/chat`, `/teacher/content-library`, `/teacher/analytics`, each `/teacher/setup/*` sub-page, etc.) with a guard that:
     - waits for `permLoading` / `setupLoading`,
     - checks the route path against `allowed_paths` (exact top-level match),
     - honors the existing `forceSetup` exception for `/teacher/setup`,
     - redirects unauthorized access to `/teacher/support?reason=nav-restricted`.
   - This closes the URL-typing bypass and the race window that today's layout-level `useEffect` leaves open.

3) **Admin dialog correctness** in `src/components/admin/TeacherProfileDialog.tsx`
   - Confirm the upsert writes exactly the checked paths plus `TEACHER_NAV_ALWAYS_ON`, and never a wider default. Add an explicit unit-safe assertion in `savePermissions` and show the resolved list back to admin after save.

4) **Server-side backstop (optional, low-risk)**
   - Data for restricted pages (e.g. analytics, content-library) is already RLS-protected by course membership, so a teacher who bypasses the UI still can't read data they don't own. Confirm this is true for each page before considering additional RLS work; if any page reads globally, add a policy check. No schema changes planned unless a gap is found.

### Out of scope
- No auth flow changes.
- No changes to student or admin routes.
- No new database migrations unless step 4 uncovers a gap.

### Verification
- Playwright (headless, signed in as a limited teacher via the injected Supabase session if available; otherwise via test creds) at 1280×1800:
  1. Load `/teacher/courses/dashboard` → sidebar shows only granted items + Support; URL redirects to Support.
  2. Type `/teacher/analytics` directly → redirected to Support.
  3. Load `/teacher/support` → visible.
  4. Toggle a permission in admin dialog, save, reload teacher session → nav updates to match.
- Screenshot each state and diff against expectation.

### Technical notes
- Files touched: `src/hooks/useTeacherNavPermissions.ts` (optional: expose `ready` flag), `src/layouts/TeacherLayout.tsx`, `src/App.tsx` (new `RequireTeacherPath` + wrap routes), `src/components/admin/TeacherProfileDialog.tsx` (defensive save).
- No changes to `TEACHER_NAV_ALWAYS_ON` semantics beyond Support.
- No migration expected.

### Question before I build
The `/teacher/setup` grant currently unlocks every setup sub-page (`upload`, `concept-review`, `lesson-plan`, `diagnostic`, `ai-settings`, `exam-mode`, `enrollment`). Do you want:
- (a) keep that — one `Setup` grant unlocks all setup sub-pages (simpler for admin), or
- (b) split each setup sub-page into its own admin-toggleable permission?

I'll default to (a) unless you say otherwise.
