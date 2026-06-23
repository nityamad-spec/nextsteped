## Goal
On `/admin/students`, clicking a student row opens a dialog showing that student's profile: enrolled courses with progress, mastery score, mastery level, and completion status.

## UX
- Row becomes clickable (cursor-pointer). Clicking anywhere except the existing Courses collapsible button or the Delete (⋯) menu opens the dialog.
- Existing inline "Courses" collapsible and Delete menu continue to work unchanged.
- Dialog header: student name, email, roll number, joined date.
- Dialog body: a card per enrolled course with:
  - Course name
  - **Mastery score** (0–100, from `student_course_mastery.mastery_score`)
  - **Mastery level** (`learner_level`: beginner / developing / proficient / expert) as a colored badge
  - **Progress** — % of lesson plan weeks reached based on course date (reuse existing `lessonPlanWeeks` helper logic — weeks completed / total weeks)
  - **Completion status** — "Complete" if all weekly quizzes + all exams submitted, else "In progress (X/Y quizzes, A/B exams)"
- Empty state if no enrollments.
- Loading skeleton while the per-student data loads (fetched lazily on open).

## Data sources (read-only)
- `enrollments` + `courses` — already fetched on the page; reuse from `StudentGroup.courses`.
- `student_course_mastery` (course_id, student_id) → `mastery_score`, `learner_level`.
- `lesson_plan_weeks` (course_id) → total weeks; `is_exam_week` to count expected exams; total weekly quizzes = non-exam weeks.
- `assessment_results` (student_id, course_id):
  - weekly quizzes submitted = distinct `quiz_day` where `mode = 'weekly_quiz'`
  - exams submitted = count where `mode IN ('exam','practice_exam')` (use `'exam'` for completion; keep "practice" out of required count)
- Course "progress" = visible/elapsed weeks vs total weeks (computed via existing `src/lib/lessonPlanWeeks.ts` against `courses.start_date`).

All queries scoped per student × course and run only when dialog opens (one batched fetch per click, cached in component state for the session).

## Technical notes
- New component: `src/components/admin/StudentProfileDialog.tsx`.
- In `AdminStudents.tsx`:
  - Add `selectedStudent` state and `onClick` on `<TableRow>` (with `e.stopPropagation` on the Courses Collapsible trigger and the Delete dropdown to avoid double-open).
  - Render `<StudentProfileDialog student={selectedStudent} open={!!selectedStudent} onOpenChange={...} />`.
- Dialog fetches:
  ```ts
  // for each courseId in student.courses:
  supabase.from('student_course_mastery').select('mastery_score,learner_level').eq('student_id', primaryProfileId).in('course_id', ids)
  supabase.from('lesson_plan_weeks').select('course_id, week_number, is_exam_week').in('course_id', ids)
  supabase.from('assessment_results').select('course_id, mode, quiz_day').eq('student_id', primaryProfileId).in('course_id', ids)
  supabase.from('courses').select('id, start_date, duration_weeks').in('id', ids)
  ```
- Completion logic per course:
  - `quizzesDone = distinct quiz_day from weekly_quiz results`
  - `quizzesTotal = lesson_plan_weeks where is_exam_week = false`
  - `examsDone = count of mode='exam' results`
  - `examsTotal = lesson_plan_weeks where is_exam_week = true`
  - `complete = quizzesDone >= quizzesTotal && examsDone >= examsTotal && quizzesTotal+examsTotal > 0`
- Mastery level colors reuse the four-tier palette already used elsewhere (`MASTERY_ORDER`).

## Scope
- Frontend only. No schema changes, no edge functions.
- No changes to what's shown to students/professors — this is admin-only.
