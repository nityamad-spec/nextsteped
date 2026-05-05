# Fix: `teacher_setup_progress.completed_at` not persisted reliably

## Root cause (not RLS)

DB inspection confirms RLS works — completed rows exist for a previously-completed course. The real issue is that today only `ai-settings` and `enrollment` call `markStepCompleted` from their own pages. The other five auto-derived steps rely on the backfill loop inside `CourseSetup.tsx`, which fires **only when the teacher revisits `/teacher/setup`**. A teacher who proceeds linearly through Next buttons / sidebar nav never triggers it, so `completed_at` stays `NULL` even when the underlying tables (`courses.syllabus_json_path`, `concepts`, `lesson_plan_published_at`, `diagnostic_questions`, `course_ta_settings`) say the step is done.

## Fix

Mark each step complete at the exact moment its source-of-truth is written. The existing backfill in `CourseSetup.tsx` stays as a safety net.

### 1. `upload` — `src/components/FileUploadZone.tsx`
In `parseSyllabusInBackground`, immediately after the successful `courses.update({ syllabus_json_path })` (line 150-153), call:
```ts
if (user?.id) void markStepCompleted(user.id, "upload", courseId);
```
(Add `markStepCompleted` import and use existing `useAuth()` to get `user`.)

### 2. `concept-review` — `src/pages/teacher/ConceptReview.tsx`
In the handler that confirms/saves concepts (the path that inserts the first concept row), call `markStepCompleted(user.id, "concept-review", courseId)` after the successful insert. Also add it to `ConceptManagement.tsx`'s save path so manual edits keep it accurate.

### 3. `lesson-plan` — `src/pages/teacher/TeachingPlan.tsx`
In the publish handler (the one that writes `lesson_plan_published_at` / `lesson_plan_path`), call `markStepCompleted(user.id, "lesson-plan", courseId)` after the successful publish.

### 4. `diagnostic` — `src/pages/teacher/DiagnosticQuestionsSetup.tsx`
After the save handler that inserts `diagnostic_questions` rows succeeds, call `markStepCompleted(user.id, "diagnostic", courseId)`.

### 5. `exam-mode` — `src/pages/teacher/ExamMode.tsx`
After the save handler that toggles `course_ta_settings.exam_enabled` or `exam_approved` succeeds, call `markStepCompleted(user.id, "exam-mode", courseId)`.

All calls are fire-and-forget (`void`), match the existing pattern in `AIAssistantAndSettings.tsx` / `EnrollmentSettings.tsx`, and remain idempotent thanks to the `(teacher_id, course_id, step_id)` unique upsert in `markStepCompleted`.

## Why not change the backfill instead

Backfill would still require the teacher to revisit `/teacher/setup`. Writing at the source-of-truth moment guarantees the column is accurate the instant the work is done, regardless of navigation order. The existing backfill loop stays as a safety net for legacy rows and edge cases.

## Out of scope
- No schema changes, no RLS changes (verified working).
- No changes to `ai-settings` / `enrollment` (already correct).
- No SQL backfill migration (existing CourseSetup loop handles legacy rows on next visit).
