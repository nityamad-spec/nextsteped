# Teacher Detail Dialog on /admin/teachers

Make each row on `/admin/teachers` clickable. Opens a dialog with two sections: **Courses** (with role management) and **Navigation Access** (which teacher-view pages the teacher can see).

## 1. Data model

New table `public.teacher_nav_permissions`:
- `teacher_id uuid PK -> profiles.id`
- `allowed_paths text[]` — list of teacher-nav paths the teacher is allowed to see
- `updated_at`, `updated_by`

Grants: `service_role` full; `authenticated` select+insert+update+delete gated by RLS.

RLS:
- Admins (via `is_admin(auth.uid())`): full read/write on all rows.
- Teachers: `select` own row only.

Default when no row exists: **only `/teacher/support` is visible** (per your answer). `Course Setup` is `alwaysUnlocked` in nav today — we'll treat Setup as always-visible too so a brand-new teacher can still complete setup; otherwise they'd be stuck. Everything else hidden until admin grants it.

## 2. Backend behavior

- No changes to existing course-level RLS. Nav permissions are a UI gate only; route-level guards enforce the same list client-side (redirect to `/teacher/support` if visiting a disallowed path).
- Course role edits reuse existing tables:
  - **Owner** = `courses.teacher_id`
  - **Collaborator** = row in `course_teachers`
  - "Change role" for a collaborator → promote to owner uses the existing `transfer-course-ownership` edge function (demotes current owner to collaborator).
  - "Remove from course": for collaborator, delete from `course_teachers`; for owner, require transferring ownership first (reuse existing UX pattern from AdminTeachers delete flow).
  - "Add to course": admin picks a course from a searchable list → insert into `course_teachers` as collaborator.

## 3. UI

### `/admin/teachers`
- Rows become clickable (whole row, keyboard-accessible). The existing "Delete user" menu still works via stopPropagation.

### New `TeacherProfileDialog.tsx`
Header: teacher name, email, department, join date.

**Tab 1 — Courses**
Table of courses the teacher belongs to:
| Course code · name | Role | Students | Actions |
Actions per row:
- Change role (Owner ⇄ Collaborator) — owner change triggers transfer-ownership confirm.
- Remove from course (owner needs transfer target).
"Add to course" button → dialog with course search + adds as collaborator.

**Tab 2 — Navigation Access**
Checklist of every entry in `teacherNav` (Course Setup, Course Dashboard, Course Assistant, Lesson Plan & Resources, Course Analytics, Support). Each row shows title + path + checkbox.
- Setup and Support are checked and disabled (always visible).
- Save button persists to `teacher_nav_permissions`.
- Info banner: "Unchecked pages are hidden entirely from this teacher's sidebar and blocked from direct URL access."

### `TeacherLayout.tsx`
- Fetch teacher's `allowed_paths` on mount (cached like role cache).
- Filter `teacherNav` to intersection of `allowed_paths` ∪ always-on set (`/teacher/setup`, `/teacher/support`).
- Guard: if `location.pathname` is not allowed, redirect to `/teacher/support`.
- Combined with existing setup-complete gate (nothing changes there).

## 4. Files touched

New:
- `supabase/migrations/<ts>_teacher_nav_permissions.sql`
- `src/components/admin/TeacherProfileDialog.tsx`
- `src/hooks/useTeacherNavPermissions.ts`

Edited:
- `src/pages/admin/AdminTeachers.tsx` — row click → open dialog; keep delete menu.
- `src/layouts/TeacherLayout.tsx` — filter nav + route guard using permissions.

## 5. Out of scope

- No changes to admin, student, or course-level RLS.
- No audit log for permission changes (can add later if needed).
- No per-course nav overrides — global per teacher, as chosen.

## 6. Verification

- Admin opens a teacher → sees courses, promotes a collaborator to owner, removes them, adds them to another course.
- Admin unchecks "Course Dashboard" for a teacher → that teacher's sidebar no longer shows it, and visiting `/teacher/courses/dashboard` redirects to `/teacher/support`.
- Teacher with no permission row sees only Setup + Support.
- Other teachers unaffected.
