## Goal
Enforce single-attempt per practice exam. After a student submits an attempt for a given `exam_id`, that exam is excluded from their available pool and cannot be started again.

## Changes

### 1. `src/pages/student/AIChat.tsx` — exclude attempted exams from the pool
In `loadAvailableExamIds`, after computing `activeIds` from `course_exams`, also fetch the student's prior attempts:

```ts
supabase
  .from("assessment_results")
  .select("exam_id")
  .eq("course_id", enrolledCourseId)
  .eq("student_id", user.id)
  .eq("assessment_type", "exam")
  .not("exam_id", "is", null)
```

Build `attemptedIds = new Set(...)` and filter the final `ids` list to exclude any exam already in `attemptedIds`. Re-run this loader after each exam submission so the pool refreshes (call `loadAvailableExamIds()` inside the existing submit/finish handler that writes to `assessment_results`).

Also reset `nextExamIndex` to 0 whenever the available list shrinks past it (clamp `idx = nextExamIndex % ids.length` already handles wrap, but persist the clamped value).

### 2. `src/pages/student/AIChat.tsx` — guard `handleStartExamWithSettings`
If `ids.length === 0` after filtering, short-circuit with a toast: "You've completed every practice exam your professor published. Check Performance for your results." Do not call `consumeNextExamId` or insert anything.

### 3. `src/components/ExamPrepPanel.tsx` — UI copy and disabled state
- Replace the "you can retake it as often as you like" copy with single-attempt language, e.g. `"1 practice exam available — you can attempt each exam once."` and for the multi-exam case `"${examCount} practice exam${s} remaining — each exam can only be attempted once."`
- When `examCount === 0`, render a muted state: "All practice exams completed. Review your Performance dashboard." and disable the Start button.
- Remove the rotation phrasing about "rotates to the next one" — replace with "next up: Exam X" where X is derived from the remaining list.

### 4. No DB migration
The existing `assessment_results` row already stores `student_id`, `course_id`, `exam_id`, and `assessment_type='exam'` — sufficient to detect prior attempts. No uniqueness constraint added (defense-in-depth could be a follow-up; out of scope).

## Verification
- Playwright as student on a course with 2 published exams: Start Exam → complete → confirm panel now shows "1 remaining" and only the un-attempted exam launches. Complete the second → confirm Start is disabled with "All completed" copy.
- Confirm `assessment_results` rows accumulate as before; mastery still updates on the (single) attempt.
- Re-loading the page reflects the same disabled state (data-driven, not local state).

## Out of scope
- Teacher-side override to allow resets.
- DB-level uniqueness constraint on `(student_id, exam_id)`.
- Changes to weekly quiz retake behavior.