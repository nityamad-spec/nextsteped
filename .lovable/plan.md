# Admin Control: Teacher Course Creation Permission

Add an admin-managed permission that decides whether each teacher can create new courses. Default = restricted. Admin toggles it from the TeacherProfileDialog on `/admin/teachers`.

## Behavior

| Case | Result |
|---|---|
| Admin allows create | Teacher sees "Add new course" everywhere, `/teacher/courses/new` opens normally |
| Admin restricts (default) | All create-course entry points hidden; direct URL redirects to `/teacher/support` with a toast/notice explaining they need admin approval |
| Restricted teacher with 0 courses | Sent to `/teacher/support` (instead of the current forced `/teacher/courses/new`) with a notice to request access |
| Existing owned courses | Unaffected — teacher continues to manage them |

## Database

Add a boolean column to `teacher_nav_permissions`:

- `can_create_courses boolean not null default false`

Rationale: this table already stores per-teacher capability config for the admin dialog, so it is the natural home. When no row exists, absence still means restricted (matches new default).

No RLS change needed on `courses` for this iteration — enforcement is client-side (hide + route block), matching the scope the user chose.

## UI — `src/components/admin/TeacherProfileDialog.tsx`

Inside the existing nav-permissions list, add a new row "Create new courses" with the same toggle styling as the sidebar-path rows. Load the boolean alongside `allowed_paths` in the existing fetch, and include it in the same save mutation (single upsert to `teacher_nav_permissions`).

## Hook — `src/hooks/useTeacherNavPermissions.ts`

Extend to also return `canCreateCourses: boolean` (defaults to `false` when no row). Read it from the same query.

## Enforcement

1. `src/components/CourseSwitcher.tsx` — hide the "Add new course" button and dropdown item when `!canCreateCourses`.
2. `src/App.tsx`
   - `/teacher/courses/new` route: wrap `NewCoursePage` in a small guard that redirects to `/teacher/support?reason=course-create-restricted` when `!canCreateCourses`.
   - `RequireCourse` (line ~143): when `!hasCourse && !canCreateCourses`, redirect to `/teacher/support?reason=course-create-restricted` instead of `/teacher/courses/new?first=1`.
3. `src/pages/teacher/Support.tsx` (or the support page component) — read the `reason` query param and render an inline notice: "An admin has not granted you permission to create courses yet. Please contact your admin."

## Out of scope

- No changes to server-side RLS on `courses` (client-side hide + route block only, per the chosen scope).
- No changes to existing owned courses or collaborator flows.
- No bulk admin action; toggle is per-teacher in the existing dialog.

## Files touched

- migration: add `can_create_courses` column to `teacher_nav_permissions`
- `src/hooks/useTeacherNavPermissions.ts`
- `src/components/admin/TeacherProfileDialog.tsx`
- `src/components/CourseSwitcher.tsx`
- `src/App.tsx`
- `src/pages/teacher/Support.tsx` (notice banner when `reason=course-create-restricted`)
