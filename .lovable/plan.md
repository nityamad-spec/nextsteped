## Diagnosis

The status shown on `/teacher/setup` (Upload = In Progress, Concept Review = Not Started/Locked, all others Locked) is **inaccurate** for "global economics".

### Actual ground truth in the database

Course `global economics` (`fde21ef0-44a7-4b73-a08c-2b2220f79ee7`, code `GECO`, owner `teacher.nextstep@gmail.com`):

| Step | Real state | Should display |
|---|---|---|
| Upload Course Materials | `syllabus_json_path` set + `approved-syllabus.json` present in bucket + `teacher_setup_progress.upload.completed_at` 2026-05-05 16:33 | **Complete** |
| Concept Review | 78 rows in `concepts` + completed_at 2026-05-05 16:36 | **Complete** |
| Generate Lesson Plan | `lesson_plan_published_at` 2026-05-06 09:19, `published-plan.json` in bucket, completed_at 2026-05-06 09:19 | **Complete** |
| Approve Diagnostic Quiz | 0 rows in `diagnostic_questions` | Not Started |
| AI Assistant Settings | no row in `course_ta_settings` | Not Started |
| Exam Mode | no row in `course_ta_settings` | Not Started |
| Enrollment | no completed flag | Not Started |

### Root cause

`useTeacherCourseId` reads `localStorage.currentCourseId` and never validates that the id still resolves to a course the teacher can access. There is a stale id in `teacher_setup_progress` for `d63e04bf-581a-40a8-bed8-a8d7c8b3ffb1` (no longer in `courses` — deleted course), and the session's `currentCourseId` is almost certainly that ghost id (or another stale one). When `CourseSetup` runs:

1. `fetchStepProgress(uid, ghostId)` returns `{ opened: { upload: true } }` (the orphan row).
2. The syllabus check `courses.select(syllabus_json_path).eq(id, ghostId)` returns no row → `syllabusJsonExists = false` → Upload = "In Progress".
3. Concept/lesson/diagnostic queries all key off the ghost id → empty → everything downstream locked.

So the Course Setup page is rendering for a deleted course, not for "global economics". The `CourseSwitcher` header still reads "global economics" because its persisted `currentCourse` object can be out of sync with the localStorage id, OR the active course is actually a third deleted entry. Either way, **the gate is the unvalidated id**.

## Plan

### 1. `src/hooks/useTeacherCourseId.ts` — validate the active id before returning it

- After computing the candidate id (from `currentCourse?.id` or `localStorage.currentCourseId`), run a lightweight `courses.select("id").eq("id", candidate).maybeSingle()`.
- If no row comes back (deleted, RLS-hidden, or wrong tenant), clear `localStorage.currentCourseId`, clear AppContext `currentCourse`, and fall through to the existing recovery query (owned course → collaborator course).
- Only return an id once it has been confirmed to exist for this user.
- Cache the validation result in a ref so we don't refetch on every render.

### 2. `src/contexts/AppContext.tsx` — keep persisted course in sync on logout/course-delete

- Already clears on logout. Add: when `useTeacherCourseId` reports the id is stale, expose a setter path it can call (or simply have the hook call `setCurrentCourse(null)` directly, which it already imports).

### 3. Defensive cleanup in `CourseSetup.tsx`

- Before running the status fetch, guard `if (!courseId) { setLoading(false); return; }` — already present, but ensure we don't render stale `statuses` from a previous course when `courseId` flips. Reset `statuses` to all "Not Started" at the top of the effect so the transition from ghost-id → real-id doesn't briefly show wrong badges.

### 4. One-off DB hygiene (migration)

- Delete `teacher_setup_progress` rows whose `course_id` no longer exists in `courses`:
  ```sql
  DELETE FROM public.teacher_setup_progress tsp
  WHERE NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = tsp.course_id);
  ```
- Add an FK `teacher_setup_progress.course_id → courses(id) ON DELETE CASCADE` so future course deletions clean up automatically. Same for `setup_progress_log.course_id` (nullable, `ON DELETE SET NULL` to preserve audit trail).

### Acceptance

- After fix, navigating to `/teacher/setup` while "global economics" is active shows Upload, Concept Review, and Generate Lesson Plan as **Complete**; Diagnostic / AI Settings / Exam Mode / Enrollment as **Not Started** (unlocked from Diagnostic onward per the existing chain).
- A user whose `localStorage.currentCourseId` points at a deleted course is silently migrated to their first owned/collaborator course on next page load.
- Deleting a course in future cleans related `teacher_setup_progress` rows via FK cascade.
