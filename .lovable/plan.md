# Project Lab setup step for professors

Add an optional eighth step to Course Setup where professors author the labs their students see, with admin control over which professors get the step, and make the student Project Lab page render those labs instead of the hardcoded list.

## How it works

**Admin (per teacher)**
- In the teacher profile dialog, a new "Project Lab (setup step)" toggle is added alongside the existing page-permission checkboxes.
- Off by default. When off, the professor never sees the Project Lab card in Course Setup.

**Professor (`/teacher/setup/project-lab`)**
- New card on `/teacher/setup`, positioned after Generate Lesson Plan. Locked until Lesson Plan is Complete. Never blocks overall setup completion — status badge is informational only.
- The step opens a lab manager for the active course:
  - Start from the three built-in labs (Jail Breaking, Build a Working Game, Eye Exam for LLMs) via a "Add starter lab" picker, or create a lab from scratch.
  - Per lab: title, summary, tags, mission, optional caution note, optional "What you'll learn" list, and an ordered list of steps.
  - Per step: title, body text, optional external link, optional prompt blocks, optional tiles, optional checklist items, optional footnote — the same shapes the student page already renders.
  - Reorder labs and steps, duplicate, delete, and toggle each lab published/unpublished.
- Changes save to the database per course.

**Student (`/student/project-lab`)**
- Renders published labs for the active course, in the professor's order, using the existing card/expand UI.
- If the course has no published labs, the "Project Lab" item is hidden from the student sidebar and the route redirects home. No empty state.

## Technical details

**Database (one migration)**
- `public.course_project_labs`: `id`, `course_id` (FK courses), `position` int, `title`, `summary`, `tags` text[], `mission`, `caution`, `learnings` text[], `steps` jsonb (array of step objects), `published` bool default false, `created_at`, `updated_at` + updated-at trigger.
- Grants: `SELECT, INSERT, UPDATE, DELETE` to `authenticated`; `ALL` to `service_role`. No anon grant.
- RLS: course members (`public.is_course_member(course_id, auth.uid())`) can do everything; enrolled students can read rows where `published = true` and they have an `enrollments` row for the course.

**Frontend**
- `src/config/projectLabTemplates.ts` — the three current hardcoded labs moved out of `StudentProjectLab.tsx` and reused as starter templates in the professor editor.
- `src/pages/teacher/ProjectLabSetup.tsx` — new step page using the shared `SetupModuleNav`; marks the step opened/completed through `src/lib/setupProgress.ts` (`projectLabId = "project-lab"`, course-scoped).
- `src/pages/teacher/CourseSetup.tsx` — add the `project-lab` card definition, status derivation (Complete when ≥1 published lab exists), locking after `lesson-plan`, and filter the card out unless the admin grant is present.
- `src/App.tsx` — route `/teacher/setup/project-lab`.
- `src/hooks/useTeacherNavPermissions.ts` — add a helper for exact-match setup-step grants so `/teacher/setup` alone does not implicitly unlock the Project Lab step.
- `src/components/admin/TeacherProfileDialog.tsx` — render the extra toggle and persist `/teacher/setup/project-lab` into `allowed_paths`.
- `src/hooks/useCourseProjectLabs.ts` — shared fetch used by the student page and the sidebar visibility check.
- `src/pages/student/StudentProjectLab.tsx` — read labs from the hook; keep the existing visual design.
- `src/layouts/StudentLayout.tsx` — hide the Project Lab nav item when the active course has no published labs.

**Notes and risks**
- Existing hardcoded labs stop showing for every course once the page becomes data-driven. To avoid a regression for courses already using them, the migration seeds the three starter labs as `published = true` for courses that currently have enrolled students; new courses start empty.
- `teacher_nav_permissions.allowed_paths` currently grants by prefix. The new step relies on an exact-match check, which does not change behaviour for any existing path.
- Free-form professor text is rendered as plain text (no HTML injection); external links open with `rel="noopener noreferrer"`.
