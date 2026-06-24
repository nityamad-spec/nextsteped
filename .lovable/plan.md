## Goal

Replace the destructive "Delete mock test" flow on `/teacher/setup/exam-mode` with a soft-delete / archive flow that:

- Preserves every AI-generated and manual question tied to the exam.
- Preserves every student submission in `assessment_results` and keeps it linkable back to the specific exam.
- Scopes exams per course (so identical labels like "Final 1" across two courses never collide).
- Lets the professor view archived exams and restore them.

## Current state (why this is needed)

- Exams today live only as JSON inside `course_ta_settings.examSchedule` — they have no row, no FK, and no per-course uniqueness beyond the random id.
- `assessment_questions.exam_id` is a free-form `text` column populated with that client-generated id.
- `assessment_results` has **no `exam_id**` — submissions are matched to a course + `mode='exam'` only. After delete, `question_ids` in the JSON point to rows that may or may not still exist, and there's no way to know which exam a past attempt belonged to.

## Plan

### 1. New table: `public.course_exams` (canonical exam record)

One row per exam, per course. Becomes the source of truth instead of the JSON blob.

Columns (domain-specific): `course_id`, `label` (e.g. "Final 1"), `kind` ('midterm' | 'final'), `length_min`, `breakdown` (jsonb), `source` ('generated' | 'manual'), `approved`, `position` (int, for ordering), `archived_at`, `archived_by`.

Constraints:

- `UNIQUE (course_id, id)` — id is the same text id already used in `examSchedule`, so existing `assessment_questions.exam_id` rows keep working.
- `UNIQUE (course_id, label) WHERE archived_at IS NULL` — prevents duplicate active labels within a course; archived rows are exempt so old "Final 1" can coexist with a new "Final 1".

RLS: course members (teacher + collaborators) full CRUD; students can `SELECT` non-archived rows for their enrolled course.

### 2. Tie submissions to a specific exam

Add `exam_id text` to `assessment_results` (nullable, indexed). Going forward the student exam runner writes it on submit.

Backfill: for each existing `assessment_results` row with `mode='exam'`, look up `assessment_questions.exam_id` for the first id in `question_ids` jsonb that resolves to a row, and copy it in. Rows that can't be resolved stay null (orphaned, but no data loss).

### 3. Migrate `examSchedule` JSON → `course_exams`

One-time SQL: for each course, expand `course_ta_settings.exam_schedule` into rows in `course_exams` using the existing item id, label (regenerated as "Final N" by array order), kind, length, breakdown, approved, source. Then the app reads/writes `course_exams` directly; the JSON column stays untouched as a fallback for one release, then is removed in a follow-up.

### 4. Archive flow (replaces hard delete)

UI change on `ExamMode.tsx`:

- Rename the trash action to **Archive** with a confirm dialog explaining: "Questions and student submissions are preserved. You can restore this exam later."
- `executeDeleteExam` → `executeArchiveExam`: sets `archived_at = now()`, `archived_by = auth.uid()` via update on `course_exams`. **Does not** call `cleanupExamQuestions` — questions stay intact and attached.
- Remove the "must keep at least one mock test" rule (archived exams still count as history; we just guard the active list so the student-facing scheduler shows the active set).

### 5. Archived view + restore

Add an "Archived mock tests" collapsible section under the schedule list:

- Lists archived exams with label, archived date, question count, and submission count (`COUNT(*) FROM assessment_results WHERE exam_id = ...`).
- **Restore** button: clears `archived_at`/`archived_by`. If restoring would violate the active-label uniqueness, auto-rename to next available "Final N" and toast the change.
- **View questions** opens the existing `ExamQuestionsViewDialog` in read-only mode.
- No permanent delete in this iteration — keeps the door open without risking destructive mistakes.

### 6. Student-facing impact

Exam list query in the student runner already filters by course; add `archived_at IS NULL` so archived exams disappear from "available exams" but past submissions remain visible in `ExamHistory` (which reads `assessment_results` directly and is unaffected).

### 7. Analytics impact

`AssessmentAnalytics` and any teaching-insights queries that group by exam should now join `course_exams` on `(course_id, exam_id)` so archived attempts still render with their original label rather than "unknown".

## Files touched

- New migration: create `course_exams`, add `assessment_results.exam_id`, backfill, GRANTs, RLS, indexes.
- `src/pages/teacher/ExamMode.tsx` — switch storage layer, rename delete → archive, add archived section + restore.
- `src/hooks/useTASettings.ts` — read/write `course_exams` instead of (or alongside) `examSchedule`.
- Student exam submission path (in the assessment runner) — write `exam_id` into `assessment_results`.
- `src/components/ExamHistory.tsx` / `AssessmentAnalytics.tsx` — surface exam label from `course_exams`.

## Open questions

1. Should archived exams be auto-purged after some period (e.g. end of semester + 1 year), or kept indefinitely until a teacher explicitly purges? kept indefinitely
2. When restoring an exam whose label collides, prefer auto-rename (proposed) or block with an error and ask the teacher to rename first? auto-rename
3. Should students see "This exam was archived" on their past attempt in `ExamHistory`, or render it identically to active attempts?  "This exam was archived"