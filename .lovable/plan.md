# Per-course student suspension

Today suspension is account-wide: it sets a flag on the student's profile and blocks sign-in entirely, so a student enrolled in two courses loses both. This adds a second, finer level: suspend a student from one specific course while leaving their other courses working.

## Behaviour

- Account suspension stays exactly as it is today (blocks sign-in, all courses).
- New course-level suspension is stored on the enrollment, so it applies to one course only.
- A student suspended from a course still sees that course in their course switcher, greyed out with a "Suspended — contact your professor" note. Selecting it shows a locked state instead of the dashboard; quizzes, exams, chat and project lab are not reachable for that course.
- If every course a student is enrolled in is suspended, they can still sign in and simply see the locked state (no change to sign-in rules).

## Admin UI (/admin/students)

- Expanded student row: each listed course gets a suspend / reactivate control plus a "Suspended" badge when applicable.
- Row action menu keeps the existing account-wide Suspend access item, relabelled so the two levels are unambiguous ("Suspend all access" vs per-course).
- Bulk selection: a new "Suspend in course…" bulk action asks which course, then suspends the selected students in that course only (skipping students not enrolled in it). A matching bulk reactivate.
- Status filter gains awareness of course-level suspension so partially suspended students are visible.

## Technical notes

- Migration: add `suspended_at timestamptz` and `suspended_by uuid` to `public.enrollments`. No new table; RLS on enrollments already exists and only needs a policy check that admins can update these columns.
- New edge function `admin-set-enrollment-suspension` mirroring `admin-set-student-suspension`: admin-only, validates `student_id` + `course_id` + `suspended`, updates the enrollment row. No global sign-out — the student keeps their session for other courses.
- Client gating: `useEnrolledCourseId`, `useStudentStatus` and `StudentCourseSwitcher` read `enrollments.suspended_at`. The switcher still lists suspended courses (disabled styling); the resolver never auto-selects a suspended course as the fallback active course.
- A shared `useCourseAccess` check drives a single `CourseSuspendedNotice` screen rendered by `StudentLayout` when the active course is suspended, so every student route is covered in one place rather than page by page.
- Admin list query loads `suspended_at` per enrollment so the table can render per-course state.

## Risks

- Server-side enforcement: the locked state is client-side. Row-level policies on quiz/result tables are not currently keyed to enrollment suspension, so a determined user could still hit the API. If you want hard enforcement, that's a follow-up pass over the RLS policies — say the word and I'll include it.
- Student data (results, mastery) is untouched by suspension, so reactivating restores everything.
