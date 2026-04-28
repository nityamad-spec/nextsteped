## Goal

When an admin approves a teacher as a **collaborator** (or **owner_swap**) on an existing course, that teacher must, on first sign-in:

1. Land directly on the **Course Dashboard** of the assigned course (not the "create new course" page, not a setup gate).
2. Have the assigned course pre-selected as their active course.
3. Be able to edit every stage of the setup pipeline (Course Setup, Lesson Plan, Concepts, Diagnostic, Exam Mode, Settings, Content Library) just like the owner.

Today these teachers are being sent to `/teacher/courses/new?first=1` and gated behind an incomplete-setup wall, because the redirect and setup-status hook only look at courses they **own**, ignoring `course_teachers` collaborator membership.

## Root causes

1. `TeacherRedirect` in `src/App.tsx` checks only `courses.teacher_id = user.id`. Collaborators own nothing, so it falls through to "no course → create a new course".
2. `useTeacherSetupStatus` in `src/hooks/useTeacherSetupStatus.ts` resolves the active course with `.eq("teacher_id", user.id)`, so a collaborator's active course is never found and setup is reported incomplete forever.
3. `TeacherLayout` then force-redirects them off `/teacher/courses/dashboard` back to `/teacher/setup`, where the same hook misfires — they cannot escape to the actual dashboard.
4. The `approve-teacher` edge function never sets the new collaborator's `profiles.active_course_id`, so there is no signal of which course to pre-select.

RLS for collaborators is already correct (`is_course_member` covers `courses`, `concepts`, `course_ta_settings`, `course_material_files`, `assessment_questions`, `diagnostic_questions`, `enrollments`, `assessment_results`, `diagnostic_results`, `student_feedback`). So once we fix the redirect + hook, edit access works automatically.

## Changes

### 1. `supabase/functions/approve-teacher/index.ts`
- After inserting the `course_teachers` row for `collaborator` (and after the owner_swap branch), set `profiles.active_course_id = courseId` for the new teacher. This gives the front end an unambiguous "open this course first" signal.

### 2. `src/App.tsx` — `TeacherRedirect`
- Replace the owned-course check with: "does this teacher have any course they own **or** collaborate on?" by also querying `course_teachers` for `teacher_id = user.id`.
- When picking the course to land on, prefer `profiles.active_course_id` if set; otherwise fall back to the first owned course, otherwise the first collaborator course.
- Persist that course id to `localStorage.currentCourseId` (and AppContext via existing patterns) before redirecting, so `useTeacherCourseId` and `useTeacherSetupStatus` immediately resolve to it.
- If the resolved course is one the teacher only collaborates on (not owns), skip the setup-completion gate entirely and send them straight to `/teacher/courses/dashboard`. Owners keep today's behavior (forced into `/teacher/setup` if incomplete).
- Keep the `needs_password_setup` → `/reset-password` step first, unchanged.

### 3. `src/hooks/useTeacherSetupStatus.ts`
- Remove `.eq("teacher_id", user.id)` from the course query. Resolve the active course by `id = currentCourseId` only (it is already authorized via RLS for both owners and collaborators).
- Add an early "is the current user a collaborator (not owner) on this course?" check using `course_teachers`. If yes, treat setup as complete — collaborators should never be locked out of any teacher route. The owner is responsible for the initial setup; collaborators come in to edit an already-set-up course.

### 4. `src/layouts/TeacherLayout.tsx`
- No structural change; with the hook fix above, `isComplete` will be `true` for collaborators and the existing gate will let them through to every nav item (Course Dashboard, Course Assistant, Lesson Plan & Resources, Support, plus all `/teacher/setup/*` sub-pages).
- Verify `CourseSwitcher` already lists collaborator courses (it does — confirmed in code).

## Resulting flow for an approved collaborator

```text
Admin approves → invite email sent → teacher clicks link
  → /reset-password (sets password, clears needs_password_setup)
  → signs in
  → /teacher → TeacherRedirect:
       • finds course via course_teachers
       • sets localStorage.currentCourseId = assigned course
       • redirects to /teacher/courses/dashboard
  → Course Dashboard renders for the assigned course
  → All sidebar items unlocked; every setup stage is editable
       (RLS via is_course_member already permits writes)
```

## Out of scope

- No DB migrations needed (RLS already supports collaborator edits across all relevant tables).
- No changes to admin UI, owner_swap flow semantics, or student-facing routes.